import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runScenariosGenerate } from "../src/commands/scenarios-generate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-scenarios-generate-fixtures");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

describe("scenarios generate — output files", () => {
  it("writes count*kinds files under --output", async () => {
    const outDir = path.join(FIXTURES_DIR, "out1");
    await fs.mkdir(outDir, { recursive: true });

    const lines: string[] = [];
    await runScenariosGenerate({
      pack: PIX_INDEX,
      output: outDir,
      count: 2,
      stdout: (l) => lines.push(l),
    });

    const files = await fs.readdir(outDir);
    // 3 PIX intent kinds × 2 = 6 files
    expect(files).toHaveLength(6);
    expect(files.some((f) => f.startsWith("pix_charge_create-1"))).toBe(true);
    expect(files.some((f) => f.startsWith("pix_charge_refund-2"))).toBe(true);
    expect(lines.join("\n")).toMatch(/Wrote 6/);
  });

  it("emits canonical scenario shape — intent + state", async () => {
    const outDir = path.join(FIXTURES_DIR, "out2");
    await fs.mkdir(outDir, { recursive: true });
    await runScenariosGenerate({
      pack: PIX_INDEX,
      output: outDir,
      count: 1,
      stdout: () => {
        // ignore
      },
    });

    const files = await fs.readdir(outDir);
    const sample = await fs.readFile(path.join(outDir, files[0]!), "utf8");
    const parsed = JSON.parse(sample) as {
      intent: {
        kind: string;
        payload: unknown;
        actor: { principal: string; sessionId: string };
        taint: string;
        nonce: string;
        createdAt: string;
      };
      state: unknown;
    };
    expect(parsed.intent.kind).toMatch(/^pix\./);
    expect(parsed.intent.actor.principal).toBe("llm");
    expect(parsed.intent.taint).toBe("UNTRUSTED");
    expect(parsed.intent.nonce).toMatch(/^[0-9a-f-]+$/);
    expect(parsed.state).toBeDefined();
  });

  it("is deterministic across runs with the same seed", async () => {
    const dir1 = path.join(FIXTURES_DIR, "det-a");
    const dir2 = path.join(FIXTURES_DIR, "det-b");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    await runScenariosGenerate({
      pack: PIX_INDEX,
      output: dir1,
      count: 1,
      seed: 99,
      stdout: () => {
        // ignore
      },
    });
    await runScenariosGenerate({
      pack: PIX_INDEX,
      output: dir2,
      count: 1,
      seed: 99,
      stdout: () => {
        // ignore
      },
    });

    const a = await fs.readFile(
      path.join(dir1, "pix_charge_create-1.json"),
      "utf8",
    );
    const b = await fs.readFile(
      path.join(dir2, "pix_charge_create-1.json"),
      "utf8",
    );
    expect(a).toBe(b);
  });

  it("fails when --output dir does not exist", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        runScenariosGenerate({
          pack: PIX_INDEX,
          output: path.join(FIXTURES_DIR, "nonexistent-dir"),
          stdout: () => {
            // ignore
          },
        }),
      ).rejects.toThrow(/process.exit:1/);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
