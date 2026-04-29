import { createClient, type RedisClientType } from "redis";
import type { RedisLedgerClient } from "@adjudicate/audit";

/**
 * Lazy Redis client + `RedisLedgerClient` adapter.
 *
 * The pool is opened on first call (not at module load), so a misconfigured
 * `REDIS_URL` doesn't crash the route handler at import time — it surfaces
 * with a useful error message on the first emergency operation.
 *
 * `RedisLedgerClient` is the minimal `set`/`get` interface defined in
 * `@adjudicate/audit/ledger-redis.ts` — same shape the kernel's
 * `startDistributedKillSwitch` consumes. Adopters using a different
 * Redis client (ioredis, Upstash, etc.) write a 5-line wrapper of the
 * same shape.
 */

let clientPromise: Promise<RedisClientType> | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (clientPromise) return clientPromise;
  if (!process.env.REDIS_URL) {
    throw new Error(
      "[redis-client] REDIS_URL is not set. Either set it to enable the Redis-coordinated emergency store, or do not call createLazyRedisLedgerAdapter().",
    );
  }
  const c = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
  c.on("error", (err) => {
    console.error("[redis-client] connection error:", err);
  });
  clientPromise = c.connect().then(() => c);
  return clientPromise;
}

/**
 * `RedisLedgerClient` adapter that lazily resolves the underlying client
 * on each call. After the first connection, subsequent calls reuse the
 * cached promise's resolved client (no new connection per request).
 */
export function createLazyRedisLedgerAdapter(): RedisLedgerClient {
  return {
    async set(key, value, options) {
      const c = await getRedisClient();
      const setOpts: { NX?: true; EX?: number } = {};
      if (options?.NX) setOpts.NX = true;
      if (options?.EX !== undefined) setOpts.EX = options.EX;
      const result = await c.set(key, value, setOpts);
      return result ?? null;
    },
    async get(key) {
      const c = await getRedisClient();
      const result = await c.get(key);
      return result ?? null;
    },
  };
}
