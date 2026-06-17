import { createLazyRedisPubSubClient } from "@/lib/redis-pubsub";
import type { RedisPubSubClient } from "@adjudicate/audit";
import {
  LEARNING_EVENT_CHANNEL,
  LEARNING_EVENT_SCHEMA_VERSION,
  type LearningEventV1,
} from "@adjudicate/core";

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
 * # Single subscription, N subscribers (#28-6)
 *
 * `createLazyRedisPubSubClient().subscribe()` duplicates a Redis connection per
 * call, so subscribing once per SSE client would leak one connection per open
 * tab. This bus instead multiplexes: it keeps a `Map<symbol, handler>` and
 * issues exactly ONE `pubsub.subscribe()` (guarded by `ensureSubscribed`),
 * fanning each decoded event out to every handler and tearing the shared
 * subscription down on the last unsubscribe. Mirrors `createRedisAuditEventBus`
 * (`@adjudicate/audit` `event-bus.ts`), but keeps the ASYNC unsubscribe shape
 * the SSE route depends on.
 *
 * The bus is best-effort and never a governance source of truth: it is operator
 * telemetry, outside the kernel determinism boundary, and the kernel never reads
 * it.
 */

/**
 * Redis channel the ibatexas runtime publishes learning events on. Re-exported
 * from `@adjudicate/core` so the wire channel is single-sourced (item A).
 */
export { LEARNING_EVENT_CHANNEL } from "@adjudicate/core";

/**
 * The learning-event payload contract — now single-sourced from
 * `@adjudicate/core` (`LearningEventV1`) instead of a hand-copied interface, so
 * the publisher (ibatexas) and this consumer can no longer drift (item A).
 */
export type LearningEvent = LearningEventV1;

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

/** @internal — exported for tests; production callers use `getLearningBus()`. */
export function createRedisLearningBus(pubsub: RedisPubSubClient): LearningBus {
  // Per-bus-instance fan-out registry, keyed by a unique symbol for O(1) removal.
  const handlers = new Map<symbol, (event: LearningEvent) => void>();
  let unsubscribe: (() => Promise<void>) | null = null;
  let subscribingPromise: Promise<void> | null = null;

  // Issue the single shared SUBSCRIBE exactly once; concurrent callers share the
  // in-flight subscribe rather than each opening a new Redis connection.
  async function ensureSubscribed(): Promise<void> {
    if (unsubscribe !== null) return;
    if (subscribingPromise !== null) {
      await subscribingPromise;
      return;
    }
    subscribingPromise = (async () => {
      const unsub = await pubsub.subscribe(LEARNING_EVENT_CHANNEL, (message: string) => {
        // Decode ONCE per message, then fan out to every registered handler.
        let parsed: unknown;
        try {
          parsed = JSON.parse(message);
        } catch {
          return; // skip a malformed message rather than throw
        }
        if (typeof parsed !== "object" || parsed === null) return;
        // #28-11: reject any payload whose schemaVersion isn't the one we
        // understand before forwarding it to SSE clients.
        if (
          (parsed as { schemaVersion?: unknown }).schemaVersion !==
          LEARNING_EVENT_SCHEMA_VERSION
        ) {
          return;
        }
        const event = parsed as LearningEvent;
        // Snapshot so a handler added/removed during fan-out can't disturb it.
        const snapshot = Array.from(handlers.values());
        for (const handler of snapshot) {
          try {
            handler(event);
          } catch {
            // Handlers MUST NOT throw (bus contract); guard defensively anyway.
          }
        }
      });
      unsubscribe = unsub;
    })();
    try {
      await subscribingPromise;
    } finally {
      subscribingPromise = null;
    }
  }

  return {
    async subscribe(handler) {
      const token = Symbol();
      handlers.set(token, handler);
      // Awaited (not fire-and-forget) so the SSE route's `.then(unsub)`/`.catch`
      // observes a real subscribe failure and can close the stream.
      try {
        await ensureSubscribed();
      } catch (err) {
        handlers.delete(token);
        throw err;
      }
      // Async unsubscribe — removes this handler and, when the last one leaves,
      // tears down the single shared Redis subscription.
      return async () => {
        handlers.delete(token);
        if (handlers.size === 0 && unsubscribe !== null) {
          const u = unsubscribe;
          unsubscribe = null;
          await u();
        }
      };
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
