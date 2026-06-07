import { describe, expect, it } from "vitest";
import { projectIntegrityTransparency } from "./integrity-transparency";
import {
  CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
  type ConfigIntegrityTransparencySample,
} from "./transparency-fixtures";

/**
 * The public configuration-integrity projection is AGGREGATE-ONLY (ADR-131).
 * These tests pin the load-bearing safety property: no digest, reason, actor,
 * headline, signature, or per-pack detail can cross the public boundary — only
 * two counts + one closed stability class + asOf.
 */

const ALLOWED_KEYS = new Set([
  "allSealsVerified",
  "packsSealed",
  "packsTotal",
  "killSwitchStability",
  "asOf",
]);

const AS_OF = "2026-06-07T00:00:00.000Z";

describe("projectIntegrityTransparency — aggregate counts", () => {
  it("reports allSealsVerified=true when every pack verifies", () => {
    const out = projectIntegrityTransparency(
      CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
      AS_OF,
    );
    expect(out.allSealsVerified).toBe(true);
    expect(out.packsSealed).toBe(out.packsTotal);
    expect(out.packsTotal).toBe(CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE.seals.length);
    expect(out.killSwitchStability).toBe("stable");
    expect(out.asOf).toBe(AS_OF);
  });

  it("reports allSealsVerified=false when any pack fails to verify", () => {
    const drifted: ConfigIntegrityTransparencySample = {
      killSwitchStability: "single_incident",
      seals: [
        { packId: "a", verified: true },
        { packId: "b", verified: false },
        { packId: "c", verified: true },
      ],
    };
    const out = projectIntegrityTransparency(drifted, AS_OF);
    expect(out.allSealsVerified).toBe(false);
    expect(out.packsSealed).toBe(2);
    expect(out.packsTotal).toBe(3);
    expect(out.killSwitchStability).toBe("single_incident");
  });

  it("reports allSealsVerified=false for an empty pack set (nothing to attest)", () => {
    const out = projectIntegrityTransparency(
      { seals: [], killSwitchStability: "stable" },
      AS_OF,
    );
    expect(out.allSealsVerified).toBe(false);
    expect(out.packsSealed).toBe(0);
    expect(out.packsTotal).toBe(0);
  });

  it("is deterministic over (sample, asOf)", () => {
    const a = projectIntegrityTransparency(CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE, AS_OF);
    const b = projectIntegrityTransparency(CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE, AS_OF);
    expect(a).toEqual(b);
  });
});

describe("projectIntegrityTransparency — no sensitive leak", () => {
  it("emits only allowlisted aggregate keys", () => {
    const out = projectIntegrityTransparency(
      CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
      AS_OF,
    );
    for (const key of Object.keys(out)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });

  it("drops any injected digest/reason/actor/headline/signature field", () => {
    const tampered = {
      ...CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
      computedDigest: "DEADBEEF-secret-digest",
      expectedDigest: "DEADBEEF-secret-digest",
      reason: "operator narrative: tampered redeploy",
      actor: "alice@ops",
      headline: "kill-switch timeline: STORM (7 trips)",
      signature: { algorithm: "ed25519", keyId: "k1", value: "SECRET-SIG" },
      errors: ["config digest mismatch: expected X got Y"],
    } as unknown as ConfigIntegrityTransparencySample;

    const out = projectIntegrityTransparency(tampered, AS_OF);
    const json = JSON.stringify(out);

    for (const forbidden of [
      "DEADBEEF",
      "operator narrative",
      "alice@ops",
      "STORM",
      "SECRET-SIG",
      "ed25519",
      "digest mismatch",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const forbiddenKey of [
      "computedDigest",
      "expectedDigest",
      "reason",
      "actor",
      "headline",
      "signature",
      "errors",
      "seals",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(out, forbiddenKey)).toBe(false);
    }
  });

  it("never carries a per-pack packId from the fixture", () => {
    const json = JSON.stringify(
      projectIntegrityTransparency(CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE, AS_OF),
    );
    // The fixture has packIds; the public aggregate must not expose them.
    expect(json).not.toContain("pack-payments-pix");
    expect(json).not.toContain("pack-identity-kyc");
  });
});
