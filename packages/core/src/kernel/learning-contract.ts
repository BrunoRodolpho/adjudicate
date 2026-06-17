/**
 * `LearningEventV1` — the cross-service learning-telemetry WIRE contract.
 *
 * This is the payload the ibatexas runtime publishes (NATS subject + Redis
 * pub/sub channel `learning.event.v1`) and the adjudicate console live-tails on
 * the learning SSE stream. It was hand-copied in BOTH consumers
 * (`apps/console/src/lib/learning-bus.ts` here and
 * `apps/api/src/learning-sink-bootstrap.ts` in ibatexas), which let the two
 * drift. Single-sourcing it in `@adjudicate/core` kills that drift (UltraReview
 * #94-20 / #28-11).
 *
 * # Why `LearningEventV1` and not `LearningEvent`
 *
 * The kernel already exports a DIFFERENT `LearningEvent` (`./learning.ts`) —
 * per-decision adjudication telemetry (intentKind / basisCodes / taint /
 * durationMs / intentHash). That type stays. This wire type is the coarser
 * pub/sub envelope (agentId / sessionId / kind / detail), so it carries the
 * `V1` suffix to avoid a name collision in the kernel barrel.
 *
 * # Telemetry, not governance
 *
 * This is best-effort operator telemetry that lives OUTSIDE the kernel
 * determinism boundary — wall-clock timestamps are fine, the kernel never reads
 * it, and a dropped event never affects adjudication. `schemaVersion` is pinned
 * so a consumer can reject anything it doesn't understand before fan-out.
 */

/** Wire schema version. Consumers reject any payload whose value differs. */
export const LEARNING_EVENT_SCHEMA_VERSION = 1 as const;

/** Redis pub/sub channel the runtime publishes learning events on. */
export const LEARNING_EVENT_CHANNEL = "learning.event.v1" as const;

/**
 * NATS subject (short form — the ibatexas client prepends `ibatexas.`, so the
 * wire subject is `ibatexas.learning.event.v1`, captured by the `IBX_LEARNING`
 * JetStream stream).
 */
export const LEARNING_EVENT_SUBJECT = "learning.event.v1" as const;

/**
 * The learning-event payload — EXACT shape shared by the ibatexas publisher and
 * the adjudicate console consumer. Telemetry only.
 */
export interface LearningEventV1 {
  /** Pinned to {@link LEARNING_EVENT_SCHEMA_VERSION}. */
  readonly schemaVersion: 1;
  /** ISO-8601 timestamp of the decision (wall-clock — outside determinism). */
  readonly at: string;
  /** Agent id (e.g. `pix-payment-failure-remediation`) or chat actor namespace. */
  readonly agentId: string;
  /** The session / conversation namespace the event belongs to. */
  readonly sessionId: string;
  /** Coarse event kind (e.g. `agent.turn`). */
  readonly kind: string;
  /** Kernel decision kind for the turn, when one is known. */
  readonly decisionKind?: string;
  /** Free-form, already-redacted detail bag. */
  readonly detail?: Record<string, unknown>;
}
