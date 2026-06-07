/**
 * AuditRecord v2 — plan snapshot + replayEnvelopeFromAudit + back-compat.
 *
 * The AUDIT_RECORD_VERSION bump from 1 to 2 must be additive: existing
 * fields unchanged, new `plan` field optional, v1 records still load.
 */

import { describe, expect, it } from "vitest";
import {
  AUDIT_RECORD_VERSION,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  basis,
  BASIS_CODES,
  replayEnvelopeFromAudit,
  type AuditRecord,
} from "../src/index.js";

function envFixture() {
  return buildEnvelope({
    kind: "order.tool.propose",
    payload: { sku: "X", qty: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

function decisionFixture() {
  return decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]);
}

describe("AUDIT_RECORD_VERSION", () => {
  it("is 3", () => {
    expect(AUDIT_RECORD_VERSION).toBe(5);
  });
});

describe("buildAuditRecord without plan (v1-shaped)", () => {
  it("produces a record with version=5 but no plan field", () => {
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 5,
      at: "2026-04-23T12:00:01.000Z",
    });
    expect(r.version).toBe(5);
    expect(r.plan).toBeUndefined();
    // Spec: every existing v1 field is unchanged.
    expect(r.intentHash).toBe(envFixture().intentHash);
    expect(r.decision_basis).toEqual(r.decision.basis);
  });
});

describe("buildAuditRecord with plan", () => {
  it("computes a deterministic planFingerprint from visibleReadTools + allowedIntents", () => {
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 5,
      at: "2026-04-23T12:00:01.000Z",
      plan: {
        visibleReadTools: ["search_catalog", "view_cart"],
        allowedIntents: ["cart.add_item"],
      },
    });
    expect(r.plan).toBeDefined();
    expect(r.plan!.planFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.plan!.visibleReadTools).toEqual(["search_catalog", "view_cart"]);
    expect(r.plan!.allowedIntents).toEqual(["cart.add_item"]);
  });

  it("planFingerprint is identical for byte-equal plans", () => {
    const planInput = {
      visibleReadTools: ["a", "b"],
      allowedIntents: ["x"],
    };
    const r1 = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
      plan: planInput,
    });
    const r2 = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:02.000Z",
      plan: planInput,
    });
    expect(r1.plan!.planFingerprint).toBe(r2.plan!.planFingerprint);
  });

  it("planFingerprint differs when visibleReadTools differs", () => {
    const r1 = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
      plan: { visibleReadTools: ["a"], allowedIntents: ["x"] },
    });
    const r2 = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
      plan: { visibleReadTools: ["b"], allowedIntents: ["x"] },
    });
    expect(r1.plan!.planFingerprint).not.toBe(r2.plan!.planFingerprint);
  });
});

describe("replayEnvelopeFromAudit", () => {
  it("reconstructs an envelope byte-identical to the original", () => {
    const original = envFixture();
    const r: AuditRecord = buildAuditRecord({
      envelope: original,
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
    });
    const replayed = replayEnvelopeFromAudit(r);
    expect(replayed.intentHash).toBe(original.intentHash);
    expect(replayed.kind).toBe(original.kind);
    expect(replayed.taint).toBe(original.taint);
    expect(replayed.createdAt).toBe(original.createdAt);
    expect(replayed.actor).toEqual(original.actor);
  });

  it("preserves intentHash through JSON round-trip (simulating Postgres replay)", () => {
    const original = envFixture();
    const r = buildAuditRecord({
      envelope: original,
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
    });
    // Round-trip through JSON to mimic the audit-postgres replay path.
    const roundTripped = JSON.parse(JSON.stringify(r)) as AuditRecord;
    const replayed = replayEnvelopeFromAudit(roundTripped);
    expect(replayed.intentHash).toBe(original.intentHash);
  });

  // CryptoReviewer-006 / LogicReviewer-012: faithful-replay guard. If the stored
  // envelope.intentHash doesn't match a fresh re-derivation of its content, the
  // record can't be faithfully replayed — refuse rather than hand back an
  // envelope claiming a hash it doesn't have.
  it("throws on a record whose stored envelope.intentHash is forged/drifted", () => {
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
    });
    const forged: AuditRecord = {
      ...r,
      envelope: { ...r.envelope, intentHash: "d".repeat(64) },
    };
    expect(() => replayEnvelopeFromAudit(forged)).toThrow(
      /envelope_intent_mismatch/,
    );
  });

  it("does not throw for a well-formed record", () => {
    const r = buildAuditRecord({
      envelope: envFixture(),
      decision: decisionFixture(),
      durationMs: 1,
      at: "2026-04-23T12:00:01.000Z",
    });
    expect(() => replayEnvelopeFromAudit(r)).not.toThrow();
  });
});
