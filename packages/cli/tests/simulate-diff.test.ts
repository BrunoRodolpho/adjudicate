import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runSimulate } from "../src/commands/simulate.js";
import {
  computeExitCode,
  listScenarios,
  runDiff,
} from "../src/lib/simulate-diff.js";
import { loadPackFromModule } from "../src/lib/pack-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);

const SCENARIOS_DIR = path.join(__dirname, ".test-diff-scenarios");

function capture() {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => lines.push(line),
    joined: () => lines.join("\n"),
  };
}

async function writeScenario(filename: string, body: unknown): Promise<string> {
  const filePath = path.join(SCENARIOS_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(body, null, 2), "utf8");
  return filePath;
}

const pixActor = { principal: "llm", sessionId: "sess" };

function refundScenario(refundCentavos: number, expectedKind?: string) {
  return {
    intent: {
      kind: "pix.charge.refund",
      payload: { chargeId: "c-1", refundCentavos, reason: "x" },
      actor: pixActor,
      taint: "UNTRUSTED",
      nonce: `n-${refundCentavos}`,
    },
    state: {
      charges: {
        "c-1": { id: "c-1", amountCentavos: 200_000, status: "confirmed" },
      },
    },
    ...(expectedKind ? { expected: { kind: expectedKind } } : {}),
  };
}

beforeAll(async () => {
  await fs.rm(SCENARIOS_DIR, { recursive: true, force: true });
  await fs.mkdir(SCENARIOS_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(SCENARIOS_DIR, { recursive: true, force: true });
});

// ─── Walker ────────────────────────────────────────────────────────────────

describe("listScenarios — directory walker", () => {
  it("returns alphabetically-sorted *.json paths, skipping hidden and non-json", async () => {
    const dir = path.join(SCENARIOS_DIR, "walker");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "b-second.json"), "{}", "utf8");
    await fs.writeFile(path.join(dir, "a-first.json"), "{}", "utf8");
    await fs.writeFile(path.join(dir, ".hidden.json"), "{}", "utf8");
    await fs.writeFile(path.join(dir, "readme.md"), "skip", "utf8");

    const found = await listScenarios(dir);
    expect(found.map((f) => path.basename(f))).toEqual([
      "a-first.json",
      "b-second.json",
    ]);
  });

  it("returns an empty array for an empty directory", async () => {
    const dir = path.join(SCENARIOS_DIR, "empty");
    await fs.mkdir(dir, { recursive: true });
    const found = await listScenarios(dir);
    expect(found).toEqual([]);
  });
});

// ─── Orchestration ─────────────────────────────────────────────────────────

describe("runDiff — orchestration", () => {
  it("classifies every per-scenario outcome correctly", async () => {
    const dir = path.join(SCENARIOS_DIR, "classify");
    await fs.mkdir(dir, { recursive: true });

    // EXECUTE (1000 < 50_000 confirm threshold) — expected EXECUTE → match
    await fs.writeFile(
      path.join(dir, "small-execute.json"),
      JSON.stringify(refundScenario(1_000, "EXECUTE")),
      "utf8",
    );
    // ESCALATE (>= 100_000) — expected REFUSE → mismatch
    await fs.writeFile(
      path.join(dir, "large-mismatch.json"),
      JSON.stringify(refundScenario(150_000, "REFUSE")),
      "utf8",
    );
    // REQUEST_CONFIRMATION (>=50_000) — no expected → advisory
    await fs.writeFile(
      path.join(dir, "medium-advisory.json"),
      JSON.stringify(refundScenario(60_000)),
      "utf8",
    );
    // Malformed JSON → error
    await fs.writeFile(
      path.join(dir, "broken.json"),
      "{ not valid",
      "utf8",
    );

    const pack = (await loadPackFromModule(PIX_INDEX, REPO_ROOT)) as {
      readonly id: string;
      readonly policy: unknown;
      readonly rehydrateState?: (raw: unknown) => unknown;
    };
    const paths = await listScenarios(dir);
    const report = await runDiff(pack, paths);

    expect(report.summary).toEqual({
      total: 4,
      matched: 1,
      changed: 1,
      advisory: 1,
      errors: 1,
    });

    const byName = new Map(report.results.map((r) => [r.scenario, r]));
    expect(byName.get("small-execute")?.status).toBe("match");
    expect(byName.get("small-execute")?.decision).toBe("EXECUTE");
    expect(byName.get("large-mismatch")?.status).toBe("mismatch");
    expect(byName.get("large-mismatch")?.decision).toBe("ESCALATE");
    expect(byName.get("large-mismatch")?.expected).toBe("REFUSE");
    expect(byName.get("medium-advisory")?.status).toBe("advisory");
    expect(byName.get("medium-advisory")?.decision).toBe(
      "REQUEST_CONFIRMATION",
    );
    expect(byName.get("broken")?.status).toBe("error");
  });
});

