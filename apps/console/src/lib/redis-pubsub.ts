import { createClient, type RedisClientType } from "redis";
import type { RedisPubSubClient } from "@adjudicate/audit";

/**
 * Lazy Redis `RedisPubSubClient` adapter for the real-time audit event bus.
 *
 * Redis pub/sub requires a SEPARATE connection for SUBSCRIBE (a subscribed
 * connection cannot issue normal commands). The `redis` package models this
 * with `client.duplicate()`. This adapter opens a publisher connection lazily,
 * and a duplicated subscriber connection on the first `subscribe()` call.
 *
 * Both connections are opened lazily (not at module load) so a misconfigured
 * `REDIS_URL` does not crash the route handler at import time. The connection
 * is reused across calls.
 *
 * Shape matches `@adjudicate/audit`'s `RedisPubSubClient` — the same surface
 * the kill-switch v2 pub/sub consumes:
 *   - `publish(channel, message)` → number of receivers
 *   - `subscribe(channel, handler)` → Promise<unsubscribe>
 */

// Snapshot REDIS_URL once at module load so config can't drift mid-process.
const REDIS_URL = process.env.REDIS_URL;

let publisherPromise: Promise<RedisClientType> | null = null;

async function getPublisher(): Promise<RedisClientType> {
  if (publisherPromise) return publisherPromise;
  if (!REDIS_URL) {
    throw new Error(
      "[redis-pubsub] REDIS_URL is not set. The real-time audit bus requires Redis; the console falls back to polling when it is absent.",
    );
  }
  const c = createClient({ url: REDIS_URL }) as RedisClientType;
  c.on("error", (err) => {
    console.error("[redis-pubsub] publisher connection error:", err);
  });
  publisherPromise = c.connect().then(() => c);
  return publisherPromise;
}

/**
 * Construct a lazy `RedisPubSubClient`. Each `subscribe` call duplicates the
 * publisher connection into a dedicated subscriber connection and tears it
 * down on unsubscribe — matching the `@adjudicate/audit` lazy-subscribe
 * lifecycle (one SUBSCRIBE per active channel subscription).
 */
export function createLazyRedisPubSubClient(): RedisPubSubClient {
  return {
    async publish(channel: string, message: string): Promise<number> {
      const c = await getPublisher();
      return c.publish(channel, message);
    },
    async subscribe(
      channel: string,
      handler: (message: string) => void,
    ): Promise<() => Promise<void>> {
      const publisher = await getPublisher();
      // A subscribed connection cannot run other commands — duplicate.
      const subscriber = publisher.duplicate() as RedisClientType;
      subscriber.on("error", (err) => {
        console.error("[redis-pubsub] subscriber connection error:", err);
      });
      await subscriber.connect();
      await subscriber.subscribe(channel, (message: string) => {
        // Handler MUST NOT throw (bus contract); guard defensively anyway.
        try {
          handler(message);
        } catch (err) {
          console.error("[redis-pubsub] subscriber handler threw:", err);
        }
      });
      return async () => {
        try {
          await subscriber.unsubscribe(channel);
        } finally {
          await subscriber.quit();
        }
      };
    },
  };
}
