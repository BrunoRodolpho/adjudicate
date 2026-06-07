import { describe, expect, it, afterEach } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackBom } from "../src/commands/pack-bom.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(REPO_ROOT, "packages", "pack-payments-pix", "src", "index.ts");

const priorExit = process.exitCode;
afterEach(() => {
  process.exitCode = priorExit;
});

describe("adjudicate pack bom (CLI)", () => {
  it("emits a deterministic AI-BOM JSON for PIX", async () => {
    const lines: string[] = [];
    await runPackBom({
      pack: PIX_INDEX,
      kernelVersion: "1.2.0",
      now: () => "2026-06-06T00:00:00.000Z",
      stdout: (l) => lines.push(l),
    });
    const bom = JSON.parse(lines.join("\n"));
    expect(bom.bomVersion).toBe("1.0");
    expect(bom.packId).toBe("pack-payments-pix");
    expect(bom.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(bom.bomDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(bom.conformance.passed).toBe(true);
    expect(bom.intents).toContain("pix.charge.refund");
  });
});
