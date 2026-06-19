/**
 * Invariant: replay determinism — `adjudicate()` is a pure function of
 * `(envelope, state, policy)`. Re-adjudicating any stored AuditRecord
 * with the SAME policy produces a Decision whose flat-set basis matches
 * the stored basis. The replay classifier reports zero mismatches in
 * that case, which is the load-bearing claim of the replay harness.
 *
 * The classify rule is duplicated inline here to avoid a package-graph
 * cycle (this property test lives in `@adjudicate/core`; `classify`
 * lives in `@adjudicate/audit` which already depends on core). The
 * exported `classify` function is invariant-tested separately in
 * `packages/audit/tests/replay.test.ts`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  aggregateSnapshotFromRecorded,
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  classify,
  decisionExecute,
  decisionRefuse,
  recordAggregateSnapshot,
  refuse,
  verifyAuditRecord,
  type AggregateSnapshot,
  type Decision,
  type DecisionBasis,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defaultArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");

// TestReviewer-008: fuzz with deeply-nested JSON-safe payloads instead of the
// flat scalar `{ x: seed }`; coverage comes from payload SHAPE. The replay
// invariant requires the stored and replayed envelopes to share the SAME nonce
// AND payload (same content → same intentHash), so the generated payload is
// threaded into a single env() per property iteration. numRuns capped at 1_000
// (recursive payloads are heavier — same cap as v2-hash-stability).
function env(
  taint: Taint,
  payload: Record<string, unknown>,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind: "order.tool.propose",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function bundle(
  def: "REFUSE" | "EXECUTE",
  withGuards: "none" | "execute-guard" | "refuse-guard",
): PolicyBundle<string, unknown, unknown> {
  const business =
    withGuards === "execute-guard"
      ? [
          () =>
            decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]),
        ]
      : withGuards === "refuse-guard"
        ? [
            () =>
              decisionRefuse(
                refuse("BUSINESS_RULE", "x.do.invalid", "no"),
                [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
              ),
          ]
        : [];
  return {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business,
    default: def,
  };
}

const guardArb = fc.constantFrom<"none" | "execute-guard" | "refuse-guard">(
  "none",
  "execute-guard",
  "refuse-guard",
);

function flat(basis: readonly DecisionBasis[]): readonly string[] {
  return basis.map((b) => `${b.category}:${b.code}`).sort();
}

/**
 * Inline classifier — same rule as `@adjudicate/audit/replay.classify`,
 * duplicated here to avoid a package-graph cycle. Returns true iff the
 * two Decisions match by kind + flat-set basis (+ refusal.code on REFUSE).
 */
function decisionsMatch(a: Decision, b: Decision): boolean {
  if (a.kind !== b.kind) return false;
  const flatA = flat(a.basis);
  const flatB = flat(b.basis);
  if (flatA.length !== flatB.length) return false;
  for (let i = 0; i < flatA.length; i++) {
    if (flatA[i] !== flatB[i]) return false;
  }
  if (a.kind === "REFUSE" && b.kind === "REFUSE") {
    if (a.refusal.code !== b.refusal.code) return false;
  }
  return true;
}

/**
 * Drift guard (TestReviewer-007): the inline `decisionsMatch` above is a
 * deliberate copy of the production rule that lives in
 * `@adjudicate/core`'s exported `classify` (it can't import the audit-layer
 * `replay()` without closing a package-graph cycle). `classify` returns
 * `null` on a match and a structured `ReplayMismatch` otherwise — so the two
 * encode the SAME predicate iff `decisionsMatch(a, b) === (classify(_, a, b)
 * === null)` for every pair. This property fuzzes a wide space of Decision
 * pairs (kind × basis-set × refusal-code) and fails loudly if the inline copy
 * ever diverges from the real rule. Note: `classify`'s basis comparison is a
 * SET symmetric-difference and the inline copy is a sorted-list compare; these
 * agree on the boolean (match / no-match) for the basis vocabularies a real
 * Decision can carry (no duplicate category:code keys), which is exactly the
 * equivalence we pin.
 */
const basisCodeArb = fc.constantFrom<DecisionBasis>(
  basis("business", BASIS_CODES.business.RULE_SATISFIED),
  basis("business", BASIS_CODES.business.RULE_VIOLATED),
  basis("state", BASIS_CODES.state.TRANSITION_VALID),
  basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
);

const basisSetArb = fc.uniqueArray(basisCodeArb, {
  minLength: 0,
  maxLength: 4,
  selector: (b) => `${b.category}:${b.code}`,
});

const refusalCodeArb = fc.constantFrom("x.do.invalid", "y.blocked", "z.denied");

const decisionArb: fc.Arbitrary<Decision> = fc.oneof(
  basisSetArb.map((b) => decisionExecute(b)),
  fc
    .tuple(refusalCodeArb, basisSetArb)
    .map(([code, b]) =>
      decisionRefuse(refuse("BUSINESS_RULE", code, "no"), b),
    ),
);

describe("invariant: inline decisionsMatch tracks the production classify rule", () => {
  it("decisionsMatch(a, b) === (classify(hash, a, b) === null) for any pair", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (a, b) => {
        const inline = decisionsMatch(a, b);
        const viaClassify = classify("hash-under-test", a, b) === null;
        expect(inline).toBe(viaClassify);
      }),
      { numRuns: 2_000 },
    );
  });
});

