// Learning surface — telemetry events for adaptation, drift detection, and
// policy-evolution analytics.
//
// Mirrors the MetricsSink pattern (singleton, setter, no-op default). Distinct
// from MetricsSink because the consumer audience is different: metrics route
// to operational dashboards (Sentry, PostHog) while learning events feed
// downstream analytics (BigQuery, Snowflake, the Phase 6 governance dashboard).
//
// Per-Decision granularity. Aggregating sinks (rolling windows, percentile
// snapshots) compose on top of this primitive — they are not part of the v0
// contract.

import type { Decision } from "../decision.js"
import type { DecisionBasis } from "../basis-codes.js"
import type { IntentEnvelope } from "../envelope.js"
import type { Taint } from "../taint.js"
import { adjudicateWithTrace, type AdjudicationTraceEntry } from "./adjudicate.js"
import type { PolicyBundle } from "./policy.js"

export interface LearningEvent {
  readonly intentKind: string
  readonly decisionKind: Decision["kind"]
  /**
   * Flattened "category:code" strings — same shape used by the Postgres
   * audit sink. Stable for analytics partition keys.
   */
  readonly basisCodes: readonly string[]
  readonly taint: Taint
  readonly durationMs: number
  /** Cross-reference to the AuditRecord and the kernel ledger. */
  readonly intentHash: string
  /**
   * Stable identifier of the guard that produced the Decision (the matched
   * guard, not the policy default). Derivation rule (ADR-105):
   *   guardId = metadata.name ?? guard.name
   *
   * `metadata.name` is populated when a guard was wrapped with `nameGuard`
   * or `withMetadata`. `guard.name` is JavaScript's `Function.name` —
   * non-empty for named function declarations and named consts, empty for
   * anonymous closures (e.g., a bare `createThresholdGuard(...)` without
   * `nameGuard`).
   *
   * Omitted when:
   *   - The Decision came from a non-guard phase (taint gate, kill switch,
   *     schema gate, policy default).
   *   - The matched guard is anonymous and carries no metadata.
   *
   * Names are presentation; IDs are identity. The field is named `guardId`
   * (not `guardName`) because analyzers, deprecation workflows, and rename
   * tooling will eventually require stable identifiers — Pack authors who
   * want stable IDs can override `metadata.name` with a slug rather than
   * a display name.
   */
  readonly guardId?: string
  /**
   * Display-friendly mirror of `guardId` — populated by the same trace-match
   * derivation. Provided as a separate field so analytics consumers can
   * distinguish "stable identifier" from "display label" once future tooling
   * splits the two (e.g., a Pack author renaming a guard while keeping its
   * audit-stable ID). At v0 the two are equal whenever `guardId` is defined.
   */
  readonly guardName?: string
  /**
   * Which of the four phases matched. Omitted when the Decision came from a
   * non-guard phase (kill / schema / policy default).
   */
  readonly guardPhase?: "state" | "taint" | "auth" | "business"
  /**
   * Optional sha256 of the planner's `(visibleReadTools, allowedIntents)`
   * tuple at decision time, populated by adopters who pass `plan` to
   * `buildAuditRecord`. Allows analytics to dedupe identical plans
   * across millions of decisions.
   */
  readonly planFingerprint?: string
  /** Wall-clock ISO-8601 of when the kernel returned the Decision. */
  readonly at: string
}

export interface LearningSink {
  recordOutcome(event: LearningEvent): void
}

let _sink: LearningSink = noopLearningSink()
let _explicitlySet = false

export function setLearningSink(sink: LearningSink): void {
  _sink = sink
  _explicitlySet = true
}

/**
 * Has a LearningSink been explicitly installed via setLearningSink?
 * Used by `installPack` to decide whether to install a default console sink.
 */
export function hasLearningSink(): boolean {
  return _explicitlySet
}

/** @internal — for tests. */
export function _resetLearningSink(): void {
  _sink = noopLearningSink()
  _explicitlySet = false
}

function noopLearningSink(): LearningSink {
  return { recordOutcome() {} }
}

/**
 * Internal helper called by `adjudicate()` after computing the Decision.
 * Adopters never call this directly — they install a sink via
 * `setLearningSink`.
 */
