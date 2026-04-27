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
import { adjudicate } from "./adjudicate.js"
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
          planFingerprint: event.planFingerprint?.slice(0, 8),
        }),
      )
    },
  }
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
  const decision = adjudicate(envelope, state, policy)
  const durationMs = now() - start
  try {
    recordOutcome({
      intentKind: envelope.kind,
      decisionKind: decision.kind,
      basisCodes: flattenBasis(decision.basis),
      taint: envelope.taint,
      durationMs,
      intentHash: envelope.intentHash,
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
