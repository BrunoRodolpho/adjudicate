// IBX-IGE Phase P0-f — Observability primitives.
//
// Centralizes the four signals an operator needs to see for the kernel:
//   • ledger ops      — hit/miss/latency
//   • decisions       — kind distribution per intent class
//   • refusals        — kind/code distribution
//   • sink failures   — NATS audit emit failures (counts toward circuit-breaker)
//
// Exposes record* functions that:
//   1. emit a structured console.warn line (operator triage during incidents)
//   2. invoke a pluggable MetricsSink for analytics (PostHog) + Sentry
//
// Adopter wiring (e.g. in an app-level boot plugin or equivalent)
// installs a real sink at boot. Tests can install a mock sink for assertions.

import type { Decision } from "../decision.js"
import type { Refusal } from "../refusal.js"
import type {
  DivergenceClass,
  LegacyDecisionResult,
  ShadowTelemetrySink,
} from "./shadow.js"
import { setShadowTelemetrySink } from "./shadow.js"

// ── Sink contract ────────────────────────────────────────────────────────────

export interface MetricsSink {
  /** Ledger hit / miss / record / latency. */
  recordLedgerOp(op: LedgerOpEvent): void
  /** Final Decision per intent kind. */
  recordDecision(event: DecisionEvent): void
  /** REFUSE Decisions, broken out by refusal.kind/code. */
  recordRefusal(event: RefusalEvent): void
  /** Audit sink failures (NATS, console, Postgres). */
  recordSinkFailure(event: SinkFailureEvent): void
  /**
   * Optional. Shadow-mode divergence (one of the four DivergenceClass
   * values). Optional so downstream consumers running always-on kernels
   * with no shadow path can omit the method without keeping a no-op stub.
   * Framework call sites use `?.()` and the shadow-telemetry wiring in
   * `setMetricsSink` no-ops when the method is absent.
   */
  recordShadowDivergence?(event: ShadowDivergenceEvent): void
  /**
   * Optional. Resource-limit events (parked-envelope quota exceeded, future
   * back-pressure events). Optional so adopters with hand-written
   * MetricsSink implementations don't need to update for back-compat — the
   * helper `recordResourceLimit` no-ops when the method is absent.
   */
  recordResourceLimit?(event: ResourceLimitEvent): void
}

export interface ResourceLimitEvent {
  /** "defer_quota" today; future kinds add to this union. */
  readonly resource: "defer_quota"
  /** Subject namespace, typically a session id. */
  readonly subject: string
  /** Max allowed within the window. */
  readonly limit: number
  /** Observed value that triggered the event. */
  readonly observed: number
}

export interface LedgerOpEvent {
  readonly op: "check" | "record"
  readonly outcome: "hit" | "miss" | "ok" | "duplicate" | "error"
  readonly intentKind: string
  readonly latencyMs: number
  /**
   * SHA-256 hex hash of the envelope. Observability-only — not part of the
   * hashed audit record. Enables cross-referencing a ledger hit/miss event
   * with its corresponding DecisionEvent, RefusalEvent, and AuditRecord in
   * dashboards and incident tooling (SecurityReviewer-015).
   */
  readonly intentHash: string
}

export interface DecisionEvent {
  readonly intentKind: string
  readonly decision: Decision["kind"]
  readonly latencyMs: number
  readonly basisCount: number
  /** Audit subject for cross-referencing the durable trail. */
  readonly intentHash: string
}

export interface RefusalEvent {
  readonly intentKind: string
  readonly refusal: Refusal
  readonly intentHash: string
}

export interface SinkFailureEvent {
  /**
   * Well-known sink identifiers for `SinkFailureEvent.sink`:
   *   - `"console"` — the built-in console sink (dev / fallback)
   *   - `"nats"`    — NATS JetStream audit sink
   *   - `"postgres"` — Postgres audit sink
   *   - `"multi"`   — composite `multiSink` / `multiSinkLossy` wrapper
   *   - `"buffered"` — `bufferedSink` wrapper (async fan-out with replay)
   *
   * Custom sinks may supply any string label; the union is widened to
   * string for forward-compatibility while the well-known values serve
   * as canonical labels for dashboards and alerts.
   */
  readonly sink: "console" | "nats" | "postgres" | "multi" | "buffered" | (string & {})
  readonly subject: string
  readonly errorClass: string
  readonly consecutiveFailures: number
}

export interface ShadowDivergenceEvent {
  readonly intentKind: string
  readonly divergence: DivergenceClass
  readonly legacy: LegacyDecisionResult
  readonly adjudicate: Decision
}

// ── Default no-op sink ───────────────────────────────────────────────────────

let _sink: MetricsSink = noopSink()
let _explicitlySet = false
let _warnedMissingShadowDivergence = false

