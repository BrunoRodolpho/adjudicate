import { describe, expect, it } from "vitest";
import { buildEnvelope, deriveIntentHash } from "../src/envelope.js";

/**
 * AuthReviewer-002 — `IntentActor.attestation` is a reserved v0.2 seam.
 *
 * It is OPTIONAL and `undefined`-by-default. `canonicalize()` drops
 * `undefined` fields (see `@adjudicate/canonical`), so an envelope whose
 * `actor.attestation` is explicitly `undefined` MUST hash byte-identically
 * to the same envelope with the field absent. This guards the determinism
 * fence: adding the seam changes no existing intentHash.
 */
describe("IntentActor.attestation — reserved v0.2 seam (AuthReviewer-002)", () => {
  it("attestation is undefined-dropped from intentHash (no hash change)", () => {
    const withoutAttestation = buildEnvelope({
      kind: "test",
      payload: {},
      actor: { principal: "llm", sessionId: "s1" },
      taint: "UNTRUSTED",
      nonce: "n1",
    });
    const withAttestation = {
      ...withoutAttestation,
      actor: { ...withoutAttestation.actor, attestation: undefined },
    };
    // intentHash must be byte-identical: `attestation: undefined` ≡ absent.
    expect(deriveIntentHash(withAttestation)).toBe(withoutAttestation.intentHash);
  });
});
