"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * ActiveStepStrip — a client variant of the Hero's 4-chip anchor rail.
 *
 * Visually identical to the static rail (numbered chips, anchor links, arrows
 * between), but the chip matching the spine section currently in view lifts to
 * the active treatment. An IntersectionObserver watches the four step anchors
 * (#step-acts → #step-console); the most-visible one wins. Falls back to step 1
 * before any anchor has been observed.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set we never attach the
 * observer and hold step 1 highlighted — static, no scroll-driven changes.
 */

const STEPS: ReadonlyArray<{ readonly label: string; readonly href: string }> = [
  { label: "AI acts", href: "#step-acts" },
  { label: "Guard decides", href: "#step-decides" },
  { label: "Receipt saved", href: "#step-receipt" },
  { label: "Console shows", href: "#step-console" },
];

const STEP_IDS = STEPS.map((s) => s.href.slice(1));

export function ActiveStepStrip() {
  const reduce = useReducedMotion();
  // 1-based index of the step currently in view. Defaults to 1.
  const [active, setActive] = useState(1);

  useEffect(() => {
    // Under reduced motion (or without IO support) hold step 1, statically.
    if (reduce || typeof IntersectionObserver === "undefined") return;

    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        // Pick the most-visible observed step; if none is visible, keep current.
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const id of STEP_IDS) {
          const r = ratios.get(id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestId = id;
          }
        }
        if (bestId) {
          const next = STEP_IDS.indexOf(bestId) + 1;
          setActive((prev) => (prev === next ? prev : next));
        }
      },
      // Bias toward the section occupying the middle of the viewport.
      { rootMargin: "-30% 0px -30% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    const nodes = STEP_IDS.map((id) => document.getElementById(id)).filter(
      (n): n is HTMLElement => n !== null,
    );
    for (const node of nodes) observer.observe(node);

    return () => observer.disconnect();
  }, [reduce]);

  return (
    <nav
      aria-label="The four steps"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2"
    >
      {STEPS.map((step, idx) => {
        const isActive = active === idx + 1;
        return (
          <span key={step.href} className="flex items-center gap-2">
            <a
              href={step.href}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "border-transparent bg-gradient-primary text-white shadow-sm"
                  : "border-edge bg-surface text-muted hover:border-ink/30 hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full font-mono text-[11px] transition",
                  isActive ? "bg-white/20 text-white" : "bg-edge text-ink",
                )}
              >
                {idx + 1}
              </span>
              {step.label}
            </a>
            {idx < STEPS.length - 1 ? (
              <span className="text-faint" aria-hidden="true">
                &rarr;
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
