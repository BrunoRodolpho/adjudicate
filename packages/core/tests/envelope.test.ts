import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESOURCE_BINDING_POLICY,
  buildEnvelope,
  deriveIntentHash,
  reconcileNonceHash,
  verifyResourceBinding,
  type IntentEnvelope,
  type ResourceRefs,
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

/**
 * 023 — resource-binding verifier. `verifyResourceBinding` re-derives the
 * envelope's `intentHash` via the UNTOUCHED `intentHashInput` recipe
 * (`deriveIntentHash`) and constant-time-compares it against the carried hash.
 * The executor must honor ONLY the kernel-bound payload, so this is the fence
 * that detects a `payload` / `resourceRefs` SWAPPED after the kernel decided
 * (anti-IDOR / anti-resource-swap). It must: bind a well-formed envelope, reject
 * a mutated payload, reject a swapped resource-ref, be `createdAt`-invariant,
 * route through `timingSafeHexEqual` (last-char flip → not bound), and NEVER
 * throw (fail-closed, §D #6).
 */
describe("verifyResourceBinding — executor honors the kernel-bound payload (023)", () => {
  const refs: ResourceRefs = { account: "acct_7", owner: "user_42" };
  const boundEnv = (
    payload: unknown,
    resourceRefs?: ResourceRefs,
  ): IntentEnvelope =>
    buildEnvelope({
      kind: "pix.charge.refund",
      payload: payload as Record<string, unknown>,
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-1",
      createdAt: "2026-06-18T00:00:00.000Z",
      ...(resourceRefs !== undefined ? { resourceRefs } : {}),
    });

  it("default policy is strict", () => {
    expect(DEFAULT_RESOURCE_BINDING_POLICY).toBe("strict");
  });

  it("a well-formed (kernel-built) envelope is bound", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    // Non-vacuous: the re-derived hash IS the stored hash.
    expect(deriveIntentHash(env)).toBe(env.intentHash);
    const r = verifyResourceBinding(env);
    expect(r.bound).toBe(true);
  });

  it("ANTI-IDOR: a payload swapped AFTER the decision is NOT bound", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    // The LLM substitutes a bigger amount after the kernel decided; the carried
    // intentHash is now stale (it content-addresses the original payload).
    const swapped: IntentEnvelope = {
      ...env,
      payload: { amountCentavos: 999_999 },
    };
    const r = verifyResourceBinding(swapped);
    expect(r.bound).toBe(false);
    if (r.bound === false) {
      // The re-derived hash diverges from the carried (kernel-bound) hash.
      expect(r.derived).not.toBe(r.stored);
      expect(r.stored).toBe(env.intentHash);
    }
  });

  it("ANTI-IDOR: a resourceRef swapped to another account is NOT bound (031 target)", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    // The classic IDOR: keep the payload, point the authorization target at
    // someone else's account by swapping resourceRefs after the decision.
    const swapped: IntentEnvelope = {
      ...env,
      resourceRefs: { account: "acct_VICTIM", owner: "user_42" },
    };
    expect(swapped.payload).toEqual(env.payload); // payload untouched...
    const r = verifyResourceBinding(swapped);
    expect(r.bound).toBe(false); // ...but the binding still catches the ref swap
  });

  it("createdAt change does NOT change the binding (excludes createdAt, invariant #4)", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    const reDated: IntentEnvelope = {
      ...env,
      createdAt: "2099-01-01T00:00:00.000Z",
    };
    // createdAt is descriptive metadata, not in the hash recipe — still bound.
    const r = verifyResourceBinding(reDated);
    expect(r.bound).toBe(true);
  });

  it("comparison goes through timingSafeHexEqual: a last-char-flipped hash is NOT bound", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    const flippedHash =
      env.intentHash.slice(0, -1) +
      (env.intentHash.endsWith("a") ? "b" : "a");
    const tamperedHash: IntentEnvelope = { ...env, intentHash: flippedHash };
    // The carried hash is one char off; a constant-time compare reports false
    // without an early-exit timing leak (the comparator runs the full length).
    const r = verifyResourceBinding(tamperedHash);
    expect(r.bound).toBe(false);
  });

  it("a non-canonicalizable payload fail-closes (bound:false), never throws (§D #6)", () => {
    const env = boundEnv({ amountCentavos: 5000 }, refs);
    // A non-finite number has no canonical representation (RFC 8785 §3.2.2.3);
    // deriveIntentHash would throw — verifyResourceBinding catches and fail-closes.
    const poisoned: IntentEnvelope = {
      ...env,
      payload: { amountCentavos: Number.POSITIVE_INFINITY },
    };
    expect(() => verifyResourceBinding(poisoned)).not.toThrow();
    const r = verifyResourceBinding(poisoned);
    expect(r.bound).toBe(false);
    if (r.bound === false) expect(r.derived).toBe("");
  });

  it("a no-resourceRefs envelope still binds (drop-safe, parity with attestation)", () => {
    const env = boundEnv({ amountCentavos: 5000 }); // no resourceRefs key
    expect(env.resourceRefs).toBeUndefined();
    expect(verifyResourceBinding(env).bound).toBe(true);
  });
});
