import {
  createRedisAuditEventBus,
  type AuditEventBus,
} from "@adjudicate/audit";
import { createLazyRedisPubSubClient } from "@/lib/redis-pubsub";

/**
 * Process-singleton real-time `AuditEventBus` for the console.
 *
 * # Honest wiring
 *
 * The reference console does NOT run the kernel — it reads a durable store
 * (Postgres or in-memory mocks). There is therefore no in-process producer of
 * new `AuditRecord`s, so an in-memory bus would have nothing to fan out.
 *
 * The real-time tail is wired ONLY when `REDIS_URL` is set: a real kernel
 * deployment composes `bridgeAuditSinkToBus(sink, createRedisAuditEventBus(...))`
 * so every durable write is also published on the `audit.event.v1` Redis
 * channel. The console subscribes to that same channel. When `REDIS_URL` is
 * absent, `getAuditBus()` returns `null` and the live-tail UI falls back to
 * 2-second polling against the store (see `useLiveTail`) — exactly the same
 * Redis-or-fallback posture the kill-switch coordination uses.
 *
 * The bus is best-effort and never a governance source of truth: the durable
 * store remains authoritative, replay reads from it, and the kernel never reads
 * the bus.
 */

/** Redis channel a kernel deployment publishes audit records on (audit pkg default). */
export const AUDIT_EVENT_CHANNEL = "audit.event.v1";

let bus: AuditEventBus | null | undefined;

/**
 * Returns the shared real-time bus, or `null` when no live transport is
 * configured (the caller should fall back to polling). Memoized per process.
 */
export function getAuditBus(): AuditEventBus | null {
  if (bus !== undefined) return bus;
  if (!process.env.REDIS_URL) {
    bus = null;
    return bus;
  }
  bus = createRedisAuditEventBus({
    pubsub: createLazyRedisPubSubClient(),
    channel: AUDIT_EVENT_CHANNEL,
    logger: {
      warn: ({ reason }) => console.warn(`[audit-bus] ${reason}`),
    },
  });
  return bus;
}
