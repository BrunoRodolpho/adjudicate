import { describe, expect, it } from "vitest";
import { canPropose, canProposeWithOrigin } from "@adjudicate/core";
import {
  createSessionContaminationPolicy,
  createSystemTaintPolicy,
} from "../src/index.js";

describe("createSystemTaintPolicy", () => {
  it("returns TRUSTED for system-only kinds and UNTRUSTED for others", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["kyc.vendor.callback", "pix.charge.confirm"],
    });
    expect(policy.minimumFor("kyc.vendor.callback")).toBe("TRUSTED");
    expect(policy.minimumFor("pix.charge.confirm")).toBe("TRUSTED");
    expect(policy.minimumFor("kyc.start")).toBe("UNTRUSTED");
    expect(policy.minimumFor("pix.charge.create")).toBe("UNTRUSTED");
    expect(policy.minimumFor("any.unknown.kind")).toBe("UNTRUSTED");
  });

  it("allowlist-empty defaults every kind to UNTRUSTED", () => {
    const policy = createSystemTaintPolicy({ systemOnlyKinds: [] });
    expect(policy.minimumFor("anything")).toBe("UNTRUSTED");
  });

  it("respects custom userMinimum", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      userMinimum: "TRUSTED",
    });
    expect(policy.minimumFor("sys.event")).toBe("TRUSTED");
    expect(policy.minimumFor("user.event")).toBe("TRUSTED");
  });

  it("respects custom systemMinimum (e.g., lowering for testing)", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      systemMinimum: "UNTRUSTED",
    });
    expect(policy.minimumFor("sys.event")).toBe("UNTRUSTED");
  });

  it("041: does NOT branch on origin — origin is carried metadata, never consulted", () => {
    // The factory is a pure function of `kind`. Threading any `origin` through
    // the options MUST NOT change the minimum for any kind (metadata-opaque,
    // ADR-105 rule 7). The 042 propagation gate consumes origin, not this.
    const base = { systemOnlyKinds: ["sys.event"] } as const;
    const baseline = createSystemTaintPolicy(base);
    const origins = ["Human", "Retrieved", "ExternalAPI", "LLM", "System"] as const;
    const kinds = ["sys.event", "user.event", "any.unknown.kind"];
    for (const origin of origins) {
      const withOrigin = createSystemTaintPolicy({ ...base, origin });
      for (const kind of kinds) {
        expect(withOrigin.minimumFor(kind)).toBe(baseline.minimumFor(kind));
      }
    }
  });

  // ── 043 — origin-required kinds (the opt-in origin-aware branch) ────────────

  it("043: omitting originRequiredKinds leaves the policy without the origin branch (byte-identical to pre-043)", () => {
    const policy = createSystemTaintPolicy({ systemOnlyKinds: ["sys.event"] });
    // The optional method is OMITTED entirely — the kernel gate sees pre-043 shape.
    expect(policy.requiresUncontaminatedOrigin).toBeUndefined();
  });

  it("043: an empty originRequiredKinds list also omits the method (no-op default)", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      originRequiredKinds: [],
    });
    expect(policy.requiresUncontaminatedOrigin).toBeUndefined();
  });

  it("043: declaring originRequiredKinds populates requiresUncontaminatedOrigin for exactly those kinds", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["kyc.vendor.callback"],
      originRequiredKinds: ["pix.charge.create", "pix.charge.refund"],
    });
    expect(typeof policy.requiresUncontaminatedOrigin).toBe("function");
    expect(policy.requiresUncontaminatedOrigin!("pix.charge.create")).toBe(true);
    expect(policy.requiresUncontaminatedOrigin!("pix.charge.refund")).toBe(true);
    // A kind NOT in the list is not origin-required.
    expect(policy.requiresUncontaminatedOrigin!("kyc.vendor.callback")).toBe(false);
    expect(policy.requiresUncontaminatedOrigin!("kyc.start")).toBe(false);
  });

  it("043: originRequiredKinds does NOT change minimumFor — the trust-rank floor is untouched", () => {
    // The origin branch is ADDITIVE friction only; minimumFor for an
    // origin-required UNTRUSTED kind stays UNTRUSTED (the 1>=1 rank floor).
    const baseline = createSystemTaintPolicy({ systemOnlyKinds: ["sys.event"] });
    const withOrigin = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      originRequiredKinds: ["user.action", "sys.event"],
    });
    for (const kind of ["sys.event", "user.action", "user.event", "unknown"]) {
      expect(withOrigin.minimumFor(kind)).toBe(baseline.minimumFor(kind));
    }
  });

  it("043: origin-required kinds resolve to a stricter EFFECTIVE minimum via canProposeWithOrigin", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: [],
      originRequiredKinds: ["user.action"],
    });
    // Rank floor alone passes (UNTRUSTED-min, 1>=1) ...
    expect(canPropose("UNTRUSTED", "user.action", policy)).toBe(true);
    // ... but a contaminating origin is refused (stricter effective minimum) ...
    expect(
      canProposeWithOrigin("UNTRUSTED", "user.action", "Retrieved", policy),
    ).toBe(false);
    // ... while a non-contaminating origin still passes ...
    expect(
      canProposeWithOrigin("UNTRUSTED", "user.action", "Human", policy),
    ).toBe(true);
    // ... and a non-declared kind is unaffected from the same contaminating origin.
    expect(
      canProposeWithOrigin("UNTRUSTED", "other.kind", "Retrieved", policy),
    ).toBe(true);
  });
});

describe("createSessionContaminationPolicy (042)", () => {
  it("defaults to OFF (behavior-preserving) when no options are passed", () => {
    expect(createSessionContaminationPolicy()).toEqual({ enabled: false });
  });

  it("defaults to OFF when enabled is omitted from an options object", () => {
    expect(createSessionContaminationPolicy({})).toEqual({ enabled: false });
  });

  it("enables contamination only when explicitly opted in", () => {
    expect(createSessionContaminationPolicy({ enabled: true })).toEqual({
      enabled: true,
    });
  });

  it("preserves an explicit disable", () => {
    expect(createSessionContaminationPolicy({ enabled: false })).toEqual({
      enabled: false,
    });
  });
});
