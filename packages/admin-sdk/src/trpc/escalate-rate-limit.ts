/**
 * Per-actor sliding-window rate limiter for the 114 escalate mutation.
 *
 * The escalate surface is RATE-LIMITED per the 114 contract: an operator can
 * raise only a bounded number of escalations within a rolling window. This
 * limiter is a small, pure, deterministic-given-a-clock utility so it is unit
 * testable without timers — the caller injects `now`.
 *
 * It is a GOVERNANCE-PLANE guard (it caps how fast facts are recorded); it is
 * NOT on the kernel decision path and never feeds a `Decision`. Friction is
 * monotone regardless: being rate-limited means an escalation is REFUSED at the
 * wire (TOO_MANY_REQUESTS) — it can never lower friction.
 */
export interface EscalateRateLimitOptions {
  /** Max escalations per actor within the window. Default 10. */
  readonly maxPerWindow?: number;
  /** Window length in milliseconds. Default 60_000 (1 minute). */
  readonly windowMs?: number;
}

export interface EscalateRateLimiter {
  /**
   * Records an attempt for `actorId` at time `now` (epoch ms) and returns
   * whether it is ALLOWED. A disallowed attempt is NOT counted toward the
   * window (so a flood of rejected attempts cannot extend the cooldown).
   */
  allow(actorId: string, now: number): boolean;
}

export const DEFAULT_ESCALATE_MAX_PER_WINDOW = 10;
export const DEFAULT_ESCALATE_WINDOW_MS = 60_000;

export function createEscalateRateLimiter(
  opts: EscalateRateLimitOptions = {},
): EscalateRateLimiter {
  const maxPerWindow = opts.maxPerWindow ?? DEFAULT_ESCALATE_MAX_PER_WINDOW;
  const windowMs = opts.windowMs ?? DEFAULT_ESCALATE_WINDOW_MS;
  // actorId -> ascending list of accepted attempt timestamps within the window.
  const hits = new Map<string, number[]>();

  return {
    allow(actorId: string, now: number): boolean {
      const cutoff = now - windowMs;
      const recent = (hits.get(actorId) ?? []).filter((t) => t > cutoff);
      if (recent.length >= maxPerWindow) {
        // Keep the pruned window so memory does not grow on rejected floods.
        hits.set(actorId, recent);
        return false;
      }
      recent.push(now);
      hits.set(actorId, recent);
      return true;
    },
  };
}
