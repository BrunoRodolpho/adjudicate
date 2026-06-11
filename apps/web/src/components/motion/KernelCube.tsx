"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { DECISIONS_ORDER } from "@/content/decisions";
import { DecisionChip } from "@/components/ui/DecisionChip";

/**
 * Hero centrepiece — a stylised kernel cube emits one of six Decision
 * badges in a slow rotation. Respects prefers-reduced-motion (freezes on
 * EXECUTE). The "cube" is an abstract rounded-square with a flowing
 * gradient that hints at the policy stack underneath.
 */
export function KernelCube() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(
      () => setI((x) => (x + 1) % DECISIONS_ORDER.length),
      2200,
    );
    return () => clearInterval(id);
  }, [reduce]);

  const currentKind = reduce ? "EXECUTE" : DECISIONS_ORDER[i]!;

  return (
    <div className="relative flex h-72 w-full max-w-md flex-col items-center justify-center md:h-96">
      {/* glow */}
      <motion.div
        className="absolute inset-0 -z-10 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(139,92,246,0.35), rgba(217,70,239,0.18), transparent 70%)",
        }}
        animate={
          reduce
            ? undefined
            : {
                scale: [1, 1.12, 1],
                opacity: [0.7, 1, 0.7],
              }
        }
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* the cube */}
      <motion.div
        className="flex h-44 w-44 items-center justify-center rounded-2xl bg-gradient-primary shadow-2xl md:h-56 md:w-56"
        animate={
          reduce
            ? undefined
            : {
                rotate: [0, 2, -2, 0],
                y: [0, -4, 4, 0],
              }
        }
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex flex-col gap-2 px-4 text-center">
          <span className="text-[10px] uppercase tracking-section text-white/70">
            adjudicate kernel
          </span>
          <span className="font-mono text-xs text-white/90">
            state → taint → auth → business
          </span>
        </div>
      </motion.div>

      {/* emitted decision */}
      <div className="mt-6 flex h-12 items-center justify-center">
        {/* initial={false} → the first badge renders visible in SSR / no-JS
            (only subsequent cycles animate). */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentKind}
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <DecisionChip kind={currentKind} size="lg" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
