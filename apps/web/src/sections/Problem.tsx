"use client";

import { motion } from "framer-motion";
import { ArrowRight, Database, AlertTriangle } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * The four kernel phases, each with a one-line gloss of what it gates. The
 * gloss surfaces on hover/focus as a native title + aria-label (AUDIT P2) so
 * the animated phase strip becomes demonstrative, not just decorative.
 */
const PHASES = [
  { id: "state", gates: "Checks the request is valid for the current state." },
  { id: "taint", gates: "Validates actor provenance — is the caller trusted?" },
  { id: "auth", gates: "Confirms the actor is authorized for this kind." },
  { id: "business", gates: "Applies domain rules — caps, ramps, thresholds." },
] as const;

export function Problem() {
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="The problem"
          title="LLMs aren't trusted. Your database trusts them anyway."
          subtitle="Most agent frameworks send the tool call straight from the model to the side-effect. Adjudicate inserts a kernel between the two — the only path from intent to execution."
          align="center"
        />

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <Panel
            title="Without adjudicate"
            tint="rose"
            statusIcon={<AlertTriangle size={18} className="text-refuse" />}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <Pill label="LLM" />
              <motion.div
                aria-hidden
                animate={{ x: [0, 8, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-refuse"
              >
                <ArrowRight size={20} />
              </motion.div>
              <Pill label="Production" icon={<Database size={14} />} tone="danger" />
            </div>
            <p className="mt-4 text-sm text-muted">
              The model proposes. The system executes. No structured outcome,
              no replay protection, no audit trail beyond logs you have to
              parse.
            </p>
          </Panel>

          <Panel
            title="With adjudicate"
            tint="brand"
            statusIcon={
              <span className="rounded-full bg-execute/15 px-2 py-0.5 text-[10px] uppercase tracking-section text-execute">
                Kernel
              </span>
            }
          >
            <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
              <Pill label="LLM" />
              <ArrowRight size={16} className="shrink-0 text-faint" />
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {PHASES.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 2.4,
                      repeat: Infinity,
                      delay: idx * 0.4,
                    }}
                    tabIndex={0}
                    title={`${p.id} — ${p.gates}`}
                    aria-label={`${p.id} phase: ${p.gates}`}
                    className="flex-1 cursor-help rounded-sm border border-edge bg-canvas px-1.5 py-1 text-center text-[10px] uppercase tracking-section text-muted transition-colors hover:border-brand/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {p.id}
                  </motion.div>
                ))}
              </div>
              <ArrowRight size={16} className="text-faint" />
              <Pill label="DB / API" icon={<Database size={14} />} />
            </div>
            <p className="mt-4 text-sm text-muted">
              The kernel reads the envelope, runs the policy phases in order,
              and emits a structured Decision (EXECUTE, REFUSE, REWRITE, DEFER,
              ESCALATE, or REQUEST_CONFIRMATION) plus a replay-safe AuditRecord.
            </p>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  children,
  tint,
  statusIcon,
}: {
  title: string;
  children: React.ReactNode;
  tint: "brand" | "rose";
  statusIcon: React.ReactNode;
}) {
  const tintBorder = tint === "brand" ? "border-brand/30" : "border-rose-200";
  const tintBg = tint === "brand" ? "bg-brand/5" : "bg-rose-50";
  return (
    <div className={`min-w-0 rounded-2xl border ${tintBorder} ${tintBg} p-6 shadow-sm`}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        {statusIcon}
      </div>
      {children}
    </div>
  );
}

function Pill({
  label,
  icon,
  tone = "default",
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "border-refuse/40 bg-refuse/10 text-refuse"
      : "border-edge bg-surface text-ink";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${cls}`}
    >
      {icon} {label}
    </span>
  );
}
