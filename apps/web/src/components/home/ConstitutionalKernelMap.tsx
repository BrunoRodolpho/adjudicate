"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * ConstitutionalKernelMap — the architecture at a glance, alive. Immutable
 * input snapshots feed a pure, deterministic kernel of six ordered guards; the
 * decision fans to one of six outcomes, mints a capability, and reaches the
 * execution fabric. Adjudicant observes from above (read-only, never in the
 * path); the monotonicity law rails the bottom (friction only). A pulse breathes
 * left→right and the guards glow in order, so the topology reads as a living
 * system rather than a static diagram. Reference: the homepage KernelTrace.
 *
 * Reduced-motion: fully rendered, no pulse/glow.
 */

const INPUTS = [
  { label: "authority graph", hint: "owns · joint · advisor" },
  { label: "provenance", hint: "origin · taint" },
  { label: "limits", hint: "velocity · exposure" },
  { label: "compliance", hint: "sanctions · KYC" },
  { label: "signed policy", hint: "sealed · verified" },
] as const;

const GUARDS = [
  { n: "1", label: "intentHash", tone: "ink" },
  { n: "2", label: "provenance / taint", tone: "ink" },
  { n: "3", label: "ownership", tone: "ink" },
  { n: "4", label: "deterministic limits", tone: "ink" },
  { n: "5", label: "risk — escalate-only", tone: "escalate" },
  { n: "6", label: "default — refuse", tone: "refuse" },
] as const;

const STAGE_MS = 520;

export function ConstitutionalKernelMap({ className }: { readonly className?: string }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setT((p) => (p + 1) % (GUARDS.length + 3)), STAGE_MS);
    return () => clearInterval(id);
  }, [reduce]);

  const activeGuard = reduce ? -1 : t < GUARDS.length ? t : -1;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-console-edge bg-console-canvas ${className ?? ""}`}
      style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 80px -20px rgba(0,0,0,0.7)" }}
    >
      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "radial-gradient(rgb(39 39 42) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />

      {/* Adjudicant — observes from above, never in the path */}
      <div className="relative flex items-center justify-center gap-2 border-b border-dashed border-console-edge px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-confirm">adjudicant</span>
        <span className="font-mono text-[10px] text-console-faint">· read-only · observes · never authorizes</span>
      </div>

      <div className="relative grid items-stretch gap-px bg-console-edge md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]">
        {/* INPUTS */}
        <div className="bg-console-canvas p-5">
          <Eyebrow>inputs · immutable snapshots</Eyebrow>
          <ul className="mt-3 flex flex-col gap-2">
            {INPUTS.map((inp) => (
              <li
                key={inp.label}
                className="rounded-lg border border-console-edge bg-console-panel px-3 py-2"
              >
                <div className="font-mono text-[12px] text-console-ink">{inp.label}</div>
                <div className="font-mono text-[10px] text-console-faint">{inp.hint}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* KERNEL */}
        <div className="relative bg-console-canvas p-5">
          {/* breathing glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(60% 50% at 50% 40%, rgba(99,102,241,0.12), transparent)" }}
          />
          <div className="relative">
            <Eyebrow>constitutional kernel · pure · deterministic</Eyebrow>
            <ul className="mt-3 flex flex-col gap-1.5">
              {GUARDS.map((g, i) => {
                const active = i === activeGuard;
                const accent = g.tone === "escalate" ? "#8B5CF6" : g.tone === "refuse" ? "#EF4444" : "#6366F1";
                return (
                  <li
                    key={g.label}
                    className="flex items-center gap-3 rounded-md border px-2.5 py-1.5 transition-all duration-300"
                    style={{
                      borderColor: active ? `${accent}66` : "#27272a",
                      background: active ? `${accent}12` : "rgba(24,24,27,0.6)",
                      boxShadow: active ? `0 0 0 1px ${accent}33` : "none",
                    }}
                  >
                    <span className="font-mono text-[10px] text-console-faint">{g.n}</span>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: g.tone === "ink" ? "#6366F1" : accent }}
                    />
                    <span
                      className={`font-mono text-[12px] ${g.tone === "escalate" ? "text-escalate" : g.tone === "refuse" ? "text-refuse" : "text-console-ink"}`}
                    >
                      {g.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 font-mono text-[10px] text-console-faint">
              guard order · fail-closed · synchronous · no I/O
            </p>
          </div>
        </div>

        {/* DECISION → CAPABILITY → EXECUTION */}
        <div className="flex flex-col gap-2 bg-console-canvas p-5">
          <Eyebrow>on execute</Eyebrow>
          <Flow label="decision" sub="one of six outcomes" accent="#6366F1" />
          <Arrow />
          <Flow label="capability minted" sub="bound · single-use · expiring" accent="#10B981" />
          <Arrow />
          <Flow label="execution fabric" sub="cap-gated side-effect" accent="#10B981" />
          <Arrow />
          <Flow label="audit chain" sub="hash-linked · replayable" accent="#3f3f46" />
        </div>
      </div>

      {/* Monotonicity rail */}
      <div className="relative flex items-center justify-center gap-2 border-t border-console-edge px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-defer">monotonicity</span>
        <span className="font-mono text-[10px] text-console-faint">
          · non-deterministic signals add friction only — never authorize
        </span>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">{children}</span>
  );
}

function Flow({ label, sub, accent }: { label: string; sub: string; accent: string }) {
  return (
    <div
      className="rounded-lg border bg-console-panel px-3 py-2"
      style={{ borderColor: `${accent === "#3f3f46" ? "#27272a" : accent + "55"}` }}
    >
      <div className="font-mono text-[12px]" style={{ color: accent === "#3f3f46" ? "#a1a1aa" : accent }}>
        {label}
      </div>
      <div className="font-mono text-[10px] text-console-faint">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <div aria-hidden className="mx-auto h-3 w-px bg-console-edge" />;
}
