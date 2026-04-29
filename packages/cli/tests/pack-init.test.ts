import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackInit } from "../src/commands/pack-init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Integration test — the "dogfood" verification.
 *
 * Strategy:
 *   1. Scaffold a Pack into `tests/.test-fixtures/<name>/`. This path
 *      lives INSIDE the workspace, so the rendered Pack's
 *      `import { ... } from "@adjudicate/core"` resolves via the
 *      workspace's hoisted node_modules without needing a separate
 *      `pnpm install` in the temp dir.
 *   2. Verify the canonical file layout.
 *   3. Dynamic-import the rendered `src/index.ts`. Vitest's esbuild-
 *      based loader transforms TS at import time.
 *   4. Run the KERNEL's `assertPackConformance` against the loaded
 *      Pack. If conformance passes, the scaffold is correct by the
 *      framework's own definition — single source of truth.
 *
 * Cleanup: `afterAll` rmrf's the fixtures dir.
 */

const FIXTURES_DIR = path.join(__dirname, ".test-fixtures");
const PACK_NAME = "scaffolded-test-pack";
const PACK_DIR = path.join(FIXTURES_DIR, PACK_NAME);

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("pack init — scaffold integration (dogfood)", () => {
  beforeAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await runPackInit(PACK_NAME, { target: FIXTURES_DIR });
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it("renders the canonical file layout", async () => {
    const expected = [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/policy.ts",
      "tests/conformance.test.ts",
    ];
    for (const rel of expected) {
      expect(
        await fileExists(path.join(PACK_DIR, rel)),
        `Expected ${rel} to exist in scaffolded Pack`,
      ).toBe(true);
    }
  });

  it("substitutes placeholders in package.json", async () => {
    const pkg = JSON.parse(
      await fs.readFile(path.join(PACK_DIR, "package.json"), "utf8"),
    ) as { name: string; dependencies: Record<string, string> };
    expect(pkg.name).toBe(PACK_NAME);
    expect(pkg.dependencies["@adjudicate/core"]).toBe("workspace:*");
  });

  it("substitutes placeholders in src/index.ts (no leftover {{...}} markers)", async () => {
    const indexSource = await fs.readFile(
      path.join(PACK_DIR, "src", "index.ts"),
      "utf8",
    );
    expect(indexSource).toContain(`id: "${PACK_NAME}"`);
    expect(indexSource).toContain("ScaffoldedTestPackPack");
    expect(indexSource).toContain("scaffolded-test-pack.demo.create");
    // Sanity: every placeholder MUST have been substituted.
    expect(indexSource).not.toContain("{{");
    expect(indexSource).not.toContain("}}");
  });

  it("substitutes placeholders in src/policy.ts", async () => {
    const source = await fs.readFile(
      path.join(PACK_DIR, "src", "policy.ts"),
      "utf8",
    );
    expect(source).toContain("ScaffoldedTestPackIntentKind");
    expect(source).toContain("scaffolded-test-pack.demo.confirm");
    expect(source).not.toContain("{{");
    expect(source).not.toContain("}}");
  });

  it("scaffolded Pack passes kernel conformance via dynamic import", async () => {
    // Dynamic-import the rendered TS file. Vitest transforms TS at
    // import time; the rendered Pack's `import` of @adjudicate/core
    // resolves via the workspace's hoisted node_modules (the fixture
    // dir is a child of the workspace).
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;

    const pack = mod.ScaffoldedTestPackPack;
    expect(pack).toBeDefined();

    const { assertPackConformance } = await import("@adjudicate/core");
    expect(() => assertPackConformance(pack as never)).not.toThrow();
  });

  it("scaffolded Pack declares the expected intent kinds", async () => {
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;
    const pack = mod.ScaffoldedTestPackPack as {
      intents: readonly string[];
      contract: string;
      basisCodes: readonly string[];
    };
    expect(pack.intents).toContain("scaffolded-test-pack.demo.create");
    expect(pack.intents).toContain("scaffolded-test-pack.demo.confirm");
    expect(pack.contract).toBe("v0");
    expect(pack.basisCodes.length).toBeGreaterThan(0);
  });

  it("rejects invalid pack names (regex gate)", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {
        throw new Error("process.exit called");
      }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        runPackInit("Invalid Name With Spaces", { target: FIXTURES_DIR }),
      ).rejects.toThrow();
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
