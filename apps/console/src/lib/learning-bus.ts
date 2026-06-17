import { createLazyRedisPubSubClient } from "@/lib/redis-pubsub";
import type { RedisPubSubClient } from "@adjudicate/audit";

/**
 * Process-singleton real-time learning-event bus for the console (ERDS-060).
 *
 * # Honest wiring
 *
 * The reference console does NOT run the agent learning loop — the ibatexas
 * runtime does. There is therefore no in-process producer of `LearningEvent`s,
 * so an in-memory bus would have nothing to fan out.
 *
 * The real-time tail is wired ONLY when `REDIS_URL` is set: the ibatexas runtime
 * publishes each learning decision on the `learning.event.v1` Redis pub/sub
 * channel, and the console subscribes to that same channel. When `REDIS_URL` is
 * absent, `getLearningBus()` returns `null` and the learning-stream endpoint
 * returns 501 (the client shows the feature as disabled) — exactly the
 * Redis-or-fallback posture the audit bus uses (`./audit-bus.ts`).
 *
 * The bus is best-effort and never a governance source of truth: it is operator
 * telemetry, outside the kernel determinism boundary, and the kernel never reads
 * it.
 */

/** Redis channel the ibatexas runtime publishes learning events on. */
export const LEARNING_EVENT_CHANNEL = "learning.event.v1";

/**
 * The learning-event payload contract — SHARED with the ibatexas publisher.
 * Telemetry only; timestamps/`Date.now()` are fine (outside the determinism
 * boundary).
 */
export interface LearningEvent {
  readonly schemaVersion: 1;
  /** ISO-8601 timestamp of the decision. */
  readonly at: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly kind: string;
  readonly decisionKind?: string;
  readonly detail?: Record<string, unknown>;
}

/** Subscribe-only learning bus over Redis pub/sub. */
export interface LearningBus {
  /**
   * Subscribe to the learning channel. The handler receives each decoded
   * `LearningEvent`. Returns an async unsubscribe. Handlers MUST NOT throw
   * (the underlying pub/sub adapter guards regardless).
   */
  subscribe(handler: (event: LearningEvent) => void): Promise<() => Promise<void>>;
}

let bus: LearningBus | null | undefined;

function createRedisLearningBus(pubsub: RedisPubSubClient): LearningBus {
  return {
    async subscribe(handler) {
      return pubsub.subscribe(LEARNING_EVENT_CHANNEL, (message: string) => {
        // Decode the JSON envelope; skip a malformed message rather than throw.
        let event: LearningEvent;
        try {
          const parsed = JSON.parse(message) as unknown;
          if (typeof parsed !== "object" || parsed === null) return;
          event = parsed as LearningEvent;
        } catch {
          return;
        }
        handler(event);
      });
    },
  };
}

/**
 * Returns the shared learning bus, or `null` when no live transport is
 * configured (the caller returns 501). Memoized per process.
 */
export function getLearningBus(): LearningBus | null {
  if (bus !== undefined) return bus;
  if (!process.env.REDIS_URL) {
    bus = null;
    return bus;
  }
  bus = createRedisLearningBus(createLazyRedisPubSubClient());
  return bus;
}
