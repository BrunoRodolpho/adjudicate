/**
 * Distributed kill switch — cross-replica authority revocation via Redis.
 *
 * The kernel's `setKillSwitch` writes a module-level singleton — a single
 * process can revoke its own authority but nothing propagates across
 * replicas. In a 10-replica deployment, an operator flipping the switch
 * via the runtime API on one box leaves the other nine adjudicating.
 * `IBX_KILL_SWITCH=1` env-var pre-seed works only on next boot.
 *
 * This module ships a polled read-through: a remote operator writes
 * `{active: boolean, reason: string}` to a Redis key; every replica's
 * `startDistributedKillSwitch()` poller reads it on a `pollMs` cadence
 * and applies the value via `RuntimeContext.killSwitch.set()`. Within
 * `pollMs` of the remote write, every replica's `adjudicate()` returns
 * the kill-switch refusal.
 *
 * Why polling, not pub/sub: keeps the `adjudicate()` path strictly
 * synchronous. The kernel's `isKilled()` reads the in-process snapshot,
 * not Redis. Sub-second incident response is achievable by reducing
 * `pollMs` (default 1000); for true real-time, layer Redis pub/sub on
 * top — the adopter wiring is straightforward.
 */

import { recordSinkFailure } from "@adjudicate/core/kernel";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type { RedisLedgerClient } from "./ledger-redis.js";

export interface DistributedKillSwitchOptions {
  /** Redis client. Reuses the existing minimal `set`/`get` interface. */
  readonly redis: RedisLedgerClient;
  /** Key holding the JSON-encoded `{active, reason}` payload. */
  readonly key: string;
  /** Poll cadence in milliseconds. Default 1000. */
  readonly pollMs?: number;
  /**
   * Tenant runtime context whose kill switch is updated on each poll.
   * Defaults to the process-wide default context (back-compat).
   */
  readonly context?: RuntimeContext;
  /**
   * Optional structured logger. When omitted, poll failures are still
   * surfaced via `recordSinkFailure({ subject: "distributed-kill-switch" })`.
   */
  readonly logger?: {
    warn: (event: { reason: string }) => void;
  };
}

export interface DistributedKillSwitchHandle {
  /** Stop the poller. Idempotent. */
  readonly stop: () => Promise<void>;
  /**
   * Convenience: write the active state to the Redis key. Remote
   * pollers converge within `pollMs * 2`. Equivalent to `redis SET`.
   */
  readonly trip: (reason: string) => Promise<void>;
  /** Convenience: clear the active state. */
  readonly clear: () => Promise<void>;
}

interface RemoteKillState {
  readonly active: boolean;
  readonly reason: string;
}

const DEFAULT_POLL_MS = 1000;

export function startDistributedKillSwitch(
  opts: DistributedKillSwitchOptions,
): DistributedKillSwitchHandle {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Lazy resolve — the adopter may install a context after constructing
  // the poller. This also lets tests reset the default context between
  // runs without restarting the poller.
  function getContext(): RuntimeContext | null {
    return opts.context ?? null;
  }

  async function pollOnce(): Promise<void> {
    let raw: string | null;
    try {
      raw = await opts.redis.get(opts.key);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.logger?.warn({ reason: e.message });
      recordSinkFailure({
        sink: "console",
        subject: "distributed-kill-switch",
        errorClass: "redis_get",
        consecutiveFailures: 1,
      });
      return;
    }
    if (raw === null) {
      // Key absent — no remote override. Don't touch the local state.
      return;
    }
    let parsed: RemoteKillState;
    try {
      const obj = JSON.parse(raw) as Partial<RemoteKillState>;
      if (
        typeof obj.active !== "boolean" ||
        typeof obj.reason !== "string"
      ) {
        throw new Error("malformed payload");
      }
      parsed = { active: obj.active, reason: obj.reason };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.logger?.warn({ reason: `parse: ${e.message}` });
      recordSinkFailure({
        sink: "console",
        subject: "distributed-kill-switch",
        errorClass: "redis_payload",
        consecutiveFailures: 1,
      });
      return;
    }
    const ctx = getContext();
    if (ctx === null) return;
    const current = ctx.killSwitch.state();
    // Only apply on transition; idempotent SETs from the same operator
    // value should not churn the toggledAt timestamp.
    if (current.active !== parsed.active || current.reason !== parsed.reason) {
      ctx.killSwitch.set(parsed.active, parsed.reason);
    }
  }

  function loop(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void pollOnce().finally(loop);
    }, pollMs);
  }

  // Schedule the first poll for the next tick — gives adopters time to
  // wire the context before reads start.
  timer = setTimeout(() => {
    void pollOnce().finally(loop);
  }, 0);

  async function trip(reason: string): Promise<void> {
    await opts.redis.set(
      opts.key,
      JSON.stringify({ active: true, reason } satisfies RemoteKillState),
    );
  }

  async function clear(): Promise<void> {
    await opts.redis.set(
      opts.key,
      JSON.stringify({ active: false, reason: "cleared" } satisfies RemoteKillState),
    );
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { stop, trip, clear };
}
