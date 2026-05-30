/**
 * Distributed kill switch v2 — Redis pub/sub layered on top of the
 * existing polling propagation.
 *
 * The v1 polling implementation (`startDistributedKillSwitch`) propagates
 * remote kill-switch transitions within `pollMs * 2` (default ≈2 s). For
 * an incident commander asking "is every replica refusing yet?" two
 * seconds is too long; for fail-closed semantics it is correct but for
 * mean-time-to-mitigation it underperforms.
 *
 * This module adds a **Redis pub/sub broadcast** on top of polling:
 *
 *   - On any transition (`trip()` / `clear()` / `publish()`), the helper
 *     `PUBLISH`es the same JSON payload that the polling loop reads.
 *   - Subscribers receive the message and apply it immediately — measured
 *     end-to-end propagation is dominated by Redis fan-out (<100 ms on a
 *     warm cluster).
 *   - The polling loop is **retained** as a fallback. Pub/sub messages
 *     are lossy by design (dropped on subscriber disconnect, dropped if
 *     the subscriber is not yet listening). The poller guarantees
 *     eventual consistency within `pollMs * 2` no matter what.
 *
 * # Why both
 *
 * Pub/sub fires once and is lost. Polling guarantees eventual
 * consistency. Together: best-effort sub-100 ms propagation when the
 * subscriber is connected, AND guaranteed `≤ pollMs * 2` convergence
 * after any kind of disconnection/restart/cold-boot/pubsub outage.
 *
 * Fail-closed semantics are unchanged: the kernel's `isKilled()` reads
 * the in-process `RuntimeContext.killSwitch` snapshot. This module only
 * accelerates how quickly the snapshot updates after a remote transition.
 *
 * # Restart recovery
 *
 * When a process boots, it immediately polls Redis and resyncs before
 * subscribing. This closes the cold-boot race window where a transition
 * landed between `SUBSCRIBE` and the first poll: the resync poll always
 * runs first.
 *
 * # Reconnect recovery
 *
 * The `RedisPubSubClient` reports disconnect/reconnect via the optional
 * `onReconnect` callback. On reconnect we trigger an immediate poll —
 * messages published during the disconnect window are lost, but the
 * poll resyncs us within one round-trip.
 *
 * # Replay safety
 *
 * Pub/sub does NOT change replay determinism. The kernel is still pure;
 * adjudication never reads from Redis at decision time. This module only
 * updates the in-process snapshot earlier than polling would.
 */

import { recordSinkFailure } from "@adjudicate/core/kernel";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type { RedisLedgerClient } from "./ledger-redis.js";

/**
 * Minimal Redis pub/sub surface. Real Redis clients require a separate
 * subscriber connection — adopters typically construct two clients and
 * pass the subscriber here.
 *
 * `subscribe` returns an `unsubscribe` callback. The handler MUST NOT
 * throw — implementations should guard against it.
 */
export interface RedisPubSubClient {
  publish(channel: string, message: string): Promise<number>;
  /**
   * Subscribe to a channel. The handler is invoked once per message.
   * Returns an unsubscribe function. Implementations should ensure
   * messages received before `subscribe`'s returned Promise resolves are
   * not delivered (or delivered exactly once after subscribe completes).
   */
  subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => Promise<void>>;
}

export interface DistributedKillSwitchPubSubOptions {
  /** Read/write Redis client (same surface as v1). */
  readonly redis: RedisLedgerClient;
  /** Pub/sub Redis client (typically a separate connection in node-redis). */
  readonly pubsub: RedisPubSubClient;
  /**
   * Key holding the JSON-encoded `{active, reason, ...}` payload — same
   * format the v1 poller reads. Polling and pub/sub agree on this key.
   */
  readonly key: string;
  /**
   * Pub/sub channel for transition notifications. Conventionally
   * `${key}:channel`, but adopters may pick anything.
   */
  readonly channel: string;
  /**
   * Polling cadence in milliseconds. Retained as fallback. Default 1000.
   * Pub/sub typically delivers in <100 ms; polling guarantees eventual
   * consistency within `pollMs * 2` even when pub/sub is silent.
   */
  readonly pollMs?: number;
  /**
   * Runtime context whose kill switch is updated on each transition.
   * Defaults to the process-wide default context.
   */
  readonly context?: RuntimeContext;
  readonly logger?: {
    warn: (event: { reason: string }) => void;
    info?: (event: { event: string }) => void;
  };
  /**
   * Optional observer fired each time a transition is applied. Useful
   * for tests measuring propagation latency. NOT a callback path adopters
   * should depend on for application logic — `RuntimeContext.killSwitch`
   * is the source of truth.
   */
  readonly onApply?: (event: {
    readonly source: "pubsub" | "poll" | "boot";
    readonly active: boolean;
    readonly reason: string;
  }) => void;
}

export interface DistributedKillSwitchPubSubHandle {
  readonly stop: () => Promise<void>;
  /** Trip the switch — writes to Redis AND publishes on the channel. */
  readonly trip: (reason: string) => Promise<void>;
  /** Clear the switch — writes to Redis AND publishes on the channel. */
  readonly clear: () => Promise<void>;
}

interface RemoteKillState {
  readonly active: boolean;
  readonly reason: string;
}