describe("invariant: replay matches the stored Decision when policy is unchanged", () => {
  it("decisionsMatch(stored, replay) for any (taint × default × guard × payload)", () => {
    fc.assert(
      fc.property(
        taintArb,
        defaultArb,
        guardArb,
        jsonSafePayloadArb,
        (taint, def, guard, payload) => {
          const policy = bundle(def, guard);
          const envelope = env(taint, payload);
          const decision = adjudicate(envelope, {}, policy);
          const stored = buildAuditRecord({
            envelope,
            decision,
            durationMs: 1,
          });
          // Replay through the same policy.
          const replayed = adjudicate(stored.envelope, {}, policy);
          expect(decisionsMatch(decision, replayed)).toBe(true);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// ── 052: replay over the RECORDED aggregate snapshot is bit-identical (§D-5) ──
// The aggregate/limit snapshot is an INJECTED, recorded immutable input. A pure
// business guard that decides over the injected snapshot (over-limit → REFUSE,
// else EXECUTE) must reproduce a byte-identical Decision when re-run over the
// snapshot RE-DERIVED from its recorded content-address — for any window value,
// limit, and window-key. Non-vacuous: the property also pins that the decision
// FLIPS at the limit boundary, so the snapshot value genuinely drives the
// outcome (a guard ignoring the snapshot would fail the boundary assertion).
describe("invariant: 052 replay over the recorded aggregate snapshot is bit-identical", () => {
  const limitBundle = (
    windowKey: string,
    limit: number,
  ): PolicyBundle<string, unknown, { aggregate: AggregateSnapshot }> => ({
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [
      (_e, state) =>
        (state.aggregate.windows[windowKey] ?? 0) >= limit
          ? decisionRefuse(
              refuse("BUSINESS_RULE", "aggregate.limit.exceeded", "over limit"),
              [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
            )
          : decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]),
    ],
    default: "REFUSE",
  });

  it("decisionsMatch(stored, replay-over-recorded-snapshot) for any (committed × limit × key)", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        (committed, limit, windowKey) => {
          const policy = limitBundle(windowKey, limit);
          const snapshot: AggregateSnapshot = {
            windows: { [windowKey]: committed },
            at: "2026-04-23T11:59:00.000Z",
          };
          const envelope = env("UNTRUSTED", { p: 1 });
          const decision = adjudicate(envelope, { aggregate: snapshot }, policy);

          // Record the snapshot into the audit-bound shape, then re-derive it from
          // the recorded content-address (fail-closed integrity) and re-run the
          // PURE kernel over it — the §D-5 replay round-trip.
          const recorded = recordAggregateSnapshot(snapshot);
          const replayedSnapshot = aggregateSnapshotFromRecorded(recorded);
          const replayed = adjudicate(
            envelope,
            { aggregate: replayedSnapshot },
            policy,
          );
          expect(decisionsMatch(decision, replayed)).toBe(true);

          // Non-vacuity: the decision is exactly the limit predicate, so the
          // snapshot value drives the outcome (flips at the boundary).
          expect(decision.kind).toBe(committed >= limit ? "REFUSE" : "EXECUTE");
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// ── 093: byte-identical replay holds with the inter-record chain link present ─
// `prevAuditHash` is the per-stream cryptographic tip threaded onto the record on
// the PERSIST side, AFTER the pure decision and AFTER the record hash. It is
// EXCLUDED from both (a) the decision — the kernel never reads it — and (b) the
// auditHash pre-image. So for ANY policy/taint/payload: re-running the kernel
// over the chained record's envelope reproduces a byte-identical Decision, and
// the record's auditHash is invariant to the chain link (a genesis record and a
// chained record over identical content share an auditHash, and both verify).
// This is the constitutional-invariant-5 (byte-identical replay) claim with the
// 093 chain field present. Non-vacuous: it asserts BOTH the decision match AND
// the hash-invariance (a chain link leaking into the pre-image would flip the
// hash-equality assertion).
describe("invariant: 093 byte-identical replay holds with prevAuditHash present", () => {
  it("decisionsMatch(stored, replay) AND auditHash invariant to the chain link, for any (taint × default × guard × payload)", () => {
    fc.assert(
      fc.property(
        taintArb,
        defaultArb,
        guardArb,
        jsonSafePayloadArb,
        fc.hexaString({ minLength: 64, maxLength: 64 }),
        (taint, def, guard, payload, prevAuditHash) => {
          const policy = bundle(def, guard);
          const envelope = env(taint, payload);
          const decision = adjudicate(envelope, {}, policy);
          // A genesis record (no chain link) and a chained record over IDENTICAL
          // content. The chain link must not enter the decision or the hash. A
          // FIXED `at` is supplied so the only delta between the two records is
          // `prevAuditHash` (omitting `at` would default to `new Date()`, making
          // the two `at` values differ and confounding the hash-invariance claim).
          const at = "2026-04-23T12:00:00.000Z";
          const genesis = buildAuditRecord({ envelope, decision, durationMs: 1, at });
          const chained = buildAuditRecord({
            envelope,
            decision,
            durationMs: 1,
            at,
            prevAuditHash,
          });
          // (a) the chain link rides ON the record but is EXCLUDED from the hash.
          expect(chained.prevAuditHash).toBe(prevAuditHash);
          expect(chained.auditHash).toBe(genesis.auditHash);
          // (b) both records verify (the excluded link never false-tampers).
          expect(verifyAuditRecord(genesis).verified).toBe(true);
          expect(verifyAuditRecord(chained).verified).toBe(true);
          // (c) the kernel never reads the chain link → byte-identical replay.
          const replayed = adjudicate(chained.envelope, {}, policy);
          expect(decisionsMatch(decision, replayed)).toBe(true);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
