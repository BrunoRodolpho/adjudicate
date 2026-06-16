import { createClient, type RedisClientType } from "redis";
import type { ApprovalRedisClient } from "@adjudicate/approval-engine";

/**
 * Lazy Redis client + `ApprovalRedisClient` adapter for the adjutant operator
 * app (ERDS-070). Mirrors the console's `apps/console/src/lib/redis-client.ts`.
 *
 * The pool is opened on first call (not at module load), so a misconfigured
 * `REDIS_URL` doesn't crash the route handler at import time — it surfaces with
 * a useful error message on the first registry operation.
 *
 * # Why the adjutant needs this
 *
 * The adjutant's approvals queue must read the SAME `adjudicate:approval:req:*`
 * keyspace the ibatexas runtime writes agent approvals into. Wiring the
 * Redis-backed `ApprovalRegistry` against that shared prefix makes the operator
 * see real, agent-driven approvals (not just the in-memory demo seed).
 */

// Snapshot REDIS_URL once at module load so config can't drift mid-process.
const REDIS_URL = process.env.REDIS_URL;

let clientPromise: Promise<RedisClientType> | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (clientPromise) return clientPromise;
  if (!REDIS_URL) {
    throw new Error(
      "[adjutant redis-client] REDIS_URL is not set. Either set it to enable the Redis-backed approval registry, or do not call createLazyRedisApprovalAdapter().",
    );
  }
  const c = createClient({ url: REDIS_URL }) as RedisClientType;
  c.on("error", (err) => {
    console.error("[adjutant redis-client] connection error:", err);
  });
  clientPromise = c.connect().then(() => c);
  return clientPromise;
}

/**
 * `ApprovalRedisClient` adapter for the Redis-backed `ApprovalRegistry`
 * (ADR-136). Exposes `set(k,v,exSeconds)/get/del/keys` over the same lazily-
 * opened connection. `keys` uses SCAN (NOT the blocking `KEYS`) so a large
 * keyspace doesn't stall Redis; bounded by the registry's `keyPrefix`.
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
