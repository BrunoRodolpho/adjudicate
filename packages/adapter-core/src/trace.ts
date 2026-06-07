/**
 * Adapter loop trace hooks — low-cardinality lifecycle events.
 *
 * The adapter loop's existing `AgentEvent` stream is detailed enough
 * for replay and debugging but unfocused for observability — every
 * tool_use, tool_result, intent_proposed, etc. is an event, which is
 * the WRONG cardinality for production tracing.
 *
 * This module is the focused TRACE surface: a small set of phase
 * transitions an operator dashboard wants to know about, with
 * controlled-vocabulary attribute strings.
 *
 * # What goes through here
 *
 *   - `iteration_start`  — bumping the iteration counter
 *   - `tool_use_seen`    — total count of LLM tool_use blocks per turn
 *   - `decision_emitted` — kernel returned a Decision
 *   - `paused`           — DEFER/REQUEST_CONFIRMATION/ESCALATE handled
 *   - `completed`        — loop terminated cleanly
 *
 * Adopters wire `TraceSink` to their observability stack:
 *
 *   const traceSink: TraceSink = {
 *     onTrace(evt) {
 *       tracer.startSpan(evt.phase, { attributes: evt.attributes }).end();
 *     }
 *   };
 *
 * Pass to `createAdjudicatedAgent({ ..., traceSink })`. The loop fires
 * one TraceEvent per documented phase per session. NO per-record
 * fan-out. NO high-cardinality data (intent payloads, conversation
 * history). Cardinality is bounded by `(pack-id × decision-kind × phase)`.
 *
 * # Replay safety
 *
 * Trace emission is fire-and-forget. The sink MUST NOT throw — the loop
 * does not try/catch around it. If the sink misbehaves, adjudication
 * still completes; only telemetry is lost.
 */

import type { Decision } from "@adjudicate/core";

export type AdapterTracePhase =
  | "iteration_start"
  | "decision_emitted"
  | "paused"
  | "completed"
  | "max_iterations_exceeded"
  | "config_seal_violation";

export type AdapterPauseReason =
  | "deferred"
  | "awaiting_confirmation"
  | "escalated";

/**
 * A single trace event from the adapter loop. The attributes are
 * deliberately small + controlled-vocabulary; adopters MUST NOT add
 * per-payload data here. (For replayable forensic detail use the
 * AgentEvent stream, which is record-grained.)
 */
export interface AdapterTraceEvent {
  readonly phase: AdapterTracePhase;
  readonly sessionId: string;
  /** 1-based iteration counter, capped by `maxIterations`. */
  readonly iteration: number;
  /** Set when the event corresponds to a Decision. */
  readonly decisionKind?: Decision["kind"];
  /** Set on `phase === "paused"`. */
  readonly pauseReason?: AdapterPauseReason;
}

/** Adopter-supplied trace sink. MUST NOT throw. */
export interface TraceSink {
  onTrace(event: AdapterTraceEvent): void;
}

/**
 * No-op trace sink. Default when none is supplied. Zero allocation,
 * zero overhead.
 */
export const noopTraceSink: TraceSink = {
  onTrace() {
    /* no-op */
  },
};

/**
 * In-memory trace sink for tests. Captures every event in
 * registration order.
 */
export function createInMemoryTraceSink(): TraceSink & {
  readonly events: ReadonlyArray<AdapterTraceEvent>;
  reset(): void;
} {
  const events: AdapterTraceEvent[] = [];
  return {
    events,
    onTrace(event) {
      events.push(event);
    },
    reset() {
      events.length = 0;
    },
  };
}
