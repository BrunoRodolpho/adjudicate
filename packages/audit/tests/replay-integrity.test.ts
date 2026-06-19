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
  hashBindAuditSigner,
  sha256Canonical,
  type IntentEnvelope,
  type Taint,
} from "@adjudicate/core";
import {
  isReplayIntegrityClean,
  replayWithIntegrity,
  emitAuditCheckpoint,
  verifyAuditCheckpoint,
  type AuditCheckpoint,
} from "../src/replay-integrity.js";

function envelopeWith(overrides: { kind?: string; taint?: Taint; payload?: unknown; nonce?: string; sessionId?: string } = {}): IntentEnvelope {
  return buildEnvelope({
    kind: overrides.kind ?? "test.intent",
    payload: overrides.payload ?? { amount: 100 },
    actor: { principal: "user", sessionId: overrides.sessionId ?? "s-1" },
    taint: overrides.taint ?? "UNTRUSTED",
    nonce: overrides.nonce ?? "n-1",
    createdAt: "2026-05-20T00:00:00.000Z",
  });
}

/**
 * Build an N-record hash chain for one stream (session). Each record after the
 * first carries `prevAuditHash = <previous record's auditHash>`, exactly as the
 * persist side would thread it. Returns the records in chain (input) order.
 */
function buildChain(n: number, sessionId = "stream-A"): AuditRecord[] {
  const decision = executeDecision();
  const records: AuditRecord[] = [];
  let prev: string | undefined = undefined;
  for (let i = 0; i < n; i++) {
    const env = envelopeWith({ sessionId, nonce: `n-${sessionId}-${i}` });
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: `2026-05-20T00:0${i}:00.000Z`,
      ...(prev !== undefined ? { prevAuditHash: prev } : {}),
    });
    records.push(record);
    prev = record.auditHash;
  }
  return records;
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

// ─── 092: the harness reflects the signature verdict ────────────────────────
// A record whose auditHash is intact but whose signature is forged surfaces as
// a distinct AUDIT_SIGNATURE_INVALID integrity failure (not AUDIT_HASH_TAMPERED).
describe("replayWithIntegrity — 092 signature verdict", () => {
  it("a valid signature does NOT add an integrity failure (matched, intact)", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
      signer: hashBindAuditSigner("kms://harness-key"),
    });
    const report = replayWithIntegrity([record], () => decision);
    expect(report.matched).toBe(1);
    expect(report.integrityFailures).toHaveLength(0);
    expect(isReplayIntegrityClean(report)).toBe(true);
  });

  it("a forged signature surfaces AUDIT_SIGNATURE_INVALID (auditHash intact)", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
      signer: hashBindAuditSigner("kms://harness-key"),
    });
    // Forge ONLY the signature value; the auditHash (over the record sans
    // signature) is untouched, so the tamper axis passes and the signature axis
    // fails — a distinct kind, NOT AUDIT_HASH_TAMPERED.
    const forged: AuditRecord = {
      ...record,
      signature: { ...record.signature!, value: "0".repeat(64) },
    };
    const report = replayWithIntegrity([forged], () => decision);
    expect(report.matched).toBe(0);
    expect(report.integrityFailures).toHaveLength(1);
    const failure = report.integrityFailures[0]!;
    expect(failure.kind).toBe("AUDIT_SIGNATURE_INVALID");
    // The detail carries the offending keyId + alg (not a hash pair).
    expect(failure.detail.stored).toBe("kms://harness-key");
    expect(failure.detail.derived).toBe("sha256-hashbind");
    expect(isReplayIntegrityClean(report)).toBe(false);
  });

  it("auditHash tamper still surfaces AUDIT_HASH_TAMPERED even on a signed record", () => {
    const env = envelopeWith();
    const decision = executeDecision();
    const record = buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-20T00:00:01.000Z",
      signer: hashBindAuditSigner("kms://harness-key"),
    });
    // Mutate a hashed field — the auditHash axis fails BEFORE the signature axis,
    // so the kind is AUDIT_HASH_TAMPERED (the bytes were modified).
    const tampered: AuditRecord = { ...record, durationMs: 99999 };
    const report = replayWithIntegrity([tampered], () => decision);
    expect(report.integrityFailures).toHaveLength(1);
    expect(report.integrityFailures[0]!.kind).toBe("AUDIT_HASH_TAMPERED");
  });
});

