"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  MECHANISM_BEATS,
  type CardState,
} from "@/content/hero-rewrite-beats";
import { cn } from "@/lib/cn";

const BEAT_MS = 3000;
const BEAT_COUNT = MECHANISM_BEATS.length;

/**
 * HeroMechanismPanel — the code-spec-style exhibit sitting beside the
 * Hero video. Four cards (envelope-in → decision → envelope-out → audit)
 * stay visible from beat 1; the active card lights up while others fade.
 * The 12-second cycle matches the Remotion video's 12s loop; the two
 * components run independently and resync at each loop boundary.
 */
export function HeroMechanismPanel() {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState<number>(reduce ? BEAT_COUNT - 1 : 0);

  useEffect(() => {
    if (reduce) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      id = setInterval(() => {
        setBeat((b) => (b + 1) % BEAT_COUNT);
      }, BEAT_MS);
    };
    const stop = () => {
      if (id !== undefined) clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        setBeat(0);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  const current = MECHANISM_BEATS[beat] ?? MECHANISM_BEATS[0]!;

  return (
    <aside
      role="complementary"
      aria-label="REWRITE mechanism, step by step"
      className="w-full rounded-2xl border border-edge bg-surface shadow-sm md:max-w-[340px]"
    >
      <HeaderStrip currentIndex={beat} />
      <div className="flex flex-col gap-3 px-4 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={beat}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: [0.65, 0, 0.35, 1] }}
          >
            <h3 className="text-[15px] font-semibold leading-snug text-ink">
              {current.headline}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {current.body}
            </p>
          </motion.div>
        </AnimatePresence>

        <Card state={current.cards.envelopeIn} />
        <Card state={current.cards.decision} />
        <Card state={current.cards.envelopeOut} />
        <Card state={current.cards.audit} />
      </div>
    </aside>
  );
}

function HeaderStrip({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-section text-rewrite-strong">
        REWRITE · mechanism
      </span>
      <div className="flex gap-1">
        {Array.from({ length: BEAT_COUNT }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-300",
              i === currentIndex ? "bg-rewrite" : "bg-edge",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Card({ state }: { state: CardState }) {
  const isActive = state.active;
  const opacityClass =
    state.opacity === "full"
      ? "opacity-100"
      : state.opacity === "referenced"
        ? "opacity-70"
        : "opacity-40";
  const tintClass = isActive
    ? state.tint === "rewrite"
      ? "border-rewrite/60 bg-rewrite/5"
      : state.tint === "audit"
        ? "border-zinc-400/70 bg-canvas"
        : "border-ink/40 bg-canvas"
    : "border-edge bg-canvas/60";
  return (
    <motion.div
      animate={{
        opacity:
          state.opacity === "full"
            ? 1
            : state.opacity === "referenced"
              ? 0.7
              : 0.4,
      }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-md border px-3 py-2 transition-colors duration-400",
        tintClass,
        opacityClass,
      )}
    >
      <p
        className={cn(
          "font-mono text-[9px] uppercase tracking-section",
          isActive && state.tint === "rewrite"
            ? "text-rewrite-strong"
            : "text-faint",
        )}
      >
        {state.label}
      </p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink/85">
        {state.segments.map((seg, i) => (
          <span key={i}>
            <span>{seg.before}</span>
            {seg.highlight ? (
              <span
                className={cn(
                  "font-semibold",
                  isActive ? "text-rewrite-strong" : "text-faint",
                )}
              >
                {seg.highlight}
              </span>
            ) : null}
            <span>{seg.after}</span>
            {i < state.segments.length - 1 ? "\n" : null}
          </span>
        ))}
      </pre>
    </motion.div>
  );
}
