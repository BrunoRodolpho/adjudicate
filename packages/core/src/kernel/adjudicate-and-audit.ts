/**
 * adjudicateAndAudit — the kernel's complete entry point.
 *
 * Sync `adjudicate(envelope, state, policy)` is the load-bearing replay
 * primitive — pure, deterministic, total. Property tests and the replay
 * harness depend on those properties. Adding ledger I/O or sink emission
 * directly to it would break determinism.
 *
 * This sibling wraps `adjudicate()` with the four side-effecting concerns
 * a production path actually needs:
 *
 *   1. Ledger consult — if the intentHash already executed, swap the
 *      Decision for a `REPLAY_SUPPRESSED` REFUSE so the executor cannot
 *      double-fire side effects.
 *   2. MetricsSink — record the decision/refusal so dashboards see traffic.
 *   3. LearningSink — emit the LearningEvent so the analytics pipeline
 *      catches drift.
 *   4. AuditSink — write the durable AuditRecord. This is the governance
 *      record of truth; emission is no longer the adopter's optional step.
 *
 * Plus the EXECUTE-race fix (T5/#37): after a sync adjudicate() returns
 * EXECUTE, the wrapper calls `ledger.recordExecution()` and flips the
 * Decision to REPLAY_SUPPRESSED if the write did not claim the key (i.e.,
 * another caller already EXECUTEd this intentHash). Sequenced so two
 * parallel callers cannot both side-effect.
 *
 * Sink emission throws on failure — adopters who want fail-open audit
 * compose `multiSinkLossy` from `@adjudicate/audit` themselves.
 */

import { basis, BASIS_CODES } from "../basis-codes.js";
import {
  attachAuditMetadata,
  buildAuditRecord,
  type AuditPlanSnapshot,
  type AuditRecord,
  type Supersession,
} from "../audit.js";
import {
  decisionExecute,
  decisionRefuse,
  type Decision,
} from "../decision.js";
import { type IntentEnvelope } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import {
  type Ledger,
  type LedgerHit,
} from "../ledger.js";
import { refuse } from "../refusal.js";
import { type AuditSink } from "../sink.js";
import {
  adjudicateWithTrace,
  type AdjudicationTraceEntry,
} from "./adjudicate.js";
import {
  flattenBasis,
  matchedGuardIdFromTrace,
  matchedGuardPhaseFromTrace,
  recordOutcome,
} from "./learning.js";
import {
  recordDecision,
  recordLedgerOp,
  recordRefusal,
  recordSinkFailure,
} from "./metrics.js";
import type { PolicyBundle } from "./policy.js";
import type { RuntimeContext } from "./runtime-context.js";

export interface AdjudicateAndAuditClock {
  nowIso(): string;
  nowMs(): number;
}

const defaultClock: AdjudicateAndAuditClock = {
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};

