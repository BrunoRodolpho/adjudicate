import type { DecisionKind } from "@adjudicate/core";
import { HoverLift } from "@/components/motion/HoverLift";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { DECISIONS, DECISIONS_ORDER } from "@/content/decisions";
import { STRIP_COPY } from "@/content/hero-rewrite-beats";
import { cn } from "@/lib/cn";

/**
 * The six structured outcomes the kernel can return, in canonical order.
 * Visually positioned beneath the hero's video + mechanism-panel exhibit
 * to pre-empt the "is this just a sanitiser?" misread — REWRITE is one
 * of six named members of a closed set.
 *
 * The REWRITE cell wears a subtle "shown above" indicator since that's
 * the outcome the exhibit demonstrates in detail.
 *
 * Motion (AUDIT P1): the six cells cascade in on scroll (staggered reveal)
 * and lift slightly on hover. Both are transform/opacity-only and gated by
 * the motion kit — under reduced motion the strip renders static, with hover
 * limited to a shadow change (no translate). The native `<ul>`/`<li>` carries
 * list semantics; the `Stagger` wrapper is `display:contents` so it is
 * transparent to both the grid layout and the accessibility tree.
 */

const DOT_CLASS_FOR_ACCENT: Record<string, string> = {
  "text-execute": "bg-execute",
  "text-refuse": "bg-refuse",
  "text-rewrite": "bg-rewrite",
  "text-defer": "bg-defer",
  "text-escalate": "bg-escalate",
  "text-confirm": "bg-confirm",
};

const STRIP_NAME: Record<DecisionKind, string> = {
  EXECUTE: "execute",
  REFUSE: "refuse",
  REWRITE: "rewrite",
  DEFER: "defer",
  ESCALATE: "escalate",
  REQUEST_CONFIRMATION: "request_confirmation",
};

export function HeroOutcomeStrip() {
  return (
    <ul
      aria-label="Six structured decisions returned by the kernel"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 md:gap-3"
    >
      <Stagger className="contents" stagger={0.06}>
        {DECISIONS_ORDER.map((kind) => {
          const c = DECISIONS[kind];
          const isRewrite = kind === "REWRITE";
          const dotCls = DOT_CLASS_FOR_ACCENT[c.accent] ?? "bg-muted";
          return (
            <StaggerItem key={kind} as="li">
              <HoverLift className="h-full rounded-lg" lift={4}>
                <div
                  className={cn(
                    "flex h-full flex-col gap-1.5 rounded-lg border px-3 py-2.5",
                    c.border,
                    c.bg,
                    isRewrite && "ring-1 ring-rewrite/50 shadow-sm",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn("h-2 w-2 rounded-full", dotCls)}
                    />
                    <span
                      className={cn(
                        "font-mono text-[12px] font-medium",
                        c.accent,
                      )}
                    >
                      {STRIP_NAME[kind]}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted">
                    {STRIP_COPY[kind]}
                  </p>
                  {isRewrite ? (
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-section text-rewrite-strong">
                      ↑ shown above
                    </p>
                  ) : null}
                </div>
              </HoverLift>
            </StaggerItem>
          );
        })}
      </Stagger>
    </ul>
  );
}
