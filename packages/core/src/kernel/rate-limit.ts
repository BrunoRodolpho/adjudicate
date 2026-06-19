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
import type { AggregateSnapshot, IntentEnvelope } from "../envelope.js";
import { refuse } from "../refusal.js";
import { recordSinkFailure } from "./metrics.js";
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
        // A failed decrement leaves the counter inflated — don't crash the
        // caller, but surface the swallowed failure to metrics (ErrorReviewer-004).
        await args.store.decrement(args.key).catch((err: unknown) => {
          recordSinkFailure({
            sink: "rate-limit",
            subject: args.key,
            errorClass: err instanceof Error ? err.name : "Error",
            consecutiveFailures: 1,
          });
        });
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

// ── Multi-horizon cumulative/velocity guard (051) ───────────────────────────
//
// The single-scalar `createRateLimitGuard` above reads ONE pre-resolved count
// (a single window). 051's velocity/cumulative guard family reads the
// multi-horizon `AggregateSnapshot` that plan 052 INJECTS into the kernel
// decision (read-only): a `windows` map keyed by an opaque adopter horizon
// string (e.g. `"acct_7|daily"`, `"acct_7|monthly"`) to the already-committed
// aggregate count for that window. The guard fires (raises friction) when the
// decision's projected contribution would push ANY configured horizon over its
// limit — `committed + increment > limit` (the cap value itself is allowed,
// matching `checkRateLimit`'s strict `count > max` semantics).
//
// PURITY (§D, invariant #5): this is a SYNCHRONOUS business-layer predicate. It
// reads ONLY the injected snapshot via `resolveSnapshot(envelope, state)` plus
// its own static config — NO Date.now / Math.random / IO / process.env. The
// snapshot is recorded into the audit row by the 052 shell, so re-running this
// guard over the recorded snapshot reproduces a byte-identical decision (the
// replayability proof in `replay-determinism.property.test.ts`).
//
// MONOTONICITY (§C, invariant #7): on breach the guard can ONLY increase
// friction (default `onExceeded` ⇒ REFUSE `cumulative_limit_exceeded`, basis
// `business/RULE_VIOLATED`). It never lowers a ceiling, never authorizes
// EXECUTE — under-limit it returns `null` and lets adjudication continue, it
// does not affirmatively grant.
//
// 052 OWNS the counting substrate (`GuardFireStats` delta-write + the additive
// Postgres upsert) the snapshot is computed from; 051 CONSUMES the snapshot
// READ-ONLY here — it never mutates, refetches, or timestamps it, and it never
// enters `intentHash` (the snapshot rides injected state, invariant #4).

/** One configured horizon: which window in the snapshot, and its cap. */
export interface VelocityHorizon {
  /**
   * Key into `AggregateSnapshot.windows`. Opaque adopter string identifying a
   * (resource, horizon) view — e.g. `"acct_7|daily"`. A key absent from the
   * snapshot is treated as a committed count of 0 (no traffic recorded yet).
   */
  readonly windowKey: string;
  /**
   * Inclusive cap for this horizon. The guard fires when
   * `committed + increment > max` (the cap value itself is allowed — strict
   * greater-than, identical to `checkRateLimit`'s `count > max`).
   */
  readonly max: number;
}

/** Details of the first horizon that breached, passed to `onExceeded`. */
export interface VelocityBreach {
  readonly windowKey: string;
  /** The already-committed aggregate read from the snapshot for this window. */
  readonly committed: number;
  /** The projected contribution of THIS decision (default 1). */
  readonly increment: number;
  /** The configured cap for this window. */
  readonly max: number;
  /** `committed + increment` — the projected post-decision count. */
  readonly projected: number;
}

export interface CumulativeVelocityGuardOptions<K extends string, P, S> {
  /**
   * Read the injected `AggregateSnapshot` (the 052 multi-horizon counter view)
   * for this envelope+state. Returning `undefined` skips the check (the guard
   * returns null) — e.g. when the shell did not inject a snapshot for this kind.
   */
  readonly resolveSnapshot: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => AggregateSnapshot | undefined;
  /**
   * The horizons this guard enforces. ALL are checked; the FIRST (in array
   * order) that breaches drives the emitted Decision. Order is the adopter's
   * declared precedence — evaluation is deterministic and does not depend on
   * snapshot iteration order.
   */
  readonly horizons: ReadonlyArray<VelocityHorizon>;
  /**
   * The count this decision would add to each window if it executed. Defaults
   * to 1 (one intent of this kind). Pure — derived from the envelope/state
   * only; MUST be deterministic (no clock/RNG). A non-finite or negative value
   * is clamped to 0 so a malformed resolver cannot fabricate headroom.
   */
  readonly resolveIncrement?: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number;
  /**
   * Decision factory called with the first breaching horizon. Adopters
   * typically return REFUSE; some return ESCALATE/DEFER for higher-trust
   * paths. §C: it MUST raise friction — the lint/monotonic-ceiling invariants
   * forbid returning EXECUTE.
   */
  readonly onExceeded?: (breach: VelocityBreach) => Decision;
}

const defaultVelocityExceeded = (breach: VelocityBreach): Decision =>
  decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "cumulative_limit_exceeded",
      "This action exceeds an account limit. Please try again later.",
      `window=${breach.windowKey} projected=${breach.projected} max=${breach.max}`,
    ),
    [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        rule: "cumulative_limit_exceeded",
        windowKey: breach.windowKey,
        committed: breach.committed,
        increment: breach.increment,
        projected: breach.projected,
        max: breach.max,
      }),
    ],
  );

/**
 * Normalize the projected increment: a non-finite or negative value is clamped
 * to 0 so a malformed resolver can never fabricate headroom (fail toward MORE
 * friction, never less — §C). The default increment is 1.
 */
function normalizeIncrement(raw: number | undefined): number {
  if (raw === undefined) return 1;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

/**
 * Build a synchronous, PURE multi-horizon cumulative/velocity Guard usable in
 * any `policy.business[]`. Reads the injected `AggregateSnapshot` (052) and
 * fires the configured Decision when the decision's projected contribution
 * would push ANY configured horizon over its cap (`committed + increment > max`,
 * cap allowed). Otherwise returns null and lets adjudication continue.
 *
 * Deterministic & side-effect-free (§D / invariant #5): given the same injected
 * snapshot + envelope + state it returns the same Decision, so the recorded
 * decision replays bit-identically. It never authorizes EXECUTE (§C / invariant
 * #7) — under-limit it returns null; over-limit it only raises friction.
 */
export function createCumulativeVelocityGuard<K extends string, P, S>(
  options: CumulativeVelocityGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const onExceeded = options.onExceeded ?? defaultVelocityExceeded;
  return (envelope, state) => {
    const snapshot = options.resolveSnapshot(envelope, state);
    if (snapshot === undefined) return null;
    const increment = normalizeIncrement(
      options.resolveIncrement?.(envelope, state),
    );
    // Deterministic precedence: iterate the configured horizons in declared
    // array order (NOT snapshot key order) so the FIRST breaching horizon is
    // stable and replay-faithful.
    for (const horizon of options.horizons) {
      const committed = snapshot.windows[horizon.windowKey] ?? 0;
      const projected = committed + increment;
      // Strict greater-than: the cap value itself is allowed, mirroring
      // `checkRateLimit`'s `count > max` exceeded semantics.
      if (projected > horizon.max) {
        return onExceeded({
          windowKey: horizon.windowKey,
          committed,
          increment,
          max: horizon.max,
          projected,
        });
      }
    }
    return null;
  };
}
