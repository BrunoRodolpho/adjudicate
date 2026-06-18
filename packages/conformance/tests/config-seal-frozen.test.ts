import { describe, expect, it } from "vitest";
import { createRewriteGuard } from "@adjudicate/primitives";
import type { Guard } from "@adjudicate/core/kernel";
import {
  extractSealableSurface,
  freezeSealableSurface,
  sealPackConfig,
  verifyConfigSealFrozen,
  type SealablePackInput,
} from "../src/index.js";

const pack: SealablePackInput = {
  id: "frozen-pack",
  version: "1.0.0",
  contract: "v0",
  intents: ["x.do"],
  signals: [],
  basisCodes: ["state:transition_valid"],
  policy: {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [],
    default: "REFUSE",
  } as unknown as SealablePackInput["policy"],
};

describe("freezeSealableSurface + verifyConfigSealFrozen (ADR-137)", () => {
  it("deep-freezes the surface and its nested arrays", () => {
    const s = freezeSealableSurface(extractSealableSurface(pack));
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.intents)).toBe(true);
    expect(Object.isFrozen(s.taintMinimums)).toBe(true);
  });

  it("verifies a valid seal against the frozen surface (no live re-extraction)", () => {
    const frozen = freezeSealableSurface(extractSealableSurface(pack));
    const seal = sealPackConfig(pack);
    const r = verifyConfigSealFrozen(frozen, seal);
    expect(r.verified).toBe(true);
    expect(r.digestMatch).toBe("match");
  });

  it("reports mismatch against a tampered seal digest", () => {
    const frozen = freezeSealableSurface(extractSealableSurface(pack));
    const seal = { ...sealPackConfig(pack), digest: "0".repeat(64) };
    const r = verifyConfigSealFrozen(frozen, seal);
    expect(r.verified).toBe(false);
    expect(r.digestMatch).toBe("mismatch");
  });

  it("agrees with verifyConfigSeal for the same pack (frozen == live for a static pack)", () => {
    const frozen = freezeSealableSurface(extractSealableSurface(pack));
    const seal = sealPackConfig(pack);
    expect(verifyConfigSealFrozen(frozen, seal).computedDigest).toBe(seal.digest);
  });

  // ── 081: the frozen cadence also covers the guard CODE-artifact surface ──
  it("frozen verify covers per-guard code artifacts (deep-freezes guardCodeDigests)", () => {
    const capPack = rewritePack(5);
    const frozen = freezeSealableSurface(extractSealableSurface(capPack));
    expect(Object.isFrozen(frozen.guardCodeDigests)).toBe(true);
    expect(frozen.guardCodeDigests.length).toBeGreaterThan(0);
    // A frozen surface captured over cap=5 must NOT verify a seal minted over
    // cap=5000 — the frozen path binds guard code, not just metadata (081).
    const tamperedSeal = sealPackConfig(rewritePack(5000));
    const r = verifyConfigSealFrozen(frozen, tamperedSeal);
    expect(r.digestMatch).toBe("mismatch");
    expect(r.verified).toBe(false);
  });
});

/** A pack whose business phase clamps via a createRewriteGuard closure cap. */
function rewritePack(cap: number): SealablePackInput {
  const clamp = createRewriteGuard<string, Record<string, unknown>, unknown>({
    matches: (env) => env.kind === "x.do",
    extract: (env) => (env.payload as { n?: number }).n,
    cap,
    mutateField: "n",
    reason: "clamp",
  });
  return {
    id: "frozen-rewrite-pack",
    version: "1.0.0",
    contract: "v0",
    intents: ["x.do"],
    signals: [],
    basisCodes: ["business:quantity_capped"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [clamp as Guard<string, unknown, unknown>],
      default: "REFUSE",
    },
  };
}