export interface AdjudicateAndAuditDeps {
  /**
   * Audit sink. Required — kernel-side audit emission is the load-bearing
   * change of T1. Adopters compose `multiSink` / `bufferedSink` from
   * `@adjudicate/audit` to control fail-open vs fail-closed semantics.
   */
  readonly sink: AuditSink;
  /**
   * Optional, v5+ (ADR-124). Synchronous post-decision metadata provider. Runs
   * after `buildAuditRecord` and before `sink.emit`, on BOTH the kill-switch and
   * main paths. Returns governance/observability metadata (e.g. a hallucination
   * score) merged onto the record's `metadata` field. MUST NOT throw (wrapped);
   * MUST NOT affect the Decision (already computed) or any hashed field —
   * `metadata` is excluded from the auditHash pre-image.
   */
  readonly metadataProvider?: (
    record: AuditRecord,
  ) => Readonly<Record<string, unknown>> | undefined;
  /**
   * Optional Execution Ledger. When supplied:
   *   - `checkLedger` runs before adjudication; a hit short-circuits the
   *     Decision to REPLAY_SUPPRESSED and skips guard evaluation.
   *   - On EXECUTE, `recordExecution` claims the key. If the SET-NX
   *     returns "exists" (another writer was first), the Decision is
   *     flipped to REPLAY_SUPPRESSED so side effects cannot double-fire.
   */
  readonly ledger?: Ledger;
  /** Override wall clock for tests. */
  readonly clock?: AdjudicateAndAuditClock;
  /**
   * Optional resolver for the post-execute resourceVersion. When provided,
   * the resulting AuditRecord carries `resourceVersion` (e.g., the row
   * version of the mutated entity) and the ledger record uses it.
   */
  readonly resolveResourceVersion?: (
    envelope: IntentEnvelope,
    state: unknown,
  ) => string | undefined;
  /**
   * Optional plan snapshot accessor. When provided and not undefined, the
   * AuditRecord v2 `plan` field is populated and `planFingerprint` is
   * cross-correlated to the LearningEvent.
   */
  readonly plan?: () => Omit<AuditPlanSnapshot, "planFingerprint"> | undefined;
  /**
   * Optional tenant RuntimeContext. When supplied, metrics + learning
   * events route through the context's slots; when omitted, they go to
   * the module-level default singletons (back-compat). The context's
   * kill switch is consulted ahead of the kernel kill-switch — both
   * gates apply, so a tenant can revoke authority without flipping the
   * process-wide default.
   */
  readonly context?: RuntimeContext;
  /**
   * T5 (#41 / top-priority E): rate-limit rollback handle. When the
   * kernel returns a non-EXECUTE Decision (REFUSE/ESCALATE/DEFER/
   * REQUEST_CONFIRMATION/REWRITE-equivalent), the rollback fires so the
   * rate-limit counter does not advance for unauthorized requests.
   * Adopters obtain this from `checkRateLimit()`; passing it through
   * is the recommended pattern when both rate limiting and audit
   * emission live on the same path.
   */
  readonly rateLimitRollback?: () => Promise<void>;
  /**
   * Receipt that the user already affirmatively confirmed this envelope
   * via a prior REQUEST_CONFIRMATION cycle. When supplied AND the
   * receipt's `intentHash` matches `envelope.intentHash` AND the kernel
   * returns `REQUEST_CONFIRMATION`, the kernel substitutes `EXECUTE`
   * with an appended `confirmation:received` basis recording the
   * override. State guards, taint guards, and auth guards are still
   * evaluated in full — only the threshold-style "ask the user first"
   * step is satisfied. Other Decisions (REFUSE/REWRITE/ESCALATE/DEFER)
   * are returned unchanged: a state change between request and
   * confirmation that flipped the answer is correctly surfaced.
   *
   * Callers (typically the adapter's `confirm()` flow after taking the
   * single-use confirmation token) own the integrity of the receipt —
   * the kernel trusts that the receipt represents an actual user
   * affirmation. Adopters wiring this directly should ensure the
   * receipt cannot be forged from untrusted inputs.
   */
  readonly confirmationReceipt?: {
    readonly intentHash: string;
    /** ISO-8601 wall-clock of the user's confirmation. */
    readonly at: string;
    /**
     * Optional (LogicReviewer-004): the `at` timestamp of the original
     * REQUEST_CONFIRMATION audit row. When provided, stored as
     * `supersedes.predecessorAt` so audit-chain queries can JOIN on
     * (predecessorIntentHash, predecessorAt) to locate the predecessor row.
     * When omitted, falls back to `at` (pre-existing behaviour — use only
     * when the predecessor row's `at` is unavailable to the caller).
     *
     * STRICTLY ADDITIVE: a caller that omits `originalAt` produces a
     * byte-identical `supersedes` (and therefore identical auditHash) as
     * before this field existed.
     */
    readonly originalAt?: string;
    /**
     * Optional (AuthReviewer-005): opaque single-use token from the
     * confirmation store. When supplied, the kernel writes it into
     * `Supersession.token` of the auto-derived `confirmation_resolved`
     * supersedes link, providing a forensic trail that the confirmation
     * came from a real token-exchange flow rather than a bare hash
     * assertion. The kernel does NOT verify the token — that is the
     * adapter's responsibility (the adapter calls
     * `confirmationStore.take(token)` before passing this receipt).
     *
     * STRICTLY ADDITIVE: a caller that omits `token` produces a
     * byte-identical `supersedes` (and therefore identical auditHash) as
     * before this field existed.
     */
    readonly token?: string;
  };
  /**
   * Optional explicit supersession link (AuditRecord v3). When supplied,
   * the produced AuditRecord carries this value under `supersedes`. Use this
   * to attach `defer_resumed`, `rewrite_executed`, or `replay` links — for
   * `confirmation_resolved`, the kernel auto-derives `supersedes` from
   * `confirmationReceipt` when this field is not set.
   */
  readonly supersedes?: Supersession;
}