// ─── Exit code policy ──────────────────────────────────────────────────────

describe("computeExitCode — exit policy", () => {
  it("returns 0 when no changes and no errors", () => {
    expect(
      computeExitCode({
        total: 2,
        matched: 1,
        changed: 0,
        advisory: 1,
        errors: 0,
      }),
    ).toBe(0);
  });

  it("returns 2 when any mismatch (mismatch wins over errors)", () => {
    expect(
      computeExitCode({
        total: 3,
        matched: 1,
        changed: 1,
        advisory: 0,
        errors: 1,
      }),
    ).toBe(2);
  });

  it("returns 1 when errors and no mismatch", () => {
    expect(
      computeExitCode({
        total: 2,
        matched: 1,
        changed: 0,
        advisory: 0,
        errors: 1,
      }),
    ).toBe(1);
  });
});

// ─── Command integration ───────────────────────────────────────────────────

describe("runSimulate --scenarios — command integration", () => {
  it("text mode: writes summary table and exits 0 on all-match", async () => {
    const dir = path.join(SCENARIOS_DIR, "cmd-match");
    await fs.mkdir(dir, { recursive: true });
    await writeScenario(
      "cmd-match/01-execute.json",
      refundScenario(1_000, "EXECUTE"),
    );
    await writeScenario(
      "cmd-match/02-escalate.json",
      refundScenario(150_000, "ESCALATE"),
    );

    const cap = capture();
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    try {
      await runSimulate({
        pack: PIX_INDEX,
        scenarios: dir,
        format: "text",
        stdout: cap.write,
      });
      // No exit call — success path
    } catch (err) {
      // unexpected exit
      throw err;
    } finally {
      exit.mockRestore();
    }

    const text = cap.joined();
    expect(text).toContain("01-execute");
    expect(text).toContain("02-escalate");
    expect(text).toContain("EXECUTE");
    expect(text).toContain("ESCALATE");
    expect(text).toMatch(/2 matched/);
  });

  it("text mode: exits 2 when a scenario mismatches", async () => {
    const dir = path.join(SCENARIOS_DIR, "cmd-mismatch");
    await fs.mkdir(dir, { recursive: true });
    await writeScenario(
      "cmd-mismatch/wrong.json",
      refundScenario(150_000, "REFUSE"),
    );

    const cap = capture();
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    let caught: Error | undefined;
    try {
      await runSimulate({
        pack: PIX_INDEX,
        scenarios: dir,
        format: "text",
        stdout: cap.write,
      });
    } catch (err) {
      caught = err as Error;
    } finally {
      exit.mockRestore();
    }

    expect(caught?.message).toBe("__exit:2");
    expect(cap.joined()).toContain("expected");
    expect(cap.joined()).toMatch(/1 changed/);
  });

  it("json mode: emits parseable {summary, results} payload", async () => {
    const dir = path.join(SCENARIOS_DIR, "cmd-json");
    await fs.mkdir(dir, { recursive: true });
    await writeScenario(
      "cmd-json/a.json",
      refundScenario(1_000, "EXECUTE"),
    );
    await writeScenario(
      "cmd-json/b.json",
      refundScenario(150_000, "ESCALATE"),
    );

    const cap = capture();
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    try {
      await runSimulate({
        pack: PIX_INDEX,
        scenarios: dir,
        format: "json",
        stdout: cap.write,
      });
    } finally {
      exit.mockRestore();
    }

    const parsed = JSON.parse(cap.joined()) as {
      pack: { id: string };
      summary: { total: number; matched: number; changed: number };
      results: Array<{ scenario: string; status: string; decision: string }>;
    };
    expect(parsed.pack.id).toBe("pack-payments-pix");
    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.matched).toBe(2);
    expect(parsed.summary.changed).toBe(0);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results.map((r) => r.scenario).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("rejects when both --scenario and --scenarios are passed (only one mode)", async () => {
    const cap = capture();
    const errs: string[] = [];
    const err = vi.spyOn(console, "error").mockImplementation((...args) => {
      errs.push(args.join(" "));
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    let caught: Error | undefined;
    try {
      await runSimulate({
        pack: PIX_INDEX,
        scenario: "ignored.json",
        scenarios: "ignored-dir",
        format: "text",
        stdout: cap.write,
      });
    } catch (e) {
      caught = e as Error;
    } finally {
      err.mockRestore();
      exit.mockRestore();
    }

    expect(caught?.message).toBe("__exit:1");
    expect(errs.join(" ")).toMatch(/Specify exactly one/);
  });
});
