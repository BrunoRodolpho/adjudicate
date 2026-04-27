// Park-side companion to defer-resume.ts.
//
// When the kernel returns DEFER for an envelope, the adopter parks the
// envelope so the eventual signal can resume it. This module provides the
// canonical park primitive with built-in per-session quota enforcement so
// a misbehaving session cannot grow the parked-envelope set unboundedly.
//
// Counter shape:
//   rk(deferCounterKey(sessionId)) → INCR + EXPIRE NX (TTL = grace seconds)
// Pairs with the existing parked-envelope key:
//   rk(deferParkKey(sessionId))    → JSON envelope blob
// On successful resume, defer-resume.ts DECRs the counter back; the TTL
// guarantees zero-counter cleanup even if a resume was missed.

import { recordResourceLimit } from "@adjudicate/core"
import { DEFER_PENDING_TTL_GRACE_SECONDS } from "./defer-resume.js"

/** Default per-session quota. Adopters tune via `parkDeferredIntent` options. */
export const DEFAULT_DEFER_QUOTA_PER_SESSION = 16

/**
 * Key suffix for the parked envelope payload. Adopters wrap this via their
 * own `rk()` namespacer.
 */
export function deferParkKey(sessionId: string): string {
  return `defer:pending:${sessionId}`
}

/**
 * Key suffix for the per-session parked-envelope counter. Pairs with
 * deferParkKey: parking INCRs, resume DECRs, TTL cleans up zero-counters.
 */
export function deferCounterKey(sessionId: string): string {
  return `defer:count:${sessionId}`
}

export interface ParkRedis {
  /** Atomic INCR returning the new value. */
  incr(key: string): Promise<number>
  /** DECR returning the new value (may go negative — clamped on read). */
  decr(key: string): Promise<number>
  /**
   * EXPIRE — set TTL on the key. The `mode` argument selects the Redis
   * EXPIRE flag: `"NX"` sets the TTL only if the key has none yet (the
   * pre-T5 behaviour); omitting `mode` is an unconditional refresh
   * (the T5 default — keeps the counter alive across the latest park).
   */
  expire(key: string, seconds: number, mode?: "NX"): Promise<unknown>
  /** SET with TTL for the parked envelope payload. */
  set(
    key: string,
    value: string,
    options: { EX: number },
  ): Promise<string | null>
  /**
   * Optional: atomic check-and-increment via Redis Lua eval. When wired,
   * `parkDeferredIntent` uses it instead of the INCR-then-check sequence,
   * eliminating the small race window where two concurrent parks at
   * `quota − 1` both pass before either rolls back. Adopters whose Redis
   * client exposes `eval` can supply this; the framework falls back to
   * the non-atomic sequence when omitted.
   *
   * Implementations should run the equivalent of:
   *
   *     local v = redis.call('INCR', KEYS[1])
   *     redis.call('EXPIRE', KEYS[1], ARGV[1])
   *     if tonumber(v) > tonumber(ARGV[2]) then
   *       redis.call('DECR', KEYS[1])
   *       return 0
   *     end
   *     return v
   *
   * Returns 0 if the cap was exceeded (and the increment was rolled
   * back), or the new count if accepted.
   */
  evalIncrCheck?(
    counterKey: string,
    ttlSeconds: number,
    max: number,
  ): Promise<number>
}

export interface ParkLogger {
  warn?: (obj: Record<string, unknown>, msg?: string) => void
  info?: (obj: Record<string, unknown>, msg?: string) => void
}

export interface ParkDeferredIntentArgs {
  readonly envelope: {
    readonly intentHash: string
    readonly kind: string
    readonly actor: { readonly sessionId: string }
    readonly payload: unknown
  }
  readonly signal: string
  /** TTL for the parked envelope blob — typically `signal.timeoutMs / 1000 + grace`. */
  readonly ttlSeconds: number
  readonly redis: ParkRedis
  readonly rk: (raw: string) => string
  /**
   * Maximum concurrently-parked envelopes per session. Defaults to
   * `DEFAULT_DEFER_QUOTA_PER_SESSION`.
   */
  readonly quotaPerSession?: number
  readonly log?: ParkLogger
}

