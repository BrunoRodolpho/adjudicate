import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  AiBomListResultSchema,
  AiBomRagRefSchema,
  AiBomToolRefSchema,
  pickLatestAiBom,
  toAiBomSummary,
  type AiBomParsed,
} from "../src/schemas/ai-bom.js";

/**
 * tRPC-level coverage for the AI-BOM Explorer read procedures (ADR-130):
 * `pack.aiBom` (legacy, single), `pack.aiBomList` (summaries), and
 * `pack.aiBomById` (full detail + deterministic latest pick). Mirrors the
 * context-read posture of the existing `pack.aiBom` — no actor required, and
 * PRECONDITION_FAILED is the runtime feature-detection signal.
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

/** Build a minimal valid AiBomParsed for tests. */
function makeBom(overrides: Partial<AiBomParsed> = {}): AiBomParsed {
  return {
    bomVersion: "1.0",
    packId: "pack-pix",
    packVersion: "1.0.0",
    contract: "v0",
    kernelMinVersion: ">=1 <2",
    fingerprint: "f".repeat(64),
    intents: ["pix.charge.create"],
    signals: ["amount_centavos"],
    basisCodes: ["pix.limit.exceeded"],
    tools: [{ name: "pix.charge.create" }],
    rag: [],
    promptHashes: [{ id: "system", sha256: "a".repeat(64) }],
    guardrails: [{ basisCode: "pix.limit.exceeded", category: "pix" }],
    conformance: {
      passed: true,
      total: 4,
      passedCount: 4,
      failedCount: 0,
      reportDigest: "b".repeat(64),
    },
    healthTier: "gold",
    healthScore: { score: 6, maxScore: 6 },
    frameworks: ["eu-ai-act", "nist-ai-rmf"],
    bomDigest: "c".repeat(64),
    generatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

const pixBom = makeBom();
const kycBom = makeBom({
  packId: "pack-kyc",
  packVersion: "2.1.0",
  bomDigest: "d".repeat(64),
  model: { provider: "anthropic", model: "claude-sonnet" },
  healthTier: "silver",
});

function callerWith(
  ctx: Partial<Parameters<typeof createAdminCaller>[0]>,
) {
  return createAdminCaller({
    store,
    emergencyStore,
    actor: null,
    ...ctx,
  });
}

describe("pinned element schemas (ADR-130 tightening)", () => {
  it("AiBomToolRefSchema accepts producer output (name + optional fields)", () => {
    expect(AiBomToolRefSchema.safeParse({ name: "t" }).success).toBe(true);
    expect(
      AiBomToolRefSchema.safeParse({
        name: "t",
        description: "d",
        version: "1",
        schemaDigest: "x".repeat(64),
      }).success,
    ).toBe(true);
  });

  it("AiBomToolRefSchema rejects a missing required `name`", () => {
    expect(AiBomToolRefSchema.safeParse({ description: "d" }).success).toBe(
      false,
    );
  });

  it("AiBomRagRefSchema accepts a store reference shape", () => {
    expect(
      AiBomRagRefSchema.safeParse({
        name: "kb",
        kind: "vector",
        embeddingModel: "text-embedding-3",
      }).success,
    ).toBe(true);
  });

  it("AiBomListResultSchema round-trips a list of summaries", () => {
    const result = AiBomListResultSchema.safeParse({
      boms: [toAiBomSummary(pixBom), toAiBomSummary(kycBom)],
    });
    expect(result.success).toBe(true);
  });
});

describe("toAiBomSummary", () => {
  it("projects a BOM and derives `signed` without leaking the signature value", () => {
    const signed = makeBom({
      signature: { algorithm: "ed25519", keyId: "k1", value: "SECRET-SIG" },
    });
    const summary = toAiBomSummary(signed);
    expect(summary.signed).toBe(true);
    expect(summary.packId).toBe("pack-pix");
    expect(summary.conformance.passedCount).toBe(4);
    // The summary must never carry the signature value.
    expect(JSON.stringify(summary)).not.toContain("SECRET-SIG");
    expect(Object.prototype.hasOwnProperty.call(summary, "signature")).toBe(
      false,
    );
    // Heavy arrays are not part of the summary projection.
    expect(Object.prototype.hasOwnProperty.call(summary, "tools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, "promptHashes")).toBe(
      false,
    );
  });

  it("sets `signed: false` for an unsigned BOM", () => {
    expect(toAiBomSummary(pixBom).signed).toBe(false);
  });
});

describe("pickLatestAiBom", () => {
  it("is deterministic: highest semver-ish packVersion wins", () => {
    const v1 = makeBom({ packVersion: "1.0.0", bomDigest: "1".repeat(64) });
    const v2 = makeBom({ packVersion: "1.2.0", bomDigest: "2".repeat(64) });
    const v11 = makeBom({ packVersion: "1.10.0", bomDigest: "3".repeat(64) });
    // 1.10.0 > 1.2.0 numerically (not lexicographically).
    expect(pickLatestAiBom([v1, v2, v11]).packVersion).toBe("1.10.0");
    expect(pickLatestAiBom([v11, v1, v2]).packVersion).toBe("1.10.0");
  });

  it("breaks version ties by bomDigest deterministically", () => {
    const a = makeBom({ packVersion: "1.0.0", bomDigest: "a".repeat(64) });
    const b = makeBom({ packVersion: "1.0.0", bomDigest: "b".repeat(64) });
    expect(pickLatestAiBom([a, b]).bomDigest).toBe("a".repeat(64));
    expect(pickLatestAiBom([b, a]).bomDigest).toBe("a".repeat(64));
  });
});

describe("pack.aiBom (legacy single, ADR-127)", () => {
  it("returns the wired single BOM", async () => {
    const caller = callerWith({ aiBom: pixBom });
    const bom = await caller.pack.aiBom();
    expect(bom.packId).toBe("pack-pix");
  });

  it("PRECONDITION_FAILED when no BOM is wired", async () => {
    const caller = callerWith({});
    await expect(caller.pack.aiBom()).rejects.toThrow(/not configured/i);
  });
});

describe("pack.aiBomList (ADR-130)", () => {
  it("returns one summary per wired BOM, no actor required", async () => {
    const caller = callerWith({ aiBoms: [pixBom, kycBom] });
    const result = await caller.pack.aiBomList();
    expect(result.boms.map((b) => b.packId)).toEqual(["pack-pix", "pack-kyc"]);
    expect(result.boms[1]!.model?.provider).toBe("anthropic");
  });

  it("falls back to [ctx.aiBom] when only the legacy single BOM is wired", async () => {
    const caller = callerWith({ aiBom: pixBom });
    const result = await caller.pack.aiBomList();
    expect(result.boms).toHaveLength(1);
    expect(result.boms[0]!.packId).toBe("pack-pix");
  });

  it("PRECONDITION_FAILED when neither aiBoms nor aiBom is set", async () => {
    const caller = callerWith({});
    await expect(caller.pack.aiBomList()).rejects.toThrow(/not configured/i);
  });

  it("never exposes a signature value in the list output", async () => {
    const signed = makeBom({
      signature: { algorithm: "ed25519", keyId: "k1", value: "SECRET-SIG" },
    });
    const caller = callerWith({ aiBoms: [signed] });
    const result = await caller.pack.aiBomList();
    expect(result.boms[0]!.signed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET-SIG");
  });
});

describe("pack.aiBomById (ADR-130)", () => {
  it("returns the full BOM for a matching packId", async () => {
    const caller = callerWith({ aiBoms: [pixBom, kycBom] });
    const bom = await caller.pack.aiBomById({ packId: "pack-kyc" });
    expect(bom.packVersion).toBe("2.1.0");
    expect(bom.tools).toBeDefined();
  });

  it("filters by packVersion when supplied", async () => {
    const v1 = makeBom({ packVersion: "1.0.0", bomDigest: "1".repeat(64) });
    const v2 = makeBom({ packVersion: "1.2.0", bomDigest: "2".repeat(64) });
    const caller = callerWith({ aiBoms: [v1, v2] });
    const bom = await caller.pack.aiBomById({
      packId: "pack-pix",
      packVersion: "1.0.0",
    });
    expect(bom.packVersion).toBe("1.0.0");
  });

  it("picks the deterministic latest when packVersion is omitted", async () => {
    const v1 = makeBom({ packVersion: "1.0.0", bomDigest: "1".repeat(64) });
    const v2 = makeBom({ packVersion: "1.2.0", bomDigest: "2".repeat(64) });
    const caller = callerWith({ aiBoms: [v1, v2] });
    const bom = await caller.pack.aiBomById({ packId: "pack-pix" });
    expect(bom.packVersion).toBe("1.2.0");
  });

  it("NOT_FOUND for an unknown packId (incl. path-traversal-shaped input)", async () => {
    const caller = callerWith({ aiBoms: [pixBom] });
    await expect(
      caller.pack.aiBomById({ packId: "../../etc/passwd" }),
    ).rejects.toThrow(/No AI-BOM/i);
  });

  it("NOT_FOUND for a known packId but unknown version", async () => {
    const caller = callerWith({ aiBoms: [pixBom] });
    await expect(
      caller.pack.aiBomById({ packId: "pack-pix", packVersion: "9.9.9" }),
    ).rejects.toThrow(/No AI-BOM/i);
  });

  it("PRECONDITION_FAILED when no BOMs are wired at all", async () => {
    const caller = callerWith({});
    await expect(
      caller.pack.aiBomById({ packId: "pack-pix" }),
    ).rejects.toThrow(/not configured/i);
  });
});
