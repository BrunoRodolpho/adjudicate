/**
 * Rate-limit primitives — framework-level containment for "too many of this
 * intent kind from this caller in this window."
 *
 * The kernel `adjudicate()` is synchronous and pure. Counter I/O (Redis
 * INCR) is inherently async, so this module mirrors the framework's
 * existing idiom for ledger-shaped concerns: I/O lives outside the kernel,
 * and the kernel sees a pre-resolved value via state.
 *
 * Primitives:
 *
 *   1. `RateLimitStore` — async interface adopters wire to Redis (or any
 *      atomic-counter substrate).
 *
 *   2. `checkRateLimit(args)` — adopter calls this in their executor layer
 *      *before* `adjudicate()`, attaches the result to state.
 *
 *   3. `createRateLimitGuard({ resolveCount, max, onExceeded })` — synchronous
 *      `Guard` that reads the resolved count and emits an adopter-chosen
 *      Decision (REFUSE / ESCALATE / RUF) when the cap is exceeded.
 *
 *   4. `createInMemoryRateLimitStore()` — reference single-process store for
 *      tests and adopters that don't need cross-instance coordination.
 *
 * Adopters needing in-process rate limiting can short-cut: call
 * `checkRateLimit` inline from a synchronous wrapper (using an in-memory
 * store) and feed the count straight to the guard.
 */

import { basis, BASIS_CODES } from "../basis-codes.js";
import { decisionRefuse, type Decision } from "../decision.js";
import type { IntentEnvelope } from "../envelope.js";
import { refuse } from "../refusal.js";
import type { Guard } from "./policy.js";

// ── Store contract ─────────────────────────────────────────────────────────

export interface RateLimitStore {
  /**
   * Atomically increment the counter at `key` and return the new value.
   * On first call within a fresh window, starts at 1. Implementations MUST
   * scope the counter to a window of `windowMs` — typically via INCR + EXPIRE
   * NX in Redis. Cross-instance correctness is the implementation's
   * responsibility.
   */
  incrementAndGet(key: string, windowMs: number): Promise<number>;
  /**
   * T5 (#41 / top-priority E): roll back a previous increment. Used when
   * the kernel decides REFUSE/ESCALATE/DEFER (anything other than
   * EXECUTE) so that the rate-limit counter does not advance for
   * requests that were never authorized. Hostile traffic flooding a
   * session with invalid requests would otherwise exhaust legitimate
   * users' budgets.
   *
   * Optional for back-compat — a store that does not expose `decrement`
   * cannot roll back, and the rollback hook in `RateLimitResult` becomes
   * a no-op.
   */
  decrement?(key: string): Promise<number>;
}

// ── Async helper ───────────────────────────────────────────────────────────

export interface CheckRateLimitArgs {
  readonly store: RateLimitStore;
  readonly key: string;
  readonly windowMs: number;
  readonly max: number;
}

export interface RateLimitResult {
  readonly count: number;
  readonly exceeded: boolean;
  readonly max: number;
  /**
   * T5: invoke after the kernel returns a non-EXECUTE Decision so the
   * counter does not advance for unauthorized requests. No-op when the
   * store does not implement `decrement`. Idempotent — safe to call
   * exactly once per `checkRateLimit` even on EXECUTE; the framework's
   * usage in `adjudicateAndAudit` calls it only on non-EXECUTE.
   */
  readonly rollback: () => Promise<void>;
}

/**
 * Increment the counter at `key` and report whether the cap was exceeded.
 * Adopters call this in their executor before `adjudicate()` and stash the
 * result on state for the guard to consume.
 *
 * The returned `rollback()` reverses the increment when the kernel
 * Decision turns out to be non-EXECUTE — the load-bearing T5 fix for
 * hostile-input rate-limit poisoning.
 */
export async function checkRateLimit(
  args: CheckRateLimitArgs,
): Promise<RateLimitResult> {
  const count = await args.store.incrementAndGet(args.key, args.windowMs);
  let rolledBack = false;
  return {
    count,
    exceeded: count > args.max,
    max: args.max,
    async rollback() {
      if (rolledBack) return;
      rolledBack = true;
      if (typeof args.store.decrement === "function") {
        await args.store.decrement(args.key).catch(() => {});
      }
    },
  };
}

// ── Synchronous Guard factory ──────────────────────────────────────────────

export interface RateLimitGuardOptions<K extends string, P, S> {
  /**
   * Read the count for this envelope+state. Typically returns a number that
   * was previously stashed by the executor after calling `checkRateLimit`.
   * Returning `undefined` skips the check (the guard returns null).
   */
  readonly resolveCount: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | undefined;
  readonly max: number;
  /**
   * Decision factory called when count exceeds max. Adopters typically
   * return REFUSE; some return ESCALATE for high-trust paths.
   */
  readonly onExceeded?: (count: number, max: number) => Decision;
}

const defaultOnExceeded = (count: number, max: number): Decision =>
  decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "rate_limit_exceeded",
      "Too many requests. Please try again later.",
      `count=${count} max=${max}`,
    ),
    [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        rule: "rate_limit_exceeded",
        count,
        max,
      }),
    ],
  );

/**
 * Build a synchronous Guard usable in any `policy.business[]`. Reads a
 * pre-resolved count and emits the configured Decision when the cap is
 * exceeded; otherwise returns null and lets adjudication continue.
 */
export function createRateLimitGuard<K extends string, P, S>(
  options: RateLimitGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const onExceeded = options.onExceeded ?? defaultOnExceeded;
  return (envelope, state) => {
    const count = options.resolveCount(envelope, state);
    if (count === undefined) return null;
    if (count <= options.max) return null;
    return onExceeded(count, options.max);
  };
}

// ── In-memory reference store ──────────────────────────────────────────────

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

/**
 * Single-process rate-limit store. Tracks counters in a Map with per-entry
 * TTL. Suitable for tests, single-instance deployments, and adopters that
 * only need session-scoped rate limiting. Does NOT survive process restart;
 * does NOT coordinate across instances. Use a Redis-backed store for that.
 */
export function createInMemoryRateLimitStore(now: () => number = Date.now): RateLimitStore {
  const map = new Map<string, MemoryEntry>();
  return {
    async incrementAndGet(key, windowMs) {
      const t = now();
      const entry = map.get(key);
      if (entry === undefined || entry.expiresAt <= t) {
        const fresh: MemoryEntry = { count: 1, expiresAt: t + windowMs };
        map.set(key, fresh);
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async decrement(key) {
      const entry = map.get(key);
      if (entry === undefined) return 0;
      entry.count = Math.max(0, entry.count - 1);
      return entry.count;
    },
  };
}
