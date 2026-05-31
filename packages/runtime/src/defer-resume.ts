// IBX-IGE Phase P0-c — DEFER consumer with idempotent resume.
//
// When the kernel returns DEFER for an intent (e.g., order.confirm awaiting
// PIX confirmation), the responder parks the envelope at
//   rk("defer:pending:${sessionId}")
// with TTL = signal.timeoutMs + 60s grace.
//
// A consumer (typically a NATS subscriber on `payment.status_changed`)
// resumes the deferred intent by calling resumeDeferredIntent. Idempotency
// by construction: the resume path computes
//   deferResumeHash = sha256(intentHash + ":" + signal)
// and writes to a separate ledger key
//   rk("defer:resumed:${deferResumeHash}")
// via SET NX. Duplicate webhook deliveries find the key already taken and
// skip the resume.
//
// Pure logic only — Redis client and key-builder are injected so the module
// has no `@ibatexas/tools` dependency and is testable at the framework level.

import { createHash } from "node:crypto"
import type { IntentActor, Taint } from "@adjudicate/core"
import { sha256Canonical, timingSafeHexEqual } from "@adjudicate/core"

export const DEFER_PENDING_TTL_GRACE_SECONDS = 14 * 24 * 60 * 60 // 14d resume-token retention

export function deferResumeHash(intentHash: string, signal: string): string {
  return createHash("sha256").update(intentHash + ":" + signal).digest("hex")
}

export interface ParkedEnvelope {
  readonly envelope: {
    readonly intentHash: string
    readonly kind: string
    readonly actor: { readonly sessionId: string }
    readonly payload: unknown
    /**
     * T-005 hash-verification fields (additive).
     *
     * When present, `resumeDeferredIntent` re-derives the intentHash via
     * `sha256Canonical({version, kind, payload, nonce, actor, taint})` and
     * asserts byte-equality with the stored `intentHash` field.
     *
     * Absence is back-compat for v0.1-shaped blobs; v0.5+ first-party
     * adapters always populate these.
     */
    readonly version?: number
    readonly nonce?: string
    readonly taint?: Taint
    readonly actorPrincipal?: IntentActor["principal"]
  }
  readonly signal: string
  readonly parkedAt: string
}

/**
 * Re-derive the intentHash from a parked envelope's stored fields and assert
 * byte-equality with the stored hash. Returns:
 *   - `{ verified: true }` — all required fields present, hash matches
 *   - `{ verified: false, reason: "tampered", derived, stored }` — fields
 *      present, hash mismatches (blob was modified after park)
 *   - `{ verified: null, reason: "missing_fields" }` — legacy blob without
 *      hash-verification fields; caller decides whether to fail-closed
 */
export type ParkVerificationResult =
  | { readonly verified: true }
  | { readonly verified: false; readonly reason: "tampered"; readonly derived: string; readonly stored: string }
  | { readonly verified: null; readonly reason: "missing_fields" }

export function verifyParkedEnvelopeHash(parked: ParkedEnvelope): ParkVerificationResult {
  const e = parked.envelope
  if (
    typeof e.version !== "number" ||
    typeof e.nonce !== "string" ||
    typeof e.taint !== "string" ||
    typeof e.actorPrincipal !== "string"
  ) {
    return { verified: null, reason: "missing_fields" }
  }
  const derived = sha256Canonical({
    version: e.version,
    kind: e.kind,
    payload: e.payload,
    nonce: e.nonce,
    actor: { principal: e.actorPrincipal, sessionId: e.actor.sessionId },
    taint: e.taint,
  })
  // Constant-time compare (P3-CRYPTO-TIMINGSAFE): a `!==` string compare leaks
  // via timing how many leading hex chars of a tampered intentHash matched the
  // re-derived digest. timingSafeHexEqual is boolean-identical to `!==` here
  // (length-mismatch / non-hex → not equal) and never throws.
  if (!timingSafeHexEqual(derived, e.intentHash)) {
    return { verified: false, reason: "tampered", derived, stored: e.intentHash }
  }
  return { verified: true }
}

export interface DeferResumeResult {
  readonly resumed: boolean
  readonly reason?: string
  readonly intentHash?: string
  readonly parked?: ParkedEnvelope
}

export interface DeferRedis {
  get(key: string): Promise<string | null>
  // Node Redis with NX returns "OK" on success or null on collision, but the
  // client's TS surface widens to `string | null`. Match that here so concrete
  // RedisClientType values are assignable without casts.
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null>
  del(key: string): Promise<unknown>
  /**
   * Atomic INCR returning the new value. T5 (top-priority I): used for
   * the per-`intentHash` resume cycle counter so a misbehaving signal
   * source cannot oscillate park → resume → park → resume indefinitely.
   * Optional for back-compat; absence skips the cycle cap.
   */
  incr?(key: string): Promise<number>
  /**
   * Optional. When present, `resumeDeferredIntent` decrements the
   * per-session parked-envelope counter on a successful resume so the
   * `parkDeferredIntent` quota tracks live state. Implementations that
   * don't expose `decr` simply skip this — the counter's TTL provides
   * the safety net.
   */
  decr?(key: string): Promise<number>
  /**
   * Optional. T5: set TTL on a key. When present alongside `incr`, the
   * cycle counter gets a TTL matching the resume-token retention so it
   * does not grow unbounded.
   */
  expire?(key: string, seconds: number): Promise<unknown>
}

export interface DeferLogger {
  warn?: (obj: Record<string, unknown>, msg?: string) => void
  info?: (obj: Record<string, unknown>, msg?: string) => void
  debug?: (obj: Record<string, unknown>, msg?: string) => void
}