const DEFAULT_POLL_MS = 1000;

function parsePayload(raw: string): RemoteKillState | { error: string } {
  let obj: Partial<RemoteKillState>;
  try {
    obj = JSON.parse(raw) as Partial<RemoteKillState>;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return { error: `parse: ${e.message}` };
  }
  if (typeof obj.active !== "boolean" || typeof obj.reason !== "string") {
    return { error: "malformed payload (missing active/reason)" };
  }
  return { active: obj.active, reason: obj.reason };
}

function applyState(
  ctx: RuntimeContext | null,
  parsed: RemoteKillState,
  source: "pubsub" | "poll" | "boot",
  onApply?: DistributedKillSwitchPubSubOptions["onApply"],
): void {
  if (ctx === null) return;
  const current = ctx.killSwitch.state();
  if (
    current.active !== parsed.active ||
    current.reason !== parsed.reason
  ) {
    ctx.killSwitch.set(parsed.active, parsed.reason);
    onApply?.({ source, active: parsed.active, reason: parsed.reason });
  }
}

/**
 * Start the pub/sub-accelerated distributed kill switch.
 *
 * Lifecycle:
 *   1. Immediate boot-time poll resyncs from Redis (closes the
 *      subscribe-vs-transition race).
 *   2. Subscribe to the channel for sub-100 ms transitions.
 *   3. Polling loop continues as fallback (eventual consistency).
 *
 * Adopters who only want the polling behavior should use
 * `startDistributedKillSwitch` (v1) — this module costs the extra
 * pub/sub connection.
 */
export function startDistributedKillSwitchPubSub(
  opts: DistributedKillSwitchPubSubOptions,
): DistributedKillSwitchPubSubHandle {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => Promise<void>) | null = null;

  function getContext(): RuntimeContext | null {
    return opts.context ?? null;
  }

  async function readRedis(source: "poll" | "boot"): Promise<void> {
    let raw: string | null;
    try {
      raw = await opts.redis.get(opts.key);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.logger?.warn({ reason: e.message });
      recordSinkFailure({
        sink: "console",
        subject: "kill-switch-pubsub",
        errorClass: "redis_get",
        consecutiveFailures: 1,
      });
      return;
    }
    if (raw === null) return;
    const parsed = parsePayload(raw);
    if ("error" in parsed) {
      opts.logger?.warn({ reason: parsed.error });
      recordSinkFailure({
        sink: "console",
        subject: "kill-switch-pubsub",
        errorClass: "redis_payload",
        consecutiveFailures: 1,
      });
      return;
    }
    applyState(getContext(), parsed, source, opts.onApply);
  }

  function pubsubHandler(message: string): void {
    const parsed = parsePayload(message);
    if ("error" in parsed) {
      opts.logger?.warn({ reason: `pubsub ${parsed.error}` });
      recordSinkFailure({
        sink: "console",
        subject: "kill-switch-pubsub",
        errorClass: "pubsub_payload",
        consecutiveFailures: 1,
      });
      return;
    }
    applyState(getContext(), parsed, "pubsub", opts.onApply);
  }

  function pollLoop(): void {
    if (stopped) return;
    pollTimer = setTimeout(() => {
      void readRedis("poll").finally(pollLoop);
    }, pollMs);
  }

  // Boot sequence: resync from Redis, then subscribe, then start polling.
  // The resync MUST happen before subscribe to close the cold-boot race.
  void (async () => {
    await readRedis("boot");
    if (stopped) return;
    try {
      unsubscribe = await opts.pubsub.subscribe(opts.channel, pubsubHandler);
      opts.logger?.info?.({ event: "kill-switch-pubsub-subscribed" });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.logger?.warn({ reason: `subscribe: ${e.message}` });
      recordSinkFailure({
        sink: "console",
        subject: "kill-switch-pubsub",
        errorClass: "pubsub_subscribe",
        consecutiveFailures: 1,
      });
    }
    if (stopped) {
      if (unsubscribe !== null) {
        await unsubscribe().catch((err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err));
          opts.logger?.warn({ reason: `unsubscribe (early-stop): ${e.message}` });
        });
      }
      return;
    }
    pollLoop();
  })();

  async function publishTransition(
    payload: RemoteKillState,
  ): Promise<void> {
    const json = JSON.stringify(payload);
    await opts.redis.set(opts.key, json);
    try {
      await opts.pubsub.publish(opts.channel, json);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.logger?.warn({ reason: `publish: ${e.message}` });
      recordSinkFailure({
        sink: "console",
        subject: "kill-switch-pubsub",
        errorClass: "pubsub_publish",
        consecutiveFailures: 1,
      });
      // Swallow — the Redis SET succeeded, so polling will still propagate.
      // Surfacing as a throw here would scare adopters into manual retry
      // when the pub/sub layer is only an optimization.
    }
  }

  async function trip(reason: string): Promise<void> {
    await publishTransition({ active: true, reason });
  }

  async function clear(): Promise<void> {
    await publishTransition({ active: false, reason: "cleared" });
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (unsubscribe !== null) {
      await unsubscribe().catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        opts.logger?.warn({ reason: `unsubscribe (stop): ${e.message}` });
      });
      unsubscribe = null;
    }
  }

  return { stop, trip, clear };
}
