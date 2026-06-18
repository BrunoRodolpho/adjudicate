import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  deriveIntentHash,
  reconcileNonceHash,
  type IntentEnvelope,
} from "../src/envelope.js";
import { sha256Canonical } from "../src/hash.js";

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

/**
 * Nonce reconciliation (022 T3) — `reconcileNonceHash` re-derives the
 * nonce-bound intentHash via the UNTOUCHED `intentHashInput` recipe and compares
 * it constant-time. The single-use burn store (022) keys redemption on this, so
 * it must: re-derive byte-identically through `sha256Canonical`, match the
 * stored hash, reject a mutated nonce, and NEVER throw (fail-closed, §D #6).
 */
describe("reconcileNonceHash — nonce reconciliation (022 T3)", () => {
  const envOf = (nonce: string): IntentEnvelope =>
    buildEnvelope({
      kind: "pix.charge.refund",
      payload: { amountCentavos: 1000 },
      actor: { principal: "user", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce,
    });

  it("re-derives the SAME nonce-bound hash the canonical recipe produced (non-vacuous)", () => {
    const env = envOf("nonce-1");
    // The re-derivation flows through @adjudicate/canonical `sha256Canonical`
    // over {version,kind,payload,nonce,actor,taint,origin}; pin that it equals
    // the envelope's own stored hash, i.e. the recipe is the single hash path.
    expect(deriveIntentHash(env)).toBe(env.intentHash);
    expect(reconcileNonceHash(env, env.intentHash)).toBe(true);
  });

  it("a mutated nonce re-derives a different hash → false (single-use cannot honor it)", () => {
    const minted = envOf("nonce-1");
    // A presented envelope whose only difference is the nonce must NOT reconcile
    // against the originally-minted intentHash — else a different intent could
    // redeem the burn (double-spend across nonces).
    const tampered = envOf("nonce-2");
    expect(tampered.intentHash).not.toBe(minted.intentHash);
    expect(reconcileNonceHash(tampered, minted.intentHash)).toBe(false);
  });

  it("constant-time compare: presented hash differing only in the last char → false", () => {
    const env = envOf("nonce-1");
    const flipped = env.intentHash.slice(0, -1) + (env.intentHash.endsWith("a") ? "b" : "a");
    expect(flipped).not.toBe(env.intentHash);
    expect(reconcileNonceHash(env, flipped)).toBe(false);
  });

  it("never throws on a malformed / non-string presented hash (fail-closed)", () => {
    const env = envOf("nonce-1");
    expect(() => reconcileNonceHash(env, undefined)).not.toThrow();
    expect(reconcileNonceHash(env, undefined)).toBe(false);
    expect(reconcileNonceHash(env, "short")).toBe(false);
    expect(reconcileNonceHash(env, 123 as unknown)).toBe(false);
  });

  it("re-derivation uses sha256Canonical over the documented field set", () => {
    const env = envOf("nonce-recipe");
    // The hash is exactly sha256Canonical over the recipe fields (origin is
    // always-present, defaulting to LLM); createdAt is NOT included.
    const expected = sha256Canonical({
      version: env.version,
      kind: env.kind,
      payload: env.payload,
      nonce: env.nonce,
      actor: env.actor,
      taint: env.taint,
      origin: env.origin,
    });
    expect(env.intentHash).toBe(expected);
    expect(reconcileNonceHash(env, expected)).toBe(true);
  });
});
