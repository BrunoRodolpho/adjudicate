"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * BoundariesRail — the five trust boundaries every request crosses, alive: each
 * boundary lights in turn with its checks. A request is verified at identity,
 * intent, semantic, authorization, and execution — defense in depth, fail-closed.
 * Reference image #1 (the 5 boundaries), re-grounded in adjudicate's mechanisms.
 *
 * Reduced-motion: fully rendered, no sweep.
 */

const BOUNDARIES = [
  { n: "1", label: "identity", checks: "authn · rate limit", accent: "#0EA5E9" },
  { n: "2", label: "intent", checks: "classification · tool allowlist", accent: "#6366F1" },
  { n: "3", label: "semantic", checks: "provenance · taint · drift", accent: "#8B5CF6" },
  { n: "4", label: "authorization", checks: "ownership · limits · round-trip", accent: "#F59E0B" },
  { n: "5", label: "execution", checks: "capability-gated side-effect", accent: "#10B981" },
] as const;

const STAGE_MS = 760;

export function BoundariesRail({ className }: { readonly className?: string }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setT((p) => (p + 1) % (BOUNDARIES.length + 1)), STAGE_MS);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-console-edge bg-console-canvas p-5 ${className ?? ""}`}
      style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "radial-gradient(rgb(39 39 42) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      <div className="relative">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">
          five boundaries · defense in depth · fail-closed
        </span>
        <ol className="mt-4 flex flex-col gap-2">
          {BOUNDARIES.map((b, i) => {
            const active = reduce ? false : i === t;
            const done = reduce ? true : i < t;
            return (
              <li
                key={b.label}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300"
                style={{
                  borderColor: active ? `${b.accent}77` : "#27272a",
                  background: active ? `${b.accent}14` : "rgba(24,24,27,0.6)",
                  boxShadow: active ? `0 0 0 1px ${b.accent}44` : "none",
                }}
              >
                <span className="font-mono text-[11px] text-console-faint">{b.n}</span>
                <span
                  className="h-2 w-2 shrink-0 rounded-full transition-colors duration-300"
                  style={{ background: active || done ? b.accent : "#3f3f46" }}
                />
                <span className="min-w-[120px] font-mono text-[13px] text-console-ink">{b.label}</span>
                <span className="ml-auto font-mono text-[11px] text-console-muted">{b.checks}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