export interface AdjudicateAndAuditResult {
  readonly decision: Decision;
  readonly record: AuditRecord;
  /** Non-null when an existing ledger entry suppressed re-execution. */
  readonly ledgerHit: LedgerHit | null;
}

/**
 * Run adjudicate() with ledger + metrics + learning + audit emission.
 *
 * Decision flow:
 *   1. ledger.checkLedger — if hit, build REPLAY_SUPPRESSED REFUSE.
 *   2. otherwise, sync adjudicate() returns the kernel Decision.
 *   3. if Decision is EXECUTE, ledger.recordExecution claims the key;
 *      if claim fails ("exists"), flip to REPLAY_SUPPRESSED.
 *   4. emit MetricsSink + LearningSink events for the final Decision.
 *   5. build AuditRecord and call sink.emit (throws on failure).
 *
 * Sink failures propagate to the caller — adopters compose lossy sinks
 * upstream if fail-open is desired for non-critical paths.
 *
 * Minimum required wiring (APIReviewer-020): `{ sink }` alone is sufficient —
 * every other dep is optional. With only a sink the kernel adjudicates, emits
 * the AuditRecord, and routes metrics/learning to the module-level defaults.
 * `ledger` adds dedup/REPLAY_SUPPRESSED; `context` (RuntimeContext) routes
 * metrics/learning/kill-switch per tenant; `rateLimitRollback`,
 * `resolveResourceVersion`, `plan`, `supersedes`, `kernelIdentity`, and `clock`
 * are all opt-in.
 */
