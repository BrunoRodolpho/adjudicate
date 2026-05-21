/**
 * Deterministic-but-realistic Redis-shaped fakes for scale simulation.
 *
 * The fakes implement the same `RedisLedgerClient` and `RedisPubSubClient`
 * shapes the framework consumes in production. They add knobs the real
 * Redis client does not surface to the framework:
 *
 *   - per-message latency (uniform or jittered)
 *   - reconnect-storm trigger (forces every subscribe to re-register)
 *   - slow-consumer simulation (a per-handler additional delay)
 *   - malformed-payload injection (publishes garbage on demand)
 *   - partition simulation (drops a fraction of published messages)
 *
 * Everything is deterministic given the same RNG seed — the harness
 * outputs are reproducible across runs.
 */

import type { RedisLedgerClient } from "@adjudicate/audit";
import type { RedisPubSubClient } from "@adjudicate/audit";

/** Mulberry32 PRNG — small, deterministic, well-distributed. */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FakeRedisOptions {
  readonly latencyMs?: number;
  readonly jitterMs?: number;
  readonly rng?: () => number;
}

export function createFakeRedis(opts: FakeRedisOptions = {}): RedisLedgerClient {
  const store = new Map<string, string>();
  const rng = opts.rng ?? Math.random;
  async function delay(): Promise<void> {
    const base = opts.latencyMs ?? 0;
    const jitter = opts.jitterMs ?? 0;
    const total = base + (jitter > 0 ? Math.floor(rng() * jitter) : 0);
    if (total > 0) await new Promise((r) => setTimeout(r, total));
  }
  return {
    async get(key: string) {
      await delay();
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      await delay();
      store.set(key, value);
      return "OK";
    },
  } as unknown as RedisLedgerClient;
}

export interface FakePubSubOptions {
  /** Per-publish delivery latency floor, in milliseconds. */
  readonly latencyMs?: number;
  /** Random jitter added on top of latencyMs. */
  readonly jitterMs?: number;
  /** Per-handler additional delay — simulates a slow consumer. */
  readonly slowConsumerMs?: number;
  /** Fraction in [0, 1] of publishes that are silently dropped. */
  readonly dropRate?: number;
  readonly rng?: () => number;
}

export interface FakePubSub extends RedisPubSubClient {
  readonly listeners: Map<string, Set<(m: string) => void>>;
  readonly publishedCount: () => number;
  readonly droppedCount: () => number;
  /** Force every subscriber off — simulates a server-side disconnect. */
  forceDisconnect(): void;
  /** Block all future publishes (until `clearPartition` is called). */
  partition(): void;
  clearPartition(): void;
  /** Inject a malformed payload directly to listeners on a channel. */
  injectMalformed(channel: string, payload: string): void;
  /** Toggle slow-consumer delay (e.g., 0 to disable mid-run). */
  setSlowConsumerMs(ms: number): void;
}

export function createFakePubSub(opts: FakePubSubOptions = {}): FakePubSub {
  const listeners = new Map<string, Set<(m: string) => void>>();
  let published = 0;
  let dropped = 0;
  let partitioned = false;
  let slowMs = opts.slowConsumerMs ?? 0;
  const rng = opts.rng ?? Math.random;

  async function deliveryDelay(): Promise<void> {
    const base = opts.latencyMs ?? 0;
    const jitter = opts.jitterMs ?? 0;
    const total = base + (jitter > 0 ? Math.floor(rng() * jitter) : 0);
    if (total > 0) await new Promise((r) => setTimeout(r, total));
  }

  async function consumerDelay(): Promise<void> {
    if (slowMs > 0) await new Promise((r) => setTimeout(r, slowMs));
  }

  return {
    listeners,
    publishedCount: () => published,
    droppedCount: () => dropped,
    forceDisconnect() {
      listeners.clear();
    },
    partition() {
      partitioned = true;
    },
    clearPartition() {
      partitioned = false;
    },
    injectMalformed(channel: string, payload: string) {
      const set = listeners.get(channel);
      if (set === undefined) return;
      for (const h of set) {
        try {
          h(payload);
        } catch {
          // The framework guards handler crashes — we don't.
        }
      }
    },
    setSlowConsumerMs(ms: number) {
      slowMs = Math.max(0, ms);
    },
    async publish(channel: string, message: string) {
      published++;
      if (partitioned) {
        dropped++;
        return 0;
      }
      const drop = opts.dropRate ?? 0;
      if (drop > 0 && rng() < drop) {
        dropped++;
        return 0;
      }
      await deliveryDelay();
      const set = listeners.get(channel);
      if (set === undefined) return 0;
      let n = 0;
      // Slow-consumer simulation runs PER handler — emulates a back-pressured client.
      for (const h of set) {
        await consumerDelay();
        try {
          h(message);
          n++;
        } catch {
          // Framework guards subscriber-thrown errors; we still count delivered.
          n++;
        }
      }
      return n;
    },
    async subscribe(channel: string, handler: (m: string) => void) {
      const set = listeners.get(channel) ?? new Set();
      set.add(handler);
      listeners.set(channel, set);
      return async () => {
        set.delete(handler);
        if (set.size === 0) listeners.delete(channel);
      };
    },
  };
}