// ─── 093 (T2): inter-record HASH-CHAIN continuity ───────────────────────────
// A record whose `prevAuditHash` does not equal its predecessor's `auditHash`
// (because an interior record was deleted or reordered) surfaces a distinct
// AUDIT_CHAIN_BROKEN integrity failure — orthogonal to AUDIT_HASH_TAMPERED (each
// record's OWN bytes are intact; the LINK between them is wrong).
describe("replayWithIntegrity — 093 chain continuity", () => {
  it("an intact chain produces no integrity failure (all matched)", () => {
    const chain = buildChain(4);
    const report = replayWithIntegrity(chain, (r) => r.decision);
    expect(report.matched).toBe(4);
    expect(report.integrityFailures).toHaveLength(0);
    expect(isReplayIntegrityClean(report)).toBe(true);
  });

  it("a DELETED interior record breaks the chain → AUDIT_CHAIN_BROKEN", () => {
    const chain = buildChain(4); // [0,1,2,3]
    // Delete record index 2: the survivor at index 3 still links to record 2's
    // auditHash, but the immediately-preceding record now seen is record 1.
    const withGap = [chain[0]!, chain[1]!, chain[3]!];
    const report = replayWithIntegrity(withGap, (r) => r.decision);
    const broken = report.integrityFailures.filter(
      (f) => f.kind === "AUDIT_CHAIN_BROKEN",
    );
    expect(broken).toHaveLength(1);
    // The survivor (record 3) is the one flagged; its prevAuditHash points at
    // the DELETED record 2, not the surviving predecessor record 1.
    expect(broken[0]!.intentHash).toBe(chain[3]!.intentHash);
    expect(broken[0]!.detail.stored).toBe(chain[3]!.prevAuditHash);
    expect(broken[0]!.detail.derived).toBe(chain[1]!.auditHash);
    expect(isReplayIntegrityClean(report)).toBe(false);
  });

  it("a REORDERED record breaks the chain → AUDIT_CHAIN_BROKEN", () => {
    const chain = buildChain(3); // [0,1,2]
    // Swap records 1 and 2: now record 2 (linking to record 1) appears before
    // record 1 (linking to record 0). After genesis record 0, the next record is
    // record 2 whose link points at record 1 (not the cursor = record 0).
    const reordered = [chain[0]!, chain[2]!, chain[1]!];
    const report = replayWithIntegrity(reordered, (r) => r.decision);
    const broken = report.integrityFailures.filter(
      (f) => f.kind === "AUDIT_CHAIN_BROKEN",
    );
    expect(broken.length).toBeGreaterThanOrEqual(1);
    expect(isReplayIntegrityClean(report)).toBe(false);
  });

  it("a genesis record (no prevAuditHash) opening a stream is NOT a break", () => {
    const chain = buildChain(1);
    expect(chain[0]!.prevAuditHash).toBeUndefined();
    const report = replayWithIntegrity(chain, (r) => r.decision);
    expect(report.integrityFailures).toHaveLength(0);
    expect(report.matched).toBe(1);
  });

  it("two independent streams interleaved each maintain their own chain", () => {
    const a = buildChain(3, "stream-A");
    const b = buildChain(3, "stream-B");
    // Interleave: a0, b0, a1, b1, a2, b2 — distinct sessions, distinct cursors.
    const interleaved = [a[0]!, b[0]!, a[1]!, b[1]!, a[2]!, b[2]!];
    const report = replayWithIntegrity(interleaved, (r) => r.decision);
    expect(report.integrityFailures).toHaveLength(0);
    expect(report.matched).toBe(6);
  });

  it("a record linking into a stream whose predecessor is OUT OF WINDOW is not falsely flagged", () => {
    // Partial window: drop the genesis. The first in-window record carries a
    // prevAuditHash pointing at an out-of-window predecessor; with no prior
    // record for this stream in the window, that is NOT a detectable break.
    const chain = buildChain(3);
    const partial = [chain[1]!, chain[2]!]; // starts mid-chain
    const report = replayWithIntegrity(partial, (r) => r.decision);
    const broken = report.integrityFailures.filter(
      (f) => f.kind === "AUDIT_CHAIN_BROKEN",
    );
    expect(broken).toHaveLength(0);
    expect(report.matched).toBe(2);
  });
});

