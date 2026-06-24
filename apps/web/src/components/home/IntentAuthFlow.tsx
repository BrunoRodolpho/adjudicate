"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * IntentAuthFlow — intent-based authentication, alive: a request travels from a
 * human, through the LLM that *proposes* a structured intent, into classification
 * → policy/IBAC → the tool gateway → the real systems. A pulse advances stage by
 * stage so the sequence reads as flow, not a static slide. Reference image #3.
 *
 * Reduced-motion: fully rendered, no advancing pulse.
 */

const STAGES = [
  { n: "1", label: "user", sub: '"pay with the best card"', accent: "#6366F1" },
  { n: "2", label: "LLM", sub: "proposes a structured intent", accent: "#6366F1" },
  { n: "3", label: "intent classification", sub: "kind · subIntents · taint", accent: "#0EA5E9" },
  { n: "4", label: "policy · IBAC", sub: "roles · limits · compliance", accent: "#8B5CF6" },
  { n: "5", label: "tool gateway", sub: "only approved tools run", accent: "#F59E0B" },
  { n: "6", label: "systems", sub: "the real side-effect", accent: "#10B981" },
] as const;

const STAGE_MS = 700;

export function IntentAuthFlow({ className }: { readonly className?: string }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setT((p) => (p + 1) % (STAGES.length + 1)), STAGE_MS);
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
          intent-based authentication · every step verified
        </span>
        <ol className="mt-4 grid gap-2.5 md:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((s, i) => {
            const active = reduce ? false : i === t;
            const done = reduce ? true : i < t;
            return (
              <li
                key={s.label}
                className="relative flex flex-col gap-1 rounded-lg border px-3 py-3 transition-all duration-300"
                style={{
                  borderColor: active ? `${s.accent}77` : "#27272a",
                  background: active ? `${s.accent}14` : "rgba(24,24,27,0.6)",
                  boxShadow: active ? `0 0 0 1px ${s.accent}44` : "none",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-console-faint">{s.n}</span>
                  <span
                    className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
                    style={{ background: active || done ? s.accent : "#3f3f46" }}
                  />
                </div>
                <div className="font-mono text-[12px] text-console-ink">{s.label}</div>
                <div className="font-mono text-[10px] leading-snug text-console-faint">{s.sub}</div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 font-mono text-[10px] text-console-faint">
          the LLM only proposes · the gateway runs only what policy approves
        </p>
      </div>
    </div>
  );
}