export interface ResumeDeferredIntentArgs {
  readonly sessionId: string
  readonly signal: string
  readonly redis: DeferRedis
  readonly rk: (raw: string) => string
  readonly log?: DeferLogger
  /**
   * T5 (top-priority I): hard cap on resume cycles per `intentHash`.
   * A pending intent that resumes, re-adjudicates to DEFER, parks
   * again, resumes again, etc., is bounded only by the per-session
   * concurrent-park quota — not by total cycles. Default 3. Set to a
   * higher number for long-running async flows (e.g., kyc verifications
   * with retry-on-timeout) or to 0 to disable.
   *
   * Requires `redis.incr` to be wired; absent that, the cap is silently
   * skipped (back-compat with adopters whose Redis client does not
   * expose `incr`).
   */
  readonly maxResumeCycles?: number
  /**
   * T-005: hash-verification policy for parked envelope blobs.
   *
   * `"strict"` — re-derive intentHash from stored fields; mismatch returns
   *   `{ resumed: false, reason: "park_blob_tampered" }`; missing fields
   *   returns `{ resumed: false, reason: "park_blob_unverifiable" }`.
   * `"warn"` — same checks; mismatch fails-closed; missing fields logs
   *   a warning and proceeds (back-compat with v0.1 parked blobs).
   * `"off"` — no verification (NOT recommended for production).
   *
   * Default: `"strict"` (SecurityReviewer-010). A legacy blob lacking
   * verification fields fails closed (`park_blob_unverifiable`); opt into
   * `"warn"` explicitly for back-compat with v0.1 parked blobs.
   */
  readonly verifyHash?: "strict" | "warn" | "off"
}

export const DEFAULT_MAX_RESUME_CYCLES = 3

export async function resumeDeferredIntent(
  args: ResumeDeferredIntentArgs,
): Promise<DeferResumeResult> {
  const { sessionId, signal, redis, rk, log } = args
  const pendingKey = rk(`defer:pending:${sessionId}`)
  const raw = await redis.get(pendingKey)
  if (raw === null) {
    return { resumed: false, reason: "no_parked_envelope" }
  }
  let parked: ParkedEnvelope
  try {
    parked = JSON.parse(raw) as ParkedEnvelope
  } catch (err) {
    log?.warn?.(
      { sessionId, err: (err as Error).message },
      "[defer-resolver] malformed parked envelope",
    )
    return { resumed: false, reason: "malformed_envelope" }
  }
  if (parked.signal !== signal) {
    return { resumed: false, reason: "signal_mismatch" }
  }
  const intentHash = parked.envelope.intentHash

  // T-005: hash verification — re-derive intentHash from stored fields and
  // assert byte-equality with the stored value. Detects blob tampering at
  // resume time (the threat: a malicious actor with Redis write access
  // mutates the parked payload between park and resume).
  const verifyMode = args.verifyHash ?? "strict"
  if (verifyMode !== "off") {
    const verification = verifyParkedEnvelopeHash(parked)
    if (verification.verified === false) {
      log?.warn?.(
        {
          sessionId,
          intentHash,
          signal,
          stored: verification.stored,
          derived: verification.derived,
        },
        "[defer-resolver] park blob tampered — refusing to resume",
      )
      return { resumed: false, reason: "park_blob_tampered", intentHash }
    }
    if (verification.verified === null) {
      // Legacy blob without hash-verification fields.
      if (verifyMode === "strict") {
        log?.warn?.(
          { sessionId, intentHash, signal },
          "[defer-resolver] park blob lacks verification fields and verifyHash=strict",
        )
        return { resumed: false, reason: "park_blob_unverifiable", intentHash }
      }
      log?.warn?.(
        { sessionId, intentHash, signal },
        "[defer-resolver] park blob lacks verification fields — v0.5 will require these",
      )
    }
  }

  // T5 (top-priority I): per-intentHash resume cycle cap. Caps DEFER →
  // resume → re-adjudicate → DEFER oscillation against a misbehaving
  // signal source. The counter shares the resume-token TTL so it
  // garbage-collects naturally.
  const cap = args.maxResumeCycles ?? DEFAULT_MAX_RESUME_CYCLES
  if (cap > 0 && typeof redis.incr === "function") {
    const cycleKey = rk(`defer:cycle:${intentHash}`)
    const cycles = await redis.incr(cycleKey)
    if (typeof redis.expire === "function") {
      await redis.expire(cycleKey, DEFER_PENDING_TTL_GRACE_SECONDS).catch(() => {})
    }
    if (cycles > cap) {
      log?.warn?.(
        { sessionId, intentHash, signal, cycles, cap },
        "[defer-resolver] cycle cap exceeded",
      )
      return {
        resumed: false,
        reason: "cycle_cap_exceeded",
        intentHash,
      }
    }
  }

  const resumeKey = rk(`defer:resumed:${deferResumeHash(intentHash, signal)}`)
  const acquired = await redis.set(
    resumeKey,
    JSON.stringify({
      at: new Date().toISOString(),
      intentHash,
      signal,
      sessionId,
    }),
    { NX: true, EX: DEFER_PENDING_TTL_GRACE_SECONDS },
  )
  if (acquired !== "OK") {
    log?.info?.(
      { sessionId, intentHash, signal },
      "[defer-resolver] duplicate resume suppressed",
    )
    return {
      resumed: false,
      reason: "duplicate_resume_suppressed",
      intentHash,
    }
  }
  await redis.del(pendingKey).catch(() => {})
  // DECR the per-session parked-envelope counter so the parkDeferredIntent
  // quota tracks live state. Best-effort — the counter TTL covers the case
  // where a resume happens after the counter has already expired.
  if (typeof redis.decr === "function") {
    await redis.decr(rk(`defer:count:${sessionId}`)).catch(() => {})
  }
  return { resumed: true, intentHash, parked }
}