// ─── 093 (T4): external signed checkpoint over the chain tip ─────────────────
// A deleted TAIL leaves the surviving prefix internally consistent (no dangling
// successor), so the chain-continuity axis alone cannot catch it. The signed
// checkpoint closes the gap: a truncated segment no longer reproduces the signed
// (tip, count), and the signature stops a forged checkpoint from matching.
describe("audit checkpoint — 093 external signed anchor", () => {
  const signer = hashBindAuditSigner("kms://checkpoint-key");

  it("a checkpoint validates against the intact segment it was signed over", () => {
    const chain = buildChain(5);
    const checkpoint = emitAuditCheckpoint(chain, signer, 1);
    expect(checkpoint.count).toBe(5);
    expect(checkpoint.tipAuditHash).toBe(chain[4]!.auditHash);
    expect(verifyAuditCheckpoint(chain, checkpoint)).toEqual({ valid: true });
  });

  it("a DELETED TAIL is caught by checkpoint validation (count_mismatch)", () => {
    const chain = buildChain(5);
    const checkpoint = emitAuditCheckpoint(chain, signer, 1);
    // Truncate the last two records (the prefix is internally chain-consistent).
    const truncated = chain.slice(0, 3);
    // The prefix alone passes the per-record chain-continuity axis...
    const report = replayWithIntegrity(truncated, (r) => r.decision);
    expect(report.integrityFailures).toHaveLength(0);
    // ...but the signed checkpoint catches the missing tail.
    const result = verifyAuditCheckpoint(truncated, checkpoint);
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: "count_mismatch", expected: 5, actual: 3 });
  });

  it("a tail deletion that preserves count is caught by tip_mismatch", () => {
    const chain = buildChain(4);
    const checkpoint = emitAuditCheckpoint(chain, signer, 7);
    // Replace the last record with a DIFFERENT record (same count, different tip)
    // — e.g. an attacker swaps the tail for a forged-but-self-consistent record.
    const swapped = buildChain(4, "other-stream");
    const tampered = [chain[0]!, chain[1]!, chain[2]!, swapped[3]!];
    const result = verifyAuditCheckpoint(tampered, checkpoint);
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: "tip_mismatch" });
  });

  it("a FORGED checkpoint (re-signed to match a truncated set with the wrong key) fails invalid_signature", () => {
    const chain = buildChain(5);
    const honest = emitAuditCheckpoint(chain, signer, 1);
    // An attacker truncates the chain AND forges a checkpoint over the truncated
    // tip — but cannot produce a valid signature without the real signing key.
    const truncated = chain.slice(0, 3);
    const forged: AuditCheckpoint = {
      sequence: honest.sequence,
      tipAuditHash: truncated[2]!.auditHash ?? null,
      count: truncated.length,
      // Forged value: not a real signature over this checkpoint's pre-image.
      signature: { keyId: "kms://checkpoint-key", alg: "sha256-hashbind", value: "0".repeat(64) },
    };
    const result = verifyAuditCheckpoint(truncated, forged);
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: "invalid_signature" });
  });

  it("an honest checkpoint over a re-signed truncation: the signature is valid but the prefix it is checked against still mismatches if count differs", () => {
    // Sanity: re-signing over the SHORTER set with the REAL key produces a valid
    // checkpoint for THAT set — verification then passes for the truncated set.
    // This proves the mechanism does not over-flag a legitimately re-checkpointed
    // segment; truncation is caught only relative to the EARLIER signed anchor.
    const chain = buildChain(5);
    const truncated = chain.slice(0, 3);
    const reCheckpoint = emitAuditCheckpoint(truncated, signer, 2);
    expect(verifyAuditCheckpoint(truncated, reCheckpoint)).toEqual({ valid: true });
    // But the ORIGINAL (count=5) anchor still catches the truncation.
    const original = emitAuditCheckpoint(chain, signer, 1);
    expect(verifyAuditCheckpoint(truncated, original).valid).toBe(false);
  });

  it("checkpoint signature binds the sequence — replaying at a different sequence fails", () => {
    const chain = buildChain(3);
    const checkpoint = emitAuditCheckpoint(chain, signer, 1);
    // Move the checkpoint to sequence 2 without re-signing: the pre-image now
    // differs, so the bound signature no longer verifies.
    const moved: AuditCheckpoint = { ...checkpoint, sequence: 2 };
    const result = verifyAuditCheckpoint(chain, moved);
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: "invalid_signature" });
  });
});