export async function adjudicateAndAudit<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
  deps: AdjudicateAndAuditDeps,
): Promise<AdjudicateAndAuditResult> {
  const clock = deps.clock ?? defaultClock;
  const start = clock.nowMs();
  const ctx = deps.context;

  // Telemetry routing: when a tenant context is supplied, route through its
  // slots; otherwise fall back to the module-level helpers so existing
  // callers see identical behaviour.
  const emitLedgerOp = ctx
    ? (e: Parameters<typeof recordLedgerOp>[0]) => ctx.metrics.recordLedgerOp(e)
    : recordLedgerOp;
  const emitDecision = ctx
    ? (e: Parameters<typeof recordDecision>[0]) => ctx.metrics.recordDecision(e)
    : recordDecision;
  const emitRefusal = ctx
    ? (e: Parameters<typeof recordRefusal>[0]) => ctx.metrics.recordRefusal(e)
    : recordRefusal;
  const emitOutcome = ctx
    ? (e: Parameters<typeof recordOutcome>[0]) => ctx.learning.current().recordOutcome(e)
    : recordOutcome;
  const emitSinkFailure = ctx
    ? (e: Parameters<typeof recordSinkFailure>[0]) => ctx.metrics.recordSinkFailure(e)
    : recordSinkFailure;

  // v5 (ADR-124): apply the optional post-decision metadata provider before
  // emit, defensively — a throwing provider must not break audit emission (the
  // record is still emitted, without metadata). metadata is excluded from the
  // auditHash, so this never invalidates tamper-evidence.
  const applyMeta = (record: AuditRecord): AuditRecord => {
    if (!deps.metadataProvider) return record;
    try {
      const m = deps.metadataProvider(record);
      return m !== undefined ? attachAuditMetadata(record, m) : record;
    } catch (err) {
      emitSinkFailure({
        sink: "metadata",
        subject: record.intentHash,
        errorClass: err instanceof Error ? err.name : "Error",
        consecutiveFailures: 1,
      });
      return record;
    }
  };

  // ── 0. Tenant kill switch (in addition to the process-wide one in adjudicate()) ──
  if (ctx?.killSwitch.isKilled()) {
    const killState = ctx.killSwitch.state();
    const decision = decisionRefuse(
      refuse(
        "SECURITY",
        "kill_switch_active",
        "System is temporarily unavailable.",
        `Tenant kill switch active: ${killState.reason} (toggledAt ${killState.toggledAt})`,
      ),
      [
        basis("kill", BASIS_CODES.kill.ACTIVE, {
          reason: killState.reason,
          toggledAt: killState.toggledAt,
          tenant: ctx.id,
        }),
      ],
    );
    const durationMs = clock.nowMs() - start;
    emitDecision({
      intentKind: envelope.kind,
      decision: decision.kind,
      latencyMs: durationMs,
      basisCount: decision.basis.length,
      intentHash: envelope.intentHash,
    });
    if (decision.kind === "REFUSE") {
      emitRefusal({
        intentKind: envelope.kind,
        refusal: decision.refusal,
        intentHash: envelope.intentHash,
      });
    }
    // ── LearningSink on the kill-switch path (LogicReviewer-005) ────────
    // The main path emits an outcome (line ~415); the kill-switch early
    // return previously skipped it, so the analytics pipeline never saw the
    // refusals a tenant kill switch produced. Mirror the main-path structure.
    // Telemetry must NEVER block the kernel — emit inside try/catch so a
    // failing LearningSink cannot change the Decision, the AuditRecord, or
    // any hash. guardId/guardPhase/planFingerprint are intentionally omitted:
    // the kill-switch path bypasses guard evaluation entirely, so there is no
    // matched guard to record (matches main-path matchedGuardIdFromTrace([])).
    try {
      emitOutcome({
        intentKind: envelope.kind,
        decisionKind: decision.kind,
        basisCodes: flattenBasis(decision.basis),
        taint: envelope.taint,
        durationMs,
        intentHash: envelope.intentHash,
        at: clock.nowIso(),
      });
    } catch (err) {
      emitSinkFailure({
        sink: "learning",
        subject: envelope.intentHash,
        errorClass: err instanceof Error ? err.name : "Error",
        consecutiveFailures: 1,
      });
    }
    const record = applyMeta(
      buildAuditRecord({
        envelope,
        decision,
        durationMs,
        at: clock.nowIso(),
        ...(deps.supersedes !== undefined ? { supersedes: deps.supersedes } : {}),
      }),
    );
    try {
      await deps.sink.emit(record);
    } finally {
      // The tenant kill switch returns a non-EXECUTE decision — roll the
      // rate-limit counter back even if the audit emit throws, so a
      // maintenance window does not poison legitimate users' budgets
      // (audit consolidated-async-tail, case (c): early return skipped rollback).
      if (deps.rateLimitRollback) {
        try {
          await deps.rateLimitRollback();
        } catch (err) {
          // Rollback must not crash the kernel; surface the swallowed failure
          // to the metrics sink rather than dropping it (ErrorReviewer-005).
          emitSinkFailure({
            sink: "rate-limit",
            subject: envelope.intentHash,
            errorClass: err instanceof Error ? err.name : "Error",
            consecutiveFailures: 1,
          });
        }
      }
    }
    return { decision, record, ledgerHit: null };
  }

  // ── 1. Ledger consult ──────────────────────────────────────────────
  let ledgerHit: LedgerHit | null = null;
  if (deps.ledger) {
    const checkStart = clock.nowMs();
    ledgerHit = await deps.ledger.checkLedger(envelope.intentHash);
    emitLedgerOp({
      op: "check",
      outcome: ledgerHit ? "hit" : "miss",
      intentKind: envelope.kind,
      latencyMs: clock.nowMs() - checkStart,
      intentHash: envelope.intentHash,
    });
  }

  let decision: Decision;
  let trace: ReadonlyArray<AdjudicationTraceEntry> = [];
  // Auto-derived supersedes for the confirmation-receipt path. The explicit
  // `deps.supersedes` (set by adapters for defer_resumed / rewrite_executed /
  // replay) always wins over this auto-derivation.
  let confirmationSupersedes: Supersession | undefined;
  // ConcurrencyReviewer-002: track whether THIS call claimed the ledger key
  // (recordExecution returned "acquired"). Set true only inside the
  // recordExecution block below. Never set on the REPLAY_SUPPRESSED racing
  // path (outcome === "exists") — releasing there would delete another live
  // caller's claim. Used in the audit-emit catch to best-effort release an
  // orphaned key when sink.emit throws after an EXECUTE claim.
  let ledgerAcquired = false;
  if (ledgerHit) {
    decision = replaySuppressedRefusal(envelope.intentHash, ledgerHit);
  } else {
    // ── 2. Sync deterministic kernel ────────────────────────────────
    // Use the tracing variant so the matched-guard identity flows into
    // LearningEvent.guardId (ADR-105). Trace fidelity is structurally
    // guaranteed — adjudicate() and adjudicateWithTrace() share an
    // implementation; the trace describes the same path.
    const traced = adjudicateWithTrace(envelope, state, policy);
    decision = traced.decision;
    trace = traced.trace;

    // ── 2a. Confirmation-receipt override ────────────────────────────
    // When the caller asserts that the user confirmed THIS envelope and
    // the kernel returned REQUEST_CONFIRMATION, substitute EXECUTE with
    // an appended confirmation:received basis. State/taint/auth guards
    // already ran; only the threshold-style "ask first" step is
    // satisfied by the receipt. Other Decisions flow through unchanged.
    if (
      decision.kind === "REQUEST_CONFIRMATION" &&
      deps.confirmationReceipt !== undefined &&
      deps.confirmationReceipt.intentHash === envelope.intentHash
    ) {
      decision = decisionExecute([
        ...decision.basis,
        basis("confirmation", BASIS_CODES.confirmation.RECEIVED, {
          confirmedAt: deps.confirmationReceipt.at,
          originalPrompt: decision.prompt,
        }),
      ]);
      // Auto-derive supersedes for confirmation_resolved when the caller
      // did not pass one explicitly. This links the post-confirmation
      // EXECUTE record back to the original REQUEST_CONFIRMATION audit row.
      //
      // Both additions below are STRICTLY OPT-IN / ADDITIVE (determinism
      // fence): when the caller passes neither `originalAt` nor `token`, the
      // derived `supersedes` is byte-identical to the pre-existing shape
      // ({ predecessorIntentHash, predecessorAt: at, reason }) — so the
      // auditHash is unchanged.
      //   - LogicReviewer-004: predecessorAt prefers `originalAt` (the
      //     predecessor audit row's `at`) and falls back to the confirmation
      //     `at` when the caller did not supply it.
      //   - AuthReviewer-005: token is included only when supplied; an
      //     omitted token leaves the key off the object entirely.
      confirmationSupersedes = {
        predecessorIntentHash: deps.confirmationReceipt.intentHash,
        predecessorAt:
          deps.confirmationReceipt.originalAt ?? deps.confirmationReceipt.at,
        reason: "confirmation_resolved" as const,
        ...(deps.confirmationReceipt.token !== undefined
          ? { token: deps.confirmationReceipt.token }
          : {}),
      };
    }

    // ── 3. EXECUTE-race fix: claim the ledger key ───────────────────
    if (decision.kind === "EXECUTE" && deps.ledger) {
      const recordStart = clock.nowMs();
      // LogicReviewer-013: `""` is the load-bearing sentinel for "no resolver
      // wired, or resolver returned nothing" — recordExecution stores it as the
      // empty resourceVersion and the ledger treats it as the version-agnostic
      // claim. It is NOT a placeholder for a real version; downstream readers
      // distinguish `""` (no version known) from a concrete row version.
      const resourceVersion =
        deps.resolveResourceVersion?.(envelope as IntentEnvelope, state) ?? "";
      const outcome = await deps.ledger.recordExecution({
        intentHash: envelope.intentHash,
        resourceVersion,
        sessionId: envelope.actor.sessionId,
        kind: envelope.kind,
      });
      emitLedgerOp({
        op: "record",
        outcome: outcome === "acquired" ? "ok" : "duplicate",
        intentKind: envelope.kind,
        latencyMs: clock.nowMs() - recordStart,
        intentHash: envelope.intentHash,
      });
      if (outcome === "acquired") {
        // This call won the SET-NX — record that so the audit-emit catch can
        // release the key if the durable AuditRecord never lands.
        ledgerAcquired = true;
      }
      if (outcome === "exists") {
        // Another adjudicateAndAudit call beat us between checkLedger and
        // recordExecution. Suppress the EXECUTE so side effects do not
        // double-fire. The race-loser still emits its own AuditRecord, with
        // the suppressed Decision — auditors see both attempts.
        const synthetic: LedgerHit = {
          resourceVersion,
          at: clock.nowIso(),
          sessionId: envelope.actor.sessionId,
          kind: envelope.kind,
        };
        decision = replaySuppressedRefusal(envelope.intentHash, synthetic);
      }
    }
  }

  // ── 4. MetricsSink ─────────────────────────────────────────────────
  const durationMs = clock.nowMs() - start;
  emitDecision({
    intentKind: envelope.kind,
    decision: decision.kind,
    latencyMs: durationMs,
    basisCount: decision.basis.length,
    intentHash: envelope.intentHash,
  });
  if (decision.kind === "REFUSE") {
    emitRefusal({
      intentKind: envelope.kind,
      refusal: decision.refusal,
      intentHash: envelope.intentHash,
    });
  }

  // ── 5. LearningSink ────────────────────────────────────────────────
  // Telemetry must never block — catch sink failures here so the audit
  // emit below is the only path that propagates errors.
  const planSnapshot = deps.plan?.();
  // ADR-105: derive guardId from the matched trace entry (metadata.name ??
  // guard.name). When the Decision came from the policy default or a
  // non-guard phase (kill/schema/taint), trace contains no match entry and
  // guardId is omitted.
  const guardId = matchedGuardIdFromTrace(trace);
  const guardPhase = matchedGuardPhaseFromTrace(trace);
  try {
    emitOutcome({
      intentKind: envelope.kind,
      decisionKind: decision.kind,
      basisCodes: flattenBasis(decision.basis),
      taint: envelope.taint,
      durationMs,
      intentHash: envelope.intentHash,
      ...(guardId !== undefined ? { guardId, guardName: guardId } : {}),
      ...(guardPhase !== undefined ? { guardPhase } : {}),
      ...(planSnapshot
        ? {
            planFingerprint: planFingerprintOf(planSnapshot),
          }
        : {}),
      at: clock.nowIso(),
    });
  } catch (err) {
    // Telemetry must never block the kernel — but a swallowed LearningSink
    // failure should still be observable, not vanish silently (ErrorReviewer-005).
    emitSinkFailure({
      sink: "learning",
      subject: envelope.intentHash,
      errorClass: err instanceof Error ? err.name : "Error",
      consecutiveFailures: 1,
    });
  }

  // ── 6. Audit emission ──────────────────────────────────────────────
  const supersedes = deps.supersedes ?? confirmationSupersedes;
  const kernelIdentity = ctx?.kernelIdentity
    ? { id: ctx.kernelIdentity.id, version: ctx.kernelIdentity.version }
    : undefined;
  const record = applyMeta(
    buildAuditRecord({
      envelope,
      decision,
      durationMs,
      at: clock.nowIso(),
      ...(planSnapshot ? { plan: planSnapshot } : {}),
      ...(supersedes !== undefined ? { supersedes } : {}),
      ...(kernelIdentity !== undefined ? { kernelIdentity } : {}),
    }),
  );

  // ── 6+7. Audit emission + rate-limit rollback (T5 #41) ─────────────
  // The rollback for a non-EXECUTE decision MUST fire even if sink.emit throws.
  // Pre-fix the rollback ran AFTER a bare `await sink.emit`, so a transient
  // audit-sink failure skipped it and poisoned the rate-limit counter for
  // legitimate users (audit consolidated-async-tail, case (a) — the
  // load-bearing one). try/finally guarantees the rollback.
  try {
    await deps.sink.emit(record);
  } catch (emitErr) {
    // ConcurrencyReviewer-002: if THIS call claimed the ledger key and the
    // durable AuditRecord then failed to land, the key is an orphan that would
    // suppress retries for the full TTL with no audit trail. Best-effort
    // release it so a retry of the same envelope can proceed. A missing
    // `release` method (it is optional on the Ledger interface) is acceptable —
    // surface the orphan via telemetry so operators can intervene before TTL.
    // This is error-path-only cleanup: the success path is untouched, so no
    // Decision / AuditRecord / hash byte moves.
    if (ledgerAcquired && deps.ledger) {
      if (typeof deps.ledger.release === "function") {
        try {
          await deps.ledger.release(envelope.intentHash);
        } catch (releaseErr) {
          emitSinkFailure({
            sink: "ledger",
            subject: envelope.intentHash,
            errorClass:
              releaseErr instanceof Error ? releaseErr.name : "Error",
            consecutiveFailures: 1,
          });
        }
      } else {
        // Ledger does not support release — emit an observable orphan signal.
        emitSinkFailure({
          sink: "ledger",
          subject: envelope.intentHash,
          errorClass: "ledger_orphaned",
          consecutiveFailures: 1,
        });
      }
    }
    throw emitErr;
  } finally {
    if (decision.kind !== "EXECUTE" && deps.rateLimitRollback) {
      try {
        await deps.rateLimitRollback();
      } catch (err) {
        // Rollback must not crash the kernel, but a swallowed failure poisons a
        // user's rate-limit budget — surface it to the metrics sink (ErrorReviewer-005).
        emitSinkFailure({
          sink: "rate-limit",
          subject: envelope.intentHash,
          errorClass: err instanceof Error ? err.name : "Error",
          consecutiveFailures: 1,
        });
      }
    }
  }

  return { decision, record, ledgerHit };
}

function replaySuppressedRefusal(intentHash: string, hit: LedgerHit): Decision {
  return decisionRefuse(
    refuse(
      "STATE",
      "ledger_replay_suppressed",
      "This action has already been processed.",
      `intentHash=${intentHash} previousAt=${hit.at}`,
    ),
    [
      basis("ledger", BASIS_CODES.ledger.REPLAY_SUPPRESSED, {
        previousAt: hit.at,
        sessionId: hit.sessionId,
        kind: hit.kind,
        resourceVersion: hit.resourceVersion,
      }),
    ],
  );
}

/**
 * Compute the same plan fingerprint that `buildAuditRecord` will compute,
 * so the LearningEvent and AuditRecord cross-correlate by sha256.
 */
function planFingerprintOf(plan: Omit<AuditPlanSnapshot, "planFingerprint">): string {
  return sha256Canonical({
    visibleReadTools: plan.visibleReadTools,
    allowedIntents: plan.allowedIntents,
  });
}
