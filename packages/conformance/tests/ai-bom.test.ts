import { describe, expect, it } from "vitest";
import { generateAiBom, type GenerateAiBomInputs } from "../src/ai-bom.js";
import type { PackManifest } from "../src/manifest.js";
import type { ConformanceReport } from "../src/types.js";
import type { PackHealthReport } from "../src/pack-health.js";

const manifest: PackManifest = {
  contract: "v0",
  packId: "pack-x",
  kernelMinVersion: ">=1 <2",
  intents: ["x.create", "x.cancel"],
};

const conformance: ConformanceReport = {
  packId: "pack-x",
  results: [{ id: "AC-001", name: "untrusted", passed: true }],
  passed: true,
  summary: { total: 6, passed: 6, failed: 0 },
};

const health: PackHealthReport = {
  schemaVersion: 1,
  packId: "pack-x",
  tier: "gold",
  score: 12,
  maxScore: 12,
  axes: [],
  blockers: [],
} as unknown as PackHealthReport;

function inputs(over: Partial<GenerateAiBomInputs> = {}): GenerateAiBomInputs {
  return {
    pack: { id: "pack-x", version: "1.2.3", contract: "v0", intents: ["x.cancel", "x.create"], basisCodes: ["x.bad", "auth.scope"], signals: ["x.done"] },
    manifest,
    conformance,
    health,
    generatedAt: "2026-06-06T00:00:00.000Z",
    ...over,
  };
}

describe("generateAiBom", () => {
  it("composes fingerprint + conformance + health + sorted surface", () => {
    const bom = generateAiBom(inputs({ kernelVersion: "1.2.0", model: { provider: "anthropic", model: "claude-opus-4" } }));
    expect(bom.bomVersion).toBe("1.0");
    expect(bom.packId).toBe("pack-x");
    expect(bom.intents).toEqual(["x.cancel", "x.create"]); // sorted
    expect(bom.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(bom.conformance.passed).toBe(true);
    expect(bom.healthTier).toBe("gold");
    expect(bom.model?.model).toBe("claude-opus-4");
    expect(bom.frameworks).toEqual(["eu-ai-act", "nist-ai-rmf"]);
  });

  it("derives guardrails from basisCodes with category split; tools default from intents", () => {
    const bom = generateAiBom(inputs());
    expect(bom.guardrails).toContainEqual({ basisCode: "auth.scope", category: "auth" });
    expect(bom.tools.map((t) => t.name)).toEqual(["x.cancel", "x.create"]);
  });

  it("bomDigest is reproducible and EXCLUDES generatedAt (determinism)", () => {
    const a = generateAiBom(inputs({ generatedAt: "2026-06-06T00:00:00.000Z" }));
    const b = generateAiBom(inputs({ generatedAt: "2027-01-01T00:00:00.000Z" }));
    expect(a.bomDigest).toBe(b.bomDigest);
  });

  it("array order does not change the digest", () => {
    const a = generateAiBom(inputs({ pack: { id: "pack-x", version: "1.2.3", contract: "v0", intents: ["x.create", "x.cancel"] } }));
    const b = generateAiBom(inputs({ pack: { id: "pack-x", version: "1.2.3", contract: "v0", intents: ["x.cancel", "x.create"] } }));
    expect(a.bomDigest).toBe(b.bomDigest);
  });

  it("a tampered prompt hash flips the digest (adversarial)", () => {
    const a = generateAiBom(inputs({ promptHashes: [{ id: "sys", sha256: "a".repeat(64) }] }));
    const b = generateAiBom(inputs({ promptHashes: [{ id: "sys", sha256: "b".repeat(64) }] }));
    expect(a.bomDigest).not.toBe(b.bomDigest);
  });
});