export function setMetricsSink(sink: MetricsSink): void {
  _sink = sink
  _explicitlySet = true
  // Boot-time signal when the installed sink omits the (now-optional)
  // recordShadowDivergence method. Shadow-mode telemetry will silently
  // route to a no-op — operators investigating an empty shadow-divergence
  // dashboard need to see this once at install time rather than discover
  // it through absence of data. The warn fires once per process; tests
  // that exercise install/install cycles reset via _resetMetricsSink().
  if (
    sink.recordShadowDivergence === undefined &&
    !_warnedMissingShadowDivergence
  ) {
    _warnedMissingShadowDivergence = true
    console.warn(
      "[adjudicate/metrics] installed MetricsSink does not implement recordShadowDivergence — shadow-mode divergence events will silently no-op. If this kernel runs in always-on mode (no shadow path) the omission is intentional; otherwise wire a method to surface BASIS_ONLY / DECISION_KIND / PAYLOAD_REWRITE divergence events to your observability backend.",
    )
  }
  // Also wire the shadow telemetry sink so all four divergence classes are
  // routed through the same pipeline as the rest of the metrics. Each call
  // uses `?.()` because `recordShadowDivergence` is optional on MetricsSink
  // (consumers with always-on kernels and no shadow path omit it). The
  // shadow telemetry sink itself stays wired; the routed method is a no-op
  // when the user's MetricsSink doesn't implement it.
  setShadowTelemetrySink({
    recordBasisOnly(intentKind, decision) {
      _sink.recordShadowDivergence?.({
        intentKind,
        divergence: "BASIS_ONLY",
        legacy: { kind: "EXECUTE" },
        adjudicate: decision,
      })
    },
    alertDecisionKind(intentKind, legacy, decision) {
      _sink.recordShadowDivergence?.({
        intentKind,
        divergence: "DECISION_KIND",
        legacy,
        adjudicate: decision,
      })
    },
    alertPayloadRewrite(intentKind, decision) {
      _sink.recordShadowDivergence?.({
        intentKind,
        divergence: "PAYLOAD_REWRITE",
        legacy: { kind: "EXECUTE" },
        adjudicate: decision,
      })
    },
  } satisfies ShadowTelemetrySink)
}

/**
 * Has a MetricsSink been explicitly installed via setMetricsSink?
 * Used by `installPack` to decide whether to install a default console sink.
 */
export function hasMetricsSink(): boolean {
  return _explicitlySet
}

/** @internal — for tests. */
export function _resetMetricsSink(): void {
  _sink = noopSink()
  _explicitlySet = false
  _warnedMissingShadowDivergence = false
}

function noopSink(): MetricsSink {
  return {
    recordLedgerOp() {},
    recordDecision() {},
    recordRefusal() {},
    recordSinkFailure() {},
    recordShadowDivergence() {},
    recordResourceLimit() {},
  }
}

// ── Helper functions used by call sites ─────────────────────────────────────

export function recordLedgerOp(event: LedgerOpEvent): void {
  _sink.recordLedgerOp(event)
}

export function recordDecision(event: DecisionEvent): void {
  _sink.recordDecision(event)
}

export function recordRefusal(event: RefusalEvent): void {
  _sink.recordRefusal(event)
}

export function recordSinkFailure(event: SinkFailureEvent): void {
  _sink.recordSinkFailure(event)
}

/**
 * Resource-limit hook. No-ops gracefully when the installed MetricsSink does
 * not implement `recordResourceLimit`. New code should always call this
 * helper rather than the method directly.
 */
export function recordResourceLimit(event: ResourceLimitEvent): void {
  _sink.recordResourceLimit?.(event)
}

// ── Ready-made console+log sink for development ────────────────────────────

/**
 * Reference sink that logs to console. Production replaces this with a sink
 * that emits Sentry breadcrumbs and posts to the analytics pipeline. Useful
 * out-of-the-box: `setMetricsSink(createConsoleMetricsSink())` at boot gives
 * full operator visibility with no extra dependencies.
 */
export function createConsoleMetricsSink(): MetricsSink {
  return {
    recordLedgerOp(event) {
      console.log("[ibx-metrics] ledger", JSON.stringify(event))
    },
    recordDecision(event) {
      console.log(
        "[ibx-metrics] decision",
        JSON.stringify({ ...event, intentHash: event.intentHash.slice(0, 8) }),
      )
    },
    recordRefusal(event) {
      console.warn(
        "[ibx-metrics] refusal",
        JSON.stringify({
          intentKind: event.intentKind,
          kind: event.refusal.kind,
          code: event.refusal.code,
          intentHash: event.intentHash.slice(0, 8),
        }),
      )
    },
    recordSinkFailure(event) {
      console.error("[ibx-metrics] sink_failure", JSON.stringify(event))
    },
    recordShadowDivergence(event) {
      const fn =
        event.divergence === "BASIS_ONLY"
          ? console.log
          : console.warn
      fn(
        "[ibx-metrics] shadow_divergence",
        JSON.stringify({
          intentKind: event.intentKind,
          divergence: event.divergence,
          legacy: event.legacy.kind,
          adjudicate: event.adjudicate.kind,
        }),
      )
    },
    recordResourceLimit(event) {
      console.warn("[ibx-metrics] resource_limit", JSON.stringify(event))
    },
  }
}
