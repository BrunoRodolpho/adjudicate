"use client";

import { useRef, useState } from "react";
import { GuidedMode } from "./playground/guided/GuidedMode";
import { SandboxMode } from "./playground/sandbox/SandboxMode";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";

type Mode = "guided" | "sandbox";

const SEGMENTS = [
  {
    id: "guided" as const,
    label: "Guided",
    hint: "Start here",
    description: "One business case at a time, in plain language.",
  },
  {
    id: "sandbox" as const,
    label: "Sandbox",
    hint: "Configure & test",
    description: "Pick a Pack and intent, edit a form, run the kernel.",
  },
];

/**
 * Playground — the two-mode shell that replaces the old free-form-tabs
 * playground. A segmented control (proper tablist with roving arrow-key
 * navigation) switches between GUIDED (the friendly default) and SANDBOX
 * ("Configure & test"). Both modes drive the SAME real kernel server-side via
 * POST /api/playground/adjudicate — nothing here is a recording.
 *
 * Export name kept as `Playground` so app/playground/page.tsx is unaffected.
 */
export function Playground() {
  const [mode, setMode] = useState<Mode>("guided");
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    guided: null,
    sandbox: null,
  });

  function focusTab(id: Mode) {
    setMode(id);
    tabRefs.current[id]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const order: readonly Mode[] = SEGMENTS.map((s) => s.id);
    const current = order.indexOf(mode);
    let next: Mode | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = order[(current + 1) % order.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = order[(current - 1 + order.length) % order.length];
    } else if (event.key === "Home") {
      next = order[0];
    } else if (event.key === "End") {
      next = order[order.length - 1];
    }
    if (next) {
      event.preventDefault();
      focusTab(next);
    }
  }

  return (
    <section id="playground" className="bg-surface py-20">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading
          eyebrow="Live playground"
          title="Watch the kernel decide."
          subtitle="Every decision runs the real Packs server-side and produces a tamper-evident, replayable receipt. Start guided to see a complete business story, or jump to the sandbox to configure your own test. Real kernel, real time."
          align="center"
        />

        {/* Segmented control */}
        <div className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Playground mode"
            aria-orientation="horizontal"
            className="inline-flex gap-1 rounded-2xl border border-edge bg-canvas p-1 shadow-sm"
          >
            {SEGMENTS.map((seg) => {
              const selected = mode === seg.id;
              return (
                <button
                  key={seg.id}
                  ref={(el) => {
                    tabRefs.current[seg.id] = el;
                  }}
                  role="tab"
                  type="button"
                  id={`playground-tab-${seg.id}`}
                  aria-selected={selected}
                  aria-controls={`playground-panel-${seg.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setMode(seg.id)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl px-6 py-2.5 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                    selected
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {seg.label}
                    {seg.hint ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          selected
                            ? "bg-ink/10 text-ink"
                            : "bg-edge/60 text-muted",
                        )}
                      >
                        {seg.hint}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] font-normal text-muted">
                    {seg.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panels */}
        <div className="mt-10">
          <div
            role="tabpanel"
            id="playground-panel-guided"
            aria-labelledby="playground-tab-guided"
            hidden={mode !== "guided"}
          >
            {mode === "guided" ? <GuidedMode /> : null}
          </div>
          <div
            role="tabpanel"
            id="playground-panel-sandbox"
            aria-labelledby="playground-tab-sandbox"
            hidden={mode !== "sandbox"}
          >
            {mode === "sandbox" ? <SandboxMode /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
