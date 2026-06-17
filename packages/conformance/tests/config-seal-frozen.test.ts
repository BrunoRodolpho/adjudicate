import { describe, expect, it } from "vitest";
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
});
