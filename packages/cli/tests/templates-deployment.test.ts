import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackInit } from "../src/commands/pack-init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-fixtures-deployment");
const PACK_NAME = "scaffolded-deployment-pack";
const PACK_DIR = path.join(FIXTURES_DIR, PACK_NAME);

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("pack init --template deployment", () => {
  beforeAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await runPackInit(PACK_NAME, {
      target: FIXTURES_DIR,
      template: "deployment",
    });
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
      "src/types.ts",
      "src/capabilities.ts",
      "scenarios/example-execute.json",
      "scenarios/example-refuse.json",
      "scenarios/example-escalate.json",
      "tests/conformance.test.ts",
    ];
    for (const rel of expected) {
      expect(
        await fileExists(path.join(PACK_DIR, rel)),
        `Expected ${rel} to exist in scaffolded deployment Pack`,
      ).toBe(true);
    }
  });

  it("substitutes placeholders everywhere", async () => {
    const files = ["src/index.ts", "src/policy.ts", "src/types.ts", "src/capabilities.ts"];
    for (const rel of files) {
      const src = await fs.readFile(path.join(PACK_DIR, rel), "utf8");
      expect(src).not.toContain("{{");
      expect(src).not.toContain("}}");
    }
  });

  it("scaffolded deployment Pack passes kernel conformance", async () => {
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;
    const pack = mod.ScaffoldedDeploymentPackPack;
    expect(pack).toBeDefined();

    const { assertPackConformance } = await import("@adjudicate/core");
    expect(() => assertPackConformance(pack as never)).not.toThrow();
  });

  it("declares the expected deployment intent kinds (no defer signal)", async () => {
    const indexPath = path.join(PACK_DIR, "src", "index.ts");
    const mod = (await import(indexPath)) as Record<string, unknown>;
    const pack = mod.ScaffoldedDeploymentPackPack as {
      intents: readonly string[];
      signals?: readonly string[];
    };
    expect(pack.intents).toContain(
      "scaffolded-deployment-pack.deployment.request",
    );
    expect(pack.intents).toContain(
      "scaffolded-deployment-pack.deployment.rollback",
    );
    // Deployment template does not declare wire signals (synchronous flow).
    expect(pack.signals).toBeUndefined();
  });
});
