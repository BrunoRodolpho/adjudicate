"use client";

import { motion } from "framer-motion";
import {
  CircleCheck,
  Clock,
  HelpCircle,
  RotateCcw,
  ShieldX,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { DECISIONS, DECISIONS_ORDER, type DecisionContent } from "@/content/decisions";
import { SectionHeading } from "@/components/ui/SectionHeading";

const ICONS: Record<DecisionContent["icon"], LucideIcon> = {
  CircleCheck,
  ShieldX,
  RotateCcw,
  Clock,
  UserCheck,
  HelpCircle,
};

export function DecisionsGrid() {
  return (
    <section className="bg-console-panel py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Six outcomes, not two"
          title="Decision semantics a yes/no policy engine doesn't model."
          subtitle="Cedar returns a binary Allow/Deny; OPA can emit arbitrary JSON but ships no REWRITE re-adjudication or DEFER park-and-resume. Adjudicate's six structured outcomes include the engine-owned REWRITE (the kernel substitutes a capped, sanitised action and re-adjudicates it) and first-class DEFER — outcomes neither engine returns natively."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DECISIONS_ORDER.map((kind, idx) => {
            const c = DECISIONS[kind];
            const Icon = ICONS[c.icon];
            return (
              <motion.div
                key={kind}
                initial={{ y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className={`group rounded-xl border ${c.border} ${c.bg} p-5 transition-transform hover:-translate-y-1`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <Icon size={22} className={c.accent} />
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-section ${c.accent}`}
                  >
                    {kind}
                  </span>
                </div>
                <h3 className={`text-lg font-semibold ${c.accent}`}>
                  {c.headline}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-console-muted">
                  {c.oneLiner}
                </p>
                <a
                  href="/playground"
                  className={`mt-4 inline-block text-xs font-medium ${c.accent} hover:underline`}
                >
                  Try it in the playground →
                </a>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
