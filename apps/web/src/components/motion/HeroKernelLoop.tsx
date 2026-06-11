"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

const HERO_ALT =
  "Animated kernel — an AI agent proposes a deployment at 100% production traffic; the control layer rewrites it to 25% before the action proceeds.";

/**
 * Framed viewport chrome around the kernel media. The Remotion composition is
 * intentionally airy (elements animate in/out of a light field), so unframed it
 * reads as empty page space — especially on mobile, where it renders ~410px tall
 * and its bg blends into the hero canvas. The chrome (mac dots + an honest
 * "rewrite · demo" tag, a border, a soft shadow) makes that whitespace read as
 * the kernel's working surface — an intentional media object, not a dead band.
 */
function Viewport({ children }: { readonly children: ReactNode }) {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-surface shadow-md">
      <div className="flex items-center gap-1.5 border-b border-edge/70 bg-surface-2 px-3.5 py-2.5">
        <span className="size-2 rounded-full bg-edge-strong" aria-hidden />
        <span className="size-2 rounded-full bg-edge-strong" aria-hidden />
        <span className="size-2 rounded-full bg-edge-strong" aria-hidden />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-section text-muted">
          rewrite · demo
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * HeroKernelLoop — Remotion-rendered video that replaces the
 * framer-motion KernelCube in the Hero. Source composition lives at
 * apps/web/video/HeroKernelLoop.tsx; rendered into apps/web/public/.
 *
 * 12-second seamless loop, autoplay, muted, no controls. Same
 * prefers-reduced-motion fallback pattern as the SizzleReel — swaps
 * to a static poster <img> when motion is reduced. Both paths sit inside
 * the {@link Viewport} frame so the airy composition reads as intentional.
 */
export function HeroKernelLoop() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <Viewport>
        <img
          src="/hero-kernel-poster.jpg"
          alt={HERO_ALT}
          className="block h-auto w-full"
        />
      </Viewport>
    );
  }
  return (
    <Viewport>
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-kernel-poster.jpg"
        aria-label={HERO_ALT}
        className="block h-auto w-full bg-surface"
      >
        {/* MP4 (H.264) first — universal browser support. WebM (VP9) second
            for bandwidth-conscious browsers that prefer it. Browsers do NOT
            auto-fall-through after a decode error, so the most-compatible
            source MUST come first. */}
        <source src="/hero-kernel.mp4" type="video/mp4" />
        <source src="/hero-kernel.webm" type="video/webm" />
      </video>
    </Viewport>
  );
}
