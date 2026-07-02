import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  hasUnknownEnvelopeVersion,
  INTENT_ENVELOPE_VERSION,
  isIntentEnvelope,
} from "../src/envelope.js";

describe("IntentEnvelope — version gating", () => {
  const baseline = {
    kind: "order.tool.propose" as const,
    payload: { toolName: "add_item", input: { sku: "X" } },
    actor: { principal: "llm" as const, sessionId: "s-1" },
    taint: "UNTRUSTED" as const,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  };

  it("buildEnvelope stamps the current version", () => {
    const env = buildEnvelope(baseline);
    expect(env.version).toBe(INTENT_ENVELOPE_VERSION);
  });

  it("isIntentEnvelope accepts a valid envelope", () => {
    const env = buildEnvelope(baseline);
    expect(isIntentEnvelope(env)).toBe(true);
  });

  it("isIntentEnvelope rejects arbitrary objects", () => {
    expect(isIntentEnvelope(null)).toBe(false);
    expect(isIntentEnvelope(undefined)).toBe(false);
    expect(isIntentEnvelope({})).toBe(false);
    expect(isIntentEnvelope({ version: 999 })).toBe(false);
    expect(isIntentEnvelope("string")).toBe(false);
    expect(isIntentEnvelope(42)).toBe(false);
  });

  it("isIntentEnvelope rejects an envelope-shaped object with unknown version", () => {
    const badVersion = {
      version: 999,
      kind: "order.tool.propose",
      payload: {},
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      intentHash: "deadbeef".repeat(8),
    };
    expect(isIntentEnvelope(badVersion)).toBe(false);
  });

  it("isIntentEnvelope rejects an envelope with missing taint", () => {
    const env = buildEnvelope(baseline);
    const missingTaint = { ...env, taint: "ROGUE" };
    expect(isIntentEnvelope(missingTaint)).toBe(false);
  });

  // DataReviewer-003 — principal must be the closed enum {llm,user,system}
  it("isIntentEnvelope rejects an envelope with an invalid principal", () => {
    const env = buildEnvelope(baseline);
    expect(isIntentEnvelope({ ...env, actor: { principal: "admin", sessionId: "s-1" } })).toBe(false);
    expect(isIntentEnvelope({ ...env, actor: { principal: "", sessionId: "s-1" } })).toBe(false);
  });

  // DataReviewer-009 — additionalProperties:false; extras would hash into intentHash
  it("isIntentEnvelope rejects an envelope with extra keys", () => {
    const env = buildEnvelope(baseline);
    expect(isIntentEnvelope({ ...env, debug: "extra" })).toBe(false);
    expect(isIntentEnvelope({ ...env, _tracing: true })).toBe(false);
  });

  it("isIntentEnvelope rejects an envelope with missing keys", () => {
    const env = buildEnvelope(baseline);
    const { payload: _dropped, ...noPayload } = env;
    expect(isIntentEnvelope(noPayload)).toBe(false);
  });

  // 031 — the OPTIONAL resourceRefs key is admitted but not required.
  it("isIntentEnvelope accepts a v3 envelope WITH resourceRefs (10 keys)", () => {
    const env = buildEnvelope({ ...baseline, resourceRefs: { owner: "u1", account: "a1" } });
    expect("resourceRefs" in env).toBe(true);
    expect(isIntentEnvelope(env)).toBe(true);
  });

  it("isIntentEnvelope still accepts a no-refs envelope (9 keys — drop-safe)", () => {
    const env = buildEnvelope(baseline);
    expect("resourceRefs" in env).toBe(false);
    expect(isIntentEnvelope(env)).toBe(true);
  });

  it("isIntentEnvelope rejects a malformed resourceRefs (non-string value / array)", () => {
    const env = buildEnvelope(baseline);
    expect(isIntentEnvelope({ ...env, resourceRefs: { owner: 42 } })).toBe(false);
    expect(isIntentEnvelope({ ...env, resourceRefs: ["owner"] })).toBe(false);
    expect(isIntentEnvelope({ ...env, resourceRefs: "owner=u1" })).toBe(false);
  });

  it("isIntentEnvelope still rejects unknown extra keys alongside resourceRefs", () => {
    const env = buildEnvelope({ ...baseline, resourceRefs: { owner: "u1" } });
    expect(isIntentEnvelope({ ...env, debug: "extra" })).toBe(false);
  });

  // WS7 — actor.role is OPTIONAL (opaque adopter vocabulary): absent stays
  // valid; when present it must be a NON-EMPTY string.
  it("isIntentEnvelope accepts an envelope whose actor has NO role (drop-safe)", () => {
    const env = buildEnvelope(baseline);
    expect("role" in env.actor).toBe(false);
    expect(isIntentEnvelope(env)).toBe(true);
  });

  it("isIntentEnvelope accepts an envelope whose actor carries a role", () => {
    const env = buildEnvelope({
      ...baseline,
      actor: { ...baseline.actor, role: "MANAGER" },
    });
    expect(isIntentEnvelope(env)).toBe(true);
  });

  it("isIntentEnvelope rejects an empty-string role", () => {
    const env = buildEnvelope({
      ...baseline,
      actor: { ...baseline.actor, role: "" },
    });
    expect(isIntentEnvelope(env)).toBe(false);
  });

  it("isIntentEnvelope rejects a non-string role", () => {
    const env = buildEnvelope(baseline);
    expect(
      isIntentEnvelope({ ...env, actor: { ...env.actor, role: 42 } }),
    ).toBe(false);
    expect(
      isIntentEnvelope({ ...env, actor: { ...env.actor, role: null } }),
    ).toBe(false);
    expect(
      isIntentEnvelope({ ...env, actor: { ...env.actor, role: ["MANAGER"] } }),
    ).toBe(false);
  });

  it("hasUnknownEnvelopeVersion identifies version-shaped objects with wrong version", () => {
    expect(hasUnknownEnvelopeVersion({ version: 999 })).toBe(true);
    expect(hasUnknownEnvelopeVersion({ version: 1 })).toBe(true); // v1 envelopes are now legacy
    expect(hasUnknownEnvelopeVersion({ version: 3 })).toBe(true); // future versions are unknown today
  });

  it("hasUnknownEnvelopeVersion returns false for current version", () => {
    expect(
      hasUnknownEnvelopeVersion({ version: INTENT_ENVELOPE_VERSION }),
    ).toBe(false);
  });

  it("hasUnknownEnvelopeVersion returns false for non-objects and missing versions", () => {
    expect(hasUnknownEnvelopeVersion(null)).toBe(false);
    expect(hasUnknownEnvelopeVersion(undefined)).toBe(false);
    expect(hasUnknownEnvelopeVersion({ kind: "x" })).toBe(false);
    expect(hasUnknownEnvelopeVersion({ version: "1" })).toBe(false);
  });
});
