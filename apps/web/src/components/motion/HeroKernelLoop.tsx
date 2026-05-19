"use client";

import { useReducedMotion } from "framer-motion";

const HERO_ALT =
  "Animated kernel — an AI agent proposes a deployment at 100% production traffic; the control layer rewrites it to 25% before the action proceeds.";

/**
 * HeroKernelLoop — Remotion-rendered video that replaces the
 * framer-motion KernelCube in the Hero. Source composition lives at
 * apps/web/video/HeroKernelLoop.tsx; rendered into apps/web/public/.
 *
 * 12-second seamless loop, autoplay, muted, no controls. Same
 * prefers-reduced-motion fallback pattern as the SizzleReel — swaps
 * to a static poster <img> when motion is reduced.
 */
export function HeroKernelLoop() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <img
        src="/hero-kernel-poster.jpg"
        alt={HERO_ALT}
        className="block h-auto w-full max-w-md"
      />
    );
  }
  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      poster="/hero-kernel-poster.jpg"
      aria-label={HERO_ALT}
      className="block h-auto w-full max-w-md bg-canvas"
    >
      {/* MP4 (H.264) first — universal browser support. WebM (VP9) second
          for bandwidth-conscious browsers that prefer it. Browsers do NOT
          auto-fall-through after a decode error, so the most-compatible
          source MUST come first. */}
      <source src="/hero-kernel.mp4" type="video/mp4" />
      <source src="/hero-kernel.webm" type="video/webm" />
    </video>
  );
}
