import { createClient, type RedisClientType } from "redis";
import type { RedisLedgerClient } from "@adjudicate/audit";
import type { ApprovalRedisClient } from "@adjudicate/approval-engine";
import type { TokenUsageRedisClient } from "@adjudicate/adapter-core";

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

// Snapshot REDIS_URL once at module load so config can't drift mid-process
// (a later mutation of process.env.REDIS_URL must not change which Redis the
// already-decided adapter targets). The connection is still opened lazily on
// first call; only the resolved URL is frozen here. `undefined` when unset —
// the "throw if unset" behavior below is preserved against this snapshot.
const REDIS_URL = process.env.REDIS_URL;

let clientPromise: Promise<RedisClientType> | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (clientPromise) return clientPromise;
  if (!REDIS_URL) {
    throw new Error(
      "[redis-client] REDIS_URL is not set. Either set it to enable the Redis-coordinated emergency store, or do not call createLazyRedisLedgerAdapter().",
    );
  }
  const c = createClient({ url: REDIS_URL }) as RedisClientType;
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

/**
 * `ApprovalRedisClient` adapter for the Redis-backed `ApprovalRegistry`
 * (ADR-136). Exposes `set(k,v,exSeconds)/get/del/keys` over the same lazily-
 * opened connection. `keys` uses SCAN (NOT the blocking `KEYS`) so a large
 * keyspace doesn't stall Redis; bounded by the registry's `keyPrefix`.
 *
 * This persists ONLY the display projection — it is NOT the authorization
 * mechanism. The single-use confirmation take + hash verify live in
 * adapter-core's `confirm()`, not here.
 */
export function createLazyRedisApprovalAdapter(): ApprovalRedisClient {
  return {
    async set(key, value, exSeconds) {
      const c = await getRedisClient();
      await c.set(key, value, { EX: exSeconds });
    },
    async get(key) {
      const c = await getRedisClient();
      const result = await c.get(key);
      return result ?? null;
    },
    async del(key) {
      const c = await getRedisClient();
      return c.del(key);
    },
    async keys(pattern) {
      const c = await getRedisClient();
      const found: string[] = [];
      // SCAN avoids the O(N)-blocking KEYS; node-redis exposes an async iterator
      // that yields one key per step.
      for await (const key of c.scanIterator({ MATCH: pattern, COUNT: 200 })) {
        found.push(key);
      }
      return found;
    },
  };
}

/**
 * `TokenUsageRedisClient` adapter for the Redis-backed `TokenUsageStore`
 * (ADR-135 durable variant). `scan` enumerates the `llm:tokens:*` keys the
 * agent runtime writes — SCAN (NOT the blocking `KEYS`), same lazy connection.
 * READ-ONLY: the console never writes these keys (the runtime owns them).
 */
export function createLazyRedisTokenUsageAdapter(): TokenUsageRedisClient {
  return {
    async scan(pattern) {
      const c = await getRedisClient();
      const found: string[] = [];
      for await (const key of c.scanIterator({ MATCH: pattern, COUNT: 200 })) {
        found.push(key);
      }
      return found;
    },
    async get(key) {
      const c = await getRedisClient();
      const result = await c.get(key);
      return result ?? null;
    },
  };
}
