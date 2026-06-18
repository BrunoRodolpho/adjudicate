/**
 * `replayWithIntegrity` — replay + tamper-detection in one pass.
 *
 * Verifies the four-quadrant matrix:
 *   1. Decision matches + integrity intact → matched
 *   2. Decision matches + auditHash tampered → integrityFailure
 *   3. Decision matches + envelope intentHash mismatch → integrityFailure
 *   4. Decision mismatch + integrity intact → mismatch only
 *   5. Decision mismatch + audit tampered → mismatch AND integrity
 *   6. Pre-v4 record (no auditHash) → counted in preV4Records, replay still runs
 */

import { describe, expect, it } from "vitest";
import {
  type AuditRecord,
  buildAuditRecord,
  buildEnvelope,
  type Decision,
  sha256Canonical,
  type IntentEnvelope,
  type Taint,
} from "@adjudicate/core";
import {
  isReplayIntegrityClean,
  replayWithIntegrity,
} from "../src/replay-integrity.js";

function envelopeWith(overrides: { kind?: string; taint?: Taint; payload?: unknown; nonce?: string } = {}): IntentEnvelope {
  return buildEnvelope({
    kind: overrides.kind ?? "test.intent",
    payload: overrides.payload ?? { amount: 100 },
    actor: { principal: "user", sessionId: "s-1" },
    taint: overrides.taint ?? "UNTRUSTED",
    nonce: overrides.nonce ?? "n-1",
    createdAt: "2026-05-20T00:00:00.000Z",
  });
}

function executeDecision(): Decision {
  return {
    kind: "EXECUTE",
    basis: [{ category: "state", code: "transition_valid" }],
  };
}

function refuseDecision(): Decision {
  return {
    kind: "REFUSE",
    basis: [{ category: "state", code: "transition_illegal" }],
    refusal: { code: "state.illegal_transition", scope: "USER" },
  };
}

describe("replayWithIntegrity", () => {
  it("matches when decision + integrity are intact", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
    });
    const report = replayWithIntegrity([record], () => decision);
    expect(report.total).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.mismatches).toHaveLength(0);
    expect(report.integrityFailures).toHaveLength(0);
    expect(isReplayIntegrityClean(report)).toBe(true);
  });

  it("detects audit-hash tampering even when the decision matches", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
    });
    // Tamper: change durationMs after the hash was built.
    const tampered: AuditRecord = { ...record, durationMs: 99999 };
    const report = replayWithIntegrity([tampered], () => decision);
    expect(report.matched).toBe(0);
    expect(report.integrityFailures).toHaveLength(1);
    expect(report.integrityFailures[0]!.kind).toBe("AUDIT_HASH_TAMPERED");
    expect(isReplayIntegrityClean(report)).toBe(false);
  });

  it("detects envelope intentHash mismatch independently of audit-hash", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
    });
    // Tamper: change the envelope's payload after building.
    // Note: this also invalidates the auditHash, so we expect BOTH failures.
    const badEnvelope: IntentEnvelope = {
      ...env,
      payload: { amount: 999999 },
    };
    const tampered: AuditRecord = { ...record, envelope: badEnvelope };
    const report = replayWithIntegrity([tampered], () => decision);
    expect(report.integrityFailures.some((f) => f.kind === "INTENT_HASH_MISMATCH")).toBe(true);
    expect(isReplayIntegrityClean(report)).toBe(false);
  });

  it("reports replay mismatches and integrity passes independently", () => {
    const env = envelopeWith();
    const original = executeDecision();
    const drifted = refuseDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision: original,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
    });
    // Replay returns a different decision than the record.
    const report = replayWithIntegrity([record], () => drifted);
    expect(report.matched).toBe(0);
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("DECISION_KIND");
    expect(report.integrityFailures).toHaveLength(0);
  });

  it("counts pre-v4 records (missing auditHash) without penalizing them", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
    });
    // Strip auditHash to simulate a pre-v4 record.
    const { auditHash: _strip, ...legacy } = record;
    const report = replayWithIntegrity(
      [legacy as AuditRecord],
      () => decision,
    );
    expect(report.preV4Records).toBe(1);
    // No integrity failures — missing hash is "not applicable", not "tampered".
    expect(report.integrityFailures).toHaveLength(0);
    expect(report.matched).toBe(1);
  });

  it("integrity verification preserves replay verdicts byte-identically", () => {
    // Property test: for a set of intact records, replayWithIntegrity's
    // mismatches list MUST equal what plain replay would have reported.
    const records: AuditRecord[] = [];
    const decisions: Decision[] = [];
    for (let i = 0; i < 50; i++) {
      const env = envelopeWith({ nonce: `n-${i}` });
      const d = i % 2 === 0 ? executeDecision() : refuseDecision();
      records.push(
        buildAuditRecord({
          envelope: env,
          decision: d,
          durationMs: i,
          at: `2026-05-20T00:00:${String(i).padStart(2, "0")}.000Z`,
        }),
      );
      decisions.push(d);
    }
    const report = replayWithIntegrity(records, (rec) => {
      const i = records.indexOf(rec);
      return decisions[i]!;
    });
    expect(report.matched).toBe(50);
    expect(report.mismatches).toHaveLength(0);
    expect(report.integrityFailures).toHaveLength(0);
  });

  it("is deterministic — running twice on the same input produces the same report", () => {
    const env1 = envelopeWith({ nonce: "n-a" });
    const env2 = envelopeWith({ nonce: "n-b" });
    const records = [
      buildAuditRecord({
        envelope: env1,
        decision: executeDecision(),
        durationMs: 1,
        at: "2026-05-20T00:00:00.000Z",
      }),
      buildAuditRecord({
        envelope: env2,
        decision: refuseDecision(),
        durationMs: 2,
        at: "2026-05-20T00:00:01.000Z",
      }),
    ];
    const adjudicator = (rec: AuditRecord) =>
      rec.envelope.nonce === "n-a" ? executeDecision() : refuseDecision();
    const r1 = replayWithIntegrity(records, adjudicator);
    const r2 = replayWithIntegrity(records, adjudicator);
    // Two reports MUST be deep-equal — same input → same output.
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("malformed envelope payload (post-build tamper) is caught by intentHash check", () => {
    const env = envelopeWith({ payload: { amount: 100 } });
    const record = buildAuditRecord({
      envelope: env,
      decision: executeDecision(),
      durationMs: 1,
      at: "2026-05-20T00:00:00.000Z",
    });
    // Replace payload in-place — the envelope's intentHash is now stale.
    const stale: AuditRecord = {
      ...record,
      envelope: { ...env, payload: { amount: 50 } },
    };
    const expected = sha256Canonical({
      version: 2,
      kind: env.kind,
      payload: { amount: 50 },
      nonce: env.nonce,
      actor: env.actor,
      taint: env.taint,
      // 041 — origin joined the intentHash recipe; the shadow re-derivation
      // must include it or it drifts from the kernel's derived hash.
      origin: env.origin,
    });
    const report = replayWithIntegrity([stale], () => executeDecision());
    const intentFailure = report.integrityFailures.find(
      (f) => f.kind === "INTENT_HASH_MISMATCH",
    );
    expect(intentFailure).toBeDefined();
    expect(intentFailure!.detail.derived).toBe(expected);
  });
});
