import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackInit } from "../src/commands/pack-init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Smoke test for the `payment` template.
 *
 * Scaffolds into `tests/.test-fixtures-payment/<name>/` — a path inside
 * the workspace so the rendered Pack's `import` of
 * `@adjudicate/core` and `@adjudicate/primitives` resolves via the
 * hoisted node_modules without a separate install. Verifies the file
 * layout, placeholder substitution, kernel conformance, and that the
 * payment-specific surface (3 payment intents + defer signal) is
 * present.
 */

const FIXTURES_DIR = path.join(__dirname, ".test-fixtures-payment");
const PACK_NAME = "scaffolded-payment-pack";
const PACK_DIR = path.join(FIXTURES_DIR, PACK_NAME);

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("pack init --template payment", () => {
  beforeAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await runPackInit(PACK_NAME, { target: FIXTURES_DIR, template: "payment" });
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it("renders the canonical file layout including types + capabilities", async () => {
    const expected = [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/policy.ts",
      "src/types.ts",
      "src/capabilities.ts",
      "scenarios/example-execute.json",
      "scenarios/example-refuse.json",
      "scenarios/example-defer.json",
      "tests/conformance.test.ts",
    ];
    for (const rel of expected) {
      expect(
        await fileExists(path.join(PACK_DIR, rel)),
        `Expected ${rel} to exist in scaffolded payment Pack`,
      ).toBe(true);
    }
  });

  it("substitutes placeholders everywhere (no leftover {{...}} markers)", async () => {
    const files = [
      "src/index.ts",
      "src/policy.ts",
      "src/types.ts",
      "src/capabilities.ts",
      "scenarios/example-execute.json",
      "scenarios/example-refuse.json",
      "scenarios/example-defer.json",
    ];
    for (const rel of files) {
      const src = await fs.readFile(path.join(PACK_DIR, rel), "utf8");
      expect(src, `${rel} has leftover placeholders`).not.toContain("{{");
      expect(src, `${rel} has leftover placeholders`).not.toContain("}}");
    }
  });

  it("scaffolded payment Pack passes kernel conformance via dynamic import", async () => {
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;
    const pack = mod.ScaffoldedPaymentPackPack;
    expect(pack).toBeDefined();

    const { assertPackConformance } = await import("@adjudicate/core");
    expect(() => assertPackConformance(pack as never)).not.toThrow();
  });

  it("declares the expected payment intent kinds and defer signal", async () => {
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;
    const pack = mod.ScaffoldedPaymentPackPack as {
      intents: readonly string[];
      signals?: readonly string[];
      contract: string;
      basisCodes: readonly string[];
    };
    expect(pack.intents).toContain("scaffolded-payment-pack.payment.create");
    expect(pack.intents).toContain("scaffolded-payment-pack.payment.confirm");
    expect(pack.intents).toContain("scaffolded-payment-pack.payment.refund");
    expect(pack.contract).toBe("v0");
    expect(pack.basisCodes.length).toBeGreaterThan(0);
    expect(pack.signals).toContain("payment.confirmed");
  });
});