export type ParkDeferredIntentResult =
  | { readonly parked: true; readonly count: number }
  | {
      readonly parked: false
      readonly reason: "quota_exceeded"
      readonly observed: number
      readonly limit: number
    }

/**
 * Park a deferred envelope, enforcing the per-session quota.
 *
 * Atomic-ish: INCR the counter, check the cap, then SET the envelope blob.
 * If the cap is exceeded the counter is DECR'd back to neutral and the
 * adopter receives a `quota_exceeded` result — typically translated to a
 * REFUSE downstream. Emits a `recordResourceLimit({ resource: "defer_quota" })`
 * event for observability.
 *
 * Counter TTL: set via EXPIRE NX so the lifetime equals the grace window
 * regardless of how many envelopes are parked. Once all parked envelopes
 * for a session expire, the counter expires naturally.
 */
export async function parkDeferredIntent(
  args: ParkDeferredIntentArgs,
): Promise<ParkDeferredIntentResult> {
  const sessionId = args.envelope.actor.sessionId
  const quota = args.quotaPerSession ?? DEFAULT_DEFER_QUOTA_PER_SESSION
  const counterKey = args.rk(deferCounterKey(sessionId))
  const parkKey = args.rk(deferParkKey(sessionId))

  // T5 (#35): when the Redis client exposes an atomic `evalIncrCheck`,
  // use it. The Lua eval increment-and-check is race-free vs the
  // INCR → EXPIRE → check → DECR sequence below.
  let newCount: number
  if (typeof args.redis.evalIncrCheck === "function") {
    const result = await args.redis.evalIncrCheck(
      counterKey,
      DEFER_PENDING_TTL_GRACE_SECONDS,
      quota,
    )
    if (result === 0) {
      // Quota exceeded; the Lua script already DECR'd back. We don't
      // know the exact `observed` count without an extra round-trip,
      // so report `quota + 1` as the lower bound for telemetry.
      const observed = quota + 1
      recordResourceLimit({
        resource: "defer_quota",
        subject: sessionId,
        limit: quota,
        observed,
      })
      args.log?.warn?.(
        { sessionId, observed, limit: quota },
        "[defer-park] quota exceeded (atomic eval)",
      )
      return {
        parked: false,
        reason: "quota_exceeded",
        observed,
        limit: quota,
      }
    }
    newCount = result
  } else {
    newCount = await args.redis.incr(counterKey)
    // T5 (#36): EXPIRE without NX so the TTL refreshes on every park —
    // the counter outlives the latest envelope's grace window, not the
    // first one's. Pre-T5 set NX (one-shot), so a long-running session
    // could leave a stale counter outliving its envelopes.
    await args.redis.expire(counterKey, DEFER_PENDING_TTL_GRACE_SECONDS)

    if (newCount > quota) {
      // Roll back the increment so the next caller sees the correct count.
      await args.redis.decr(counterKey).catch(() => {})
      recordResourceLimit({
        resource: "defer_quota",
        subject: sessionId,
        limit: quota,
        observed: newCount,
      })
      args.log?.warn?.(
        { sessionId, observed: newCount, limit: quota },
        "[defer-park] quota exceeded",
      )
      return {
        parked: false,
        reason: "quota_exceeded",
        observed: newCount,
        limit: quota,
      }
    }
  }

  await args.redis.set(
    parkKey,
    JSON.stringify({
      envelope: args.envelope,
      signal: args.signal,
      parkedAt: new Date().toISOString(),
    }),
    { EX: args.ttlSeconds },
  )
  args.log?.info?.(
    { sessionId, intentHash: args.envelope.intentHash, signal: args.signal, count: newCount },
    "[defer-park] parked",
  )
  return { parked: true, count: newCount }
}

// ── Counter helpers used by defer-resume.ts ───────────────────────────────

export interface CounterRedis {
  decr(key: string): Promise<number>
}

/**
 * DECR the per-session counter. Called by `resumeDeferredIntent` when a
 * parked envelope is successfully resumed. Errors are swallowed — the TTL
 * is the safety net.
 */
export async function decrementDeferCounter(
  redis: CounterRedis,
  rk: (raw: string) => string,
  sessionId: string,
): Promise<void> {
  await redis.decr(rk(deferCounterKey(sessionId))).catch(() => {})
}
