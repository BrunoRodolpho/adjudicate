import { Easing, interpolate } from "remotion";

/**
 * motion.ts — the single easing / spring preset module for all video
 * compositions. Lifted from the best-feeling primitives in
 * HeroKernelLoop.tsx and generalized so compositions stop re-declaring
 * bezier curves and spring configs inline.
 *
 * Discipline (per the production-quality motion bar):
 *   - ONE consistent easing system: weighted / expo-out decelerations.
 *   - NO bouncy defaults. The springs here are over-damped so values
 *     settle without overshoot — depth and weight, not springiness.
 *   - All helpers are deterministic over `frame` (no wall-clock / random).
 */

// ── Easing curves ─────────────────────────────────────────────────────

/**
 * EASE_OUT — the signature expo-out deceleration. Long-tailed; values
 * arrive fast then settle slowly. Use for entrances, glides, reveals.
 * (Matches HeroKernelLoop's EASE_DECEL.)
 */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * EASE_SOFT — a gentle symmetric in-out. Use for cross-fades, opacity
 * seams, and anything that should feel calm at both ends.
 * (Matches HeroKernelLoop's EASE_INOUT.)
 */
export const EASE_SOFT = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * EASE_IN — an accelerating curve for exits that "leave" the frame
 * (an envelope flung toward production, a card dismissed).
 */
export const EASE_IN = Easing.bezier(0.7, 0, 1, 0.4);

// ── Spring configs (all over-damped — no overshoot) ───────────────────

/**
 * SPRING_WEIGHTY — heavy, deliberate settle. The kernel materialising,
 * a large block arriving. (Matches HeroKernelLoop's WEIGHTY_SPRING.)
 */
export const SPRING_WEIGHTY = {
  damping: 28,
  stiffness: 60,
  mass: 1.4,
} as const;

/**
 * SPRING_SETTLE — a slightly quicker, still non-bouncy settle for cards
 * and panels sliding into place. (Matches HeroKernelLoop's SETTLE_SPRING.)
 */
export const SPRING_SETTLE = {
  damping: 24,
  stiffness: 90,
  mass: 1.0,
} as const;

/**
 * SPRING_QUIET — the calmest settle, for small accents that should not
 * draw the eye. (Matches HeroKernelLoop's QUIET_SPRING.)
 */
export const SPRING_QUIET = {
  damping: 32,
  stiffness: 70,
  mass: 1.1,
} as const;

/**
 * The default weighted spring config the kit reaches for when a caller
 * does not care which weight — points at SPRING_WEIGHTY.
 */
export const SPRING_DEFAULT = SPRING_WEIGHTY;

// ── interpolate helpers ───────────────────────────────────────────────

/**
 * fadeIn — opacity 0→1 across [start, start+len], expo-out, clamped at
 * both ends. The everyday entrance fade.
 */
export function fadeIn(frame: number, start: number, len = 16): number {
  return interpolate(frame, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
}

/**
 * fadeOut — opacity 1→0 across [start, start+len], soft in-out, clamped.
 * The everyday exit fade (and loop-seam tail).
 */
export function fadeOut(frame: number, start: number, len = 16): number {
  return interpolate(frame, [start, start + len], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
}

/**
 * rise — a translateY offset that decays from `distance`px to 0 across
 * [start, start+len], expo-out. Pair with fadeIn for a "rise + fade"
 * entrance. Returns the px offset (still away from rest); 0 means settled.
 */
export function rise(
  frame: number,
  start: number,
  len = 20,
  distance = 16,
): number {
  return interpolate(frame, [start, start + len], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
}

/**
 * seam — the loop-seam opacity: fades in over the first `inLen` frames
 * and out over the last `outLen` frames of a `total`-frame composition.
 * Put this on an INNER wrapper so the canvas background never fades
 * (prevents the <video> default-black flash at the loop boundary).
 *
 * Defaults match the brief: in over ~8 frames, out over last ~24.
 */
export function seam(
  frame: number,
  total: number,
  inLen = 8,
  outLen = 24,
): number {
  const seamIn = interpolate(frame, [0, inLen], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  const seamOut = interpolate(frame, [total - outLen, total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  return Math.min(seamIn, seamOut);
}

/**
 * window — a hold band: 0 before [inStart], up to 1 across the fade-in,
 * held 1 through the body, back to 0 across the fade-out ending at
 * [outEnd]. A convenience for elements that appear, hold, then leave.
 */
export function window(
  frame: number,
  inStart: number,
  inLen: number,
  outStart: number,
  outLen: number,
): number {
  return interpolate(
    frame,
    [inStart, inStart + inLen, outStart, outStart + outLen],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_SOFT },
  );
}
