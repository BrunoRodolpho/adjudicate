import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  adjudicate,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  type AuditRecord,
  type PolicyBundle,
} from "@adjudicate/core";
import { runReplay } from "../src/commands/replay.js";
import type { CliReplayReport } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-replay-fixtures");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);

interface DynamicPack {
  readonly policy: PolicyBundle<string, unknown, unknown>;
  readonly rehydrateState?: (raw: unknown) => unknown;
}

let pixPack: DynamicPack;

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  // Load the PIX pack dynamically so we can capture the live decision
  // the current policy emits — the test verifies that classify() sees
  // a byte-identical match, including the basis array.
  const mod = (await import(pathToFileURL(PIX_INDEX).href)) as {
    paymentsPixPack: DynamicPack;
  };
  pixPack = mod.paymentsPixPack;
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

// Deterministic, replay-distinct nonce source. A stable incrementing
// counter keeps each minted envelope's nonce unique within the run while
// staying byte-identical across runs (unlike Math.random()), so the
// replay fixtures these envelopes feed are reproducible.
let nonceCounter = 0;

function envelope(kind: string, payload: unknown): ReturnType<typeof buildEnvelope> {
  return buildEnvelope({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "test-replay" },
    taint: "UNTRUSTED",
    nonce: `n-${++nonceCounter}`,
  });
}

describe("replay — verification against current Pack policy", () => {
  it("matches when the historic decision aligns with current policy (charge.create defers)", async () => {
    const env = envelope("pix.charge.create", {
      amountCentavos: 1000,
      payerDocument: "12345678901",
      description: "x",
    });
    // Capture the live decision the current policy produces; we want a
    // record whose stored decision matches byte-identically so the
    // classifier sees no drift.
    const state = pixPack.rehydrateState
      ? pixPack.rehydrateState({})
      : {};
    const liveDecision = adjudicate(env, state, pixPack.policy);
    const record: AuditRecord = buildAuditRecord({
      envelope: env,
      decision: liveDecision,
      durationMs: 1,
    });
    const recordPath = path.join(FIXTURES_DIR, "matching.json");
    await fs.writeFile(recordPath, JSON.stringify([record], null, 2));

    const lines: string[] = [];
    await runReplay({
      pack: PIX_INDEX,
      records: recordPath,
      format: "json",
      stdout: (l) => lines.push(l),
    });
    const report = JSON.parse(lines.join("\n")) as {
      total: number;
      matched: number;
      mismatches: unknown[];
    };
    expect(report.total).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.mismatches).toHaveLength(0);
  });

  it("flags a mismatch and exits 1 when current policy diverges", async () => {
    // Stored decision EXECUTE; current policy will not produce EXECUTE
    // for a fresh charge.create (it defers awaiting webhook).
    const env = envelope("pix.charge.create", {
      amountCentavos: 1000,
      payerDocument: "12345678901",
      description: "x",
    });
    const record: AuditRecord = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([]),
      durationMs: 1,
    });
    const recordPath = path.join(FIXTURES_DIR, "diverging.json");
    await fs.writeFile(recordPath, JSON.stringify([record], null, 2));

    const lines: string[] = [];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runReplay({
          pack: PIX_INDEX,
          records: recordPath,
          format: "json",
          stdout: (l) => lines.push(l),
        }),
      ).rejects.toThrow(/process.exit:1/);
      const report = JSON.parse(lines.join("\n")) as {
        matched: number;
        mismatches: Array<{ kind: string }>;
      };
      expect(report.matched).toBe(0);
      expect(report.mismatches.length).toBeGreaterThan(0);
      expect(report.mismatches[0]!.kind).toBe("DECISION_KIND");
    } finally {
      exitSpy.mockRestore();
    }
  });
});

// APIReviewer-002: the CLI's report type is exported as `CliReplayReport`
// (renamed from `ReplayReport`) to avoid colliding with the differently
// shaped `@adjudicate/audit` `ReplayReport`. This pins the new name and the
// CLI-specific `pack` + `errored` fields that distinguish the two shapes.
describe("replay — CliReplayReport report shape", () => {
  it("emits a report assignable to CliReplayReport (pack + errored present)", async () => {
    const env = envelope("pix.charge.create", {
      amountCentavos: 1000,
      payerDocument: "12345678901",
      description: "x",
    });
    const state = pixPack.rehydrateState ? pixPack.rehydrateState({}) : {};
    const liveDecision = adjudicate(env, state, pixPack.policy);
    const record: AuditRecord = buildAuditRecord({
      envelope: env,
      decision: liveDecision,
      durationMs: 1,
    });
    const recordPath = path.join(FIXTURES_DIR, "shape.json");
    await fs.writeFile(recordPath, JSON.stringify([record], null, 2));

    const lines: string[] = [];
    await runReplay({
      pack: PIX_INDEX,
      records: recordPath,
      format: "json",
      stdout: (l) => lines.push(l),
    });

    // `satisfies` ties this assertion to the renamed type: if the export
    // reverted to `ReplayReport` (or dropped the CLI-only fields), this
    // would fail to compile.
    const report = JSON.parse(lines.join("\n")) as CliReplayReport;
    const checked = report satisfies CliReplayReport;
    expect(checked.pack).toBe("pack-payments-pix");
    expect(Array.isArray(checked.errored)).toBe(true);
    expect(checked.total).toBe(1);
    expect(checked.matched).toBe(1);
    expect(checked.mismatches).toHaveLength(0);
  });
});

// ─── Conformance gate (SecurityReviewer-006) ───────────────────────────────

describe("replay — kernel conformance gate", () => {
  it("rejects a structurally-valid but non-conformant pack before replaying", async () => {
    // Passes the loader's `isLikelyPack` (intents+policy+contract) and
    // `isLoadedPack` (id+policy) structural checks, but fails
    // `assertPackConformance`: no `version`, no `planner`, empty `basisCodes`.
    const badPackPath = path.join(FIXTURES_DIR, "bad-pack-replay.ts");
    await fs.writeFile(
      badPackPath,
      `export const badPack = {
        id: "bad-replay",
        contract: "v0",
        intents: ["x.do"],
        basisCodes: [],
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: undefined,
          business: [],
          default: "REFUSE",
        },
      };
`,
      "utf8",
    );

    // A minimal records file; the conformance check must fire before any
    // record is replayed, so its contents are irrelevant.
    const recordPath = path.join(FIXTURES_DIR, "bad-records.json");
    await fs.writeFile(recordPath, "[]");

    const outLines: string[] = [];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runReplay({
          pack: badPackPath,
          records: recordPath,
          format: "json",
          stdout: (l) => outLines.push(l),
        }),
      ).rejects.toThrow(/process.exit:1/);
      expect(outLines.join("\n")).toMatch(/Pack conformance failed/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