export function recordOutcome(event: LearningEvent): void {
  _sink.recordOutcome(event)
}

/**
 * Reference console-backed LearningSink. Suitable for development; production
 * deployments install a sink that writes to the analytics warehouse.
 */
export function createConsoleLearningSink(): LearningSink {
  return {
    recordOutcome(event) {
      console.log(
        "[adjudicate-learning]",
        JSON.stringify({
          intentKind: event.intentKind,
          decisionKind: event.decisionKind,
          basisCodes: event.basisCodes,
          taint: event.taint,
          durationMs: event.durationMs,
          intentHash: event.intentHash.slice(0, 8),
          guardId: event.guardId,
          planFingerprint: event.planFingerprint?.slice(0, 8),
        }),
      )
    },
  }
}

/**
 * Extract the matched-guard identity from an AdjudicationTrace, applying
 * the ADR-105 derivation rule. Returns `undefined` when no guard matched
 * (e.g., the policy default fired, or the kernel kill switch / schema gate
 * short-circuited the run).
 */
export function matchedGuardIdFromTrace(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): string | undefined {
  const matched = trace.find(
    (e) =>
      e.outcome === "match" &&
      (e.phase === "state" || e.phase === "auth" || e.phase === "business"),
  )
  return matched?.guardName
}

/**
 * Extract the policy phase that produced the Decision from an
 * AdjudicationTrace. Returns one of "state" | "taint" | "auth" | "business"
 * for guard-driven matches, or `undefined` when the Decision came from a
 * non-guard phase (kill / schema / default).
 */
export function matchedGuardPhaseFromTrace(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): "state" | "taint" | "auth" | "business" | undefined {
  const matched = trace.find(
    (e) =>
      e.outcome === "match" &&
      (e.phase === "state" ||
        e.phase === "taint" ||
        e.phase === "auth" ||
        e.phase === "business"),
  )
  if (!matched) return undefined
  // Narrow the phase union — the find predicate above already excluded
  // kill/schema/default but TS doesn't track that.
  return matched.phase as "state" | "taint" | "auth" | "business"
}

/**
 * Flatten a DecisionBasis array into "category:code" strings — the canonical
 * shape used in `LearningEvent.basisCodes` and the Postgres audit sink.
 */
export function flattenBasis(basis: readonly DecisionBasis[]): string[] {
  return basis.map((b) => `${b.category}:${b.code}`)
}

export interface AdjudicateAndLearnOptions {
  /** Optional plan fingerprint to cross-reference with the AuditRecord. */
  readonly planFingerprint?: string
  /**
   * Override for the wall-clock used to compute durationMs and emission
   * timestamps. Tests inject a fake; production uses the defaults.
   */
  readonly now?: () => number
  readonly clockIso?: () => string
}

/**
 * Sibling wrapper to `adjudicate()` that emits a `LearningEvent` after
 * computing the Decision. Keeps `adjudicate()` pure — adopters who want
 * the learning surface call this entry point; adopters who don't care
 * (or who run in a property-testing harness) keep using `adjudicate()`.
 *
 * Returns the same Decision the pure kernel would have returned. Sink
 * failures are absorbed — telemetry must never become a customer outage.
 */
export function adjudicateAndLearn<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
  options: AdjudicateAndLearnOptions = {},
): Decision {
  const now = options.now ?? Date.now
  const clockIso = options.clockIso ?? (() => new Date().toISOString())
  const start = now()
  const { decision, trace } = adjudicateWithTrace(envelope, state, policy)
  const durationMs = now() - start
  const guardId = matchedGuardIdFromTrace(trace)
  const guardPhase = matchedGuardPhaseFromTrace(trace)
  try {
    recordOutcome({
      intentKind: envelope.kind,
      decisionKind: decision.kind,
      basisCodes: flattenBasis(decision.basis),
      taint: envelope.taint,
      durationMs,
      intentHash: envelope.intentHash,
      ...(guardId !== undefined ? { guardId, guardName: guardId } : {}),
      ...(guardPhase !== undefined ? { guardPhase } : {}),
      ...(options.planFingerprint !== undefined
        ? { planFingerprint: options.planFingerprint }
        : {}),
      at: clockIso(),
    })
  } catch {
    // Sink failures are not the kernel's problem.
  }
  return decision
}
