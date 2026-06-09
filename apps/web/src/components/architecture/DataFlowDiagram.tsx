"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Reveal } from "@/components/home/Reveal";

/**
 * DataFlowDiagram — the end-to-end pipeline from an AI agent's intent to a
 * durable, tamper-evident receipt visible in the operator console.
 *
 * The pipeline is a CSS flex/grid layout (no SVG library, no new deps): a
 * horizontal spine on wide viewports that stacks vertically on mobile, with the
 * connector arrows rotating accordingly. Every node is annotated with the REAL
 * package / source file it maps to, so a reader can follow the claim straight
 * into the repo.
 *
 * Motion (AUDIT P1): each stage is a reduced-motion-safe `Stagger` container —
 * nodes, flow edges, and outcome chips fade + rise into view left-to-right as
 * the diagram scrolls in, giving the abstract pipeline a sense of *flow* from
 * intent to receipt. Transform/opacity-only (no layout shift); under
 * `prefers-reduced-motion` every element renders statically and fully visible.
 *
 * Verified against:
 *   - packages/adapter-core/src/loop.ts        (createAdjudicatedAgent, in-process)
 *   - packages/core/src/envelope.ts            (IntentEnvelope, intentHash)
 *   - packages/core/src/decision.ts            (6-valued Decision + basis[])
 *   - packages/core/src/audit.ts               (buildAuditRecord, AuditRecord v5)
 *   - packages/core/src/sink.ts                (AuditSink.emit contract)
 *   - packages/audit-postgres/migrations/*     (intent_audit, partitioned, v5 metadata)
 *   - apps/console/src/lib/audit-bus.ts        (AuditEventBus over Redis, audit.event.v1)
 *   - apps/console/src/app/api/admin/stream/route.ts (SSE live tail)
 */

type NodeTone = "agent" | "kernel" | "audit" | "store" | "bus" | "console";

const TONE_RING: Record<NodeTone, string> = {
  agent: "border-edge",
  kernel: "border-escalate/40",
  audit: "border-confirm/40",
  store: "border-execute/40",
  bus: "border-rewrite/40",
  console: "border-escalate/40",
};

const TONE_DOT: Record<NodeTone, string> = {
  agent: "bg-faint",
  kernel: "bg-escalate",
  audit: "bg-confirm",
  store: "bg-execute",
  bus: "bg-rewrite",
  console: "bg-escalate",
};

/** One labeled pipeline node, annotated with its real package / source path. */
function PipelineNode({
  tone,
  label,
  detail,
  source,
  children,
  className,
}: {
  readonly tone: NodeTone;
  readonly label: string;
  readonly detail: string;
  readonly source?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <StaggerItem
      className={cn(
        "flex h-full flex-col rounded-xl border bg-surface p-4 shadow-sm",
        TONE_RING[tone],
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])}
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold leading-tight text-ink">{label}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
      {children}
      {source ? (
        <code className="mt-auto block pt-3 text-[10.5px] leading-snug text-faint">
          {source}
        </code>
      ) : null}
    </StaggerItem>
  );
}

/** Edge label that sits between two nodes — the data that flows across. */
function FlowEdge({ children }: { readonly children: ReactNode }) {
  return (
    <StaggerItem className="flex items-center justify-center gap-2 py-1 lg:flex-col lg:py-0">
      <span
        className="text-faint lg:hidden"
        aria-hidden="true"
      >
        &darr;
      </span>
      <span
        className="hidden text-faint lg:inline"
        aria-hidden="true"
      >
        &rarr;
      </span>
      <code className="rounded-full border border-edge bg-canvas px-2 py-0.5 text-center text-[10px] leading-tight text-muted">
        {children}
      </code>
    </StaggerItem>
  );
}

const OUTCOMES: ReadonlyArray<{ kind: string; dot: string; text: string }> = [
  { kind: "EXECUTE", dot: "bg-execute", text: "text-execute" },
  { kind: "REFUSE", dot: "bg-refuse", text: "text-refuse" },
  { kind: "ESCALATE", dot: "bg-escalate", text: "text-escalate" },
  { kind: "REQUEST_CONFIRMATION", dot: "bg-confirm", text: "text-confirm" },
  { kind: "DEFER", dot: "bg-defer", text: "text-defer" },
  { kind: "REWRITE", dot: "bg-rewrite", text: "text-rewrite-strong" },
];

/** The 6-outcome chip cluster, using the decision tokens. */
function OutcomeChips() {
  return (
    <Stagger
      as="ul"
      className="mt-3 flex flex-wrap gap-1.5"
      stagger={0.05}
      delay={0.15}
    >
      {OUTCOMES.map((o) => (
        <StaggerItem
          as="li"
          key={o.kind}
          className="inline-flex items-center gap-1 rounded-full border border-edge bg-canvas px-1.5 py-0.5"
        >
          <span
            className={cn("size-1.5 rounded-full", o.dot)}
            aria-hidden="true"
          />
          <code className={cn("text-[9.5px] font-medium", o.text)}>
            {o.kind}
          </code>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export function DataFlowDiagram({ className }: { readonly className?: string }) {
  return (
    <div className={className}>
      {/* Stage 1 — the in-process decision path (agent → kernel → record). */}
      <Stagger className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1.1fr_auto_1.2fr]">
        <PipelineNode
          tone="agent"
          label="AI agent"
          detail="A model call wrapped in-process by createAdjudicatedAgent — every primitive runs inside the host process, never a separate gateway."
          source="@adjudicate/adapter-core · loop.ts"
        />
        <FlowEdge>IntentEnvelope</FlowEdge>
        <PipelineNode
          tone="kernel"
          label="adjudicate() kernel"
          detail="The pure decision function runs BEFORE any side effect. Same input → same Decision, deterministically. No I/O, no network."
          source="@adjudicate/core · decision.ts · envelope.ts"
        />
        <FlowEdge>Decision + basis[]</FlowEdge>
        <PipelineNode
          tone="kernel"
          label="6 outcomes + basis[]"
          detail="Every call resolves to exactly one of six typed outcomes, each carrying the basis codes that explain why."
          source="@adjudicate/core · decision.ts · basis-codes.ts"
        >
          <OutcomeChips />
        </PipelineNode>
      </Stagger>

      {/* Stage 2 — the record is built and emitted to the sink. */}
      <Stagger className="mt-2 grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1.1fr_auto_1.2fr]">
        <PipelineNode
          tone="audit"
          label="buildAuditRecord()"
          detail="The decision, envelope, and basis are folded into one record and bound by a sha256 auditHash — tamper-evident by construction."
          source="@adjudicate/core · audit.ts → buildAuditRecord"
        />
        <FlowEdge>AuditRecord (v5)</FlowEdge>
        <PipelineNode
          tone="audit"
          label="AuditRecord"
          detail="The governance record of truth — exactly one per decision. Carries intentHash, envelope, decision, basis, auditHash, and optional metadata."
          source="@adjudicate/core · audit.ts → AuditRecord"
        />
        <FlowEdge>AuditSink.emit</FlowEdge>
        <PipelineNode
          tone="audit"
          label="AuditSink.emit(record)"
          detail="The sink resolves only after the record is durably committed. Optional + deployment-specific — and where the path fans out to two destinations."
          source="@adjudicate/core · sink.ts → AuditSink"
        />
      </Stagger>

      {/* Branch marker. */}
      <Reveal className="mt-3 flex items-center justify-center">
        <span className="rounded-full border border-edge bg-canvas px-3 py-1 text-[10px] uppercase tracking-section text-muted">
          fans out to two destinations
        </span>
      </Reveal>

      {/* Stage 3 — durable store branch + real-time bus branch. */}
      <Stagger className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* Branch A — durable Postgres mirror. */}
        <PipelineNode
          tone="store"
          label="Postgres · intent_audit"
          detail="The durable audit mirror: a month-partitioned table (PARTITION BY RANGE on recorded_at) with the v5 metadata_jsonb column. Optional — wired only when the deployment configures it."
          source="@adjudicate/audit-postgres · migrations 001–010"
        />

        {/* Branch B — real-time bus → SSE → console live tail. A nested
            Stagger so its own children cascade (variant propagation does not
            cross the plain wrapper div, so this drives them directly). */}
        <Stagger className="grid items-stretch gap-2">
          <PipelineNode
            tone="bus"
            label="AuditEventBus over Redis"
            detail="Each durable write is also published on the audit.event.v1 Redis channel for real-time fan-out. Present only when REDIS_URL is set; absent, the console falls back to polling."
            source="apps/console · lib/audit-bus.ts"
          />
          <FlowEdge>SSE (text/event-stream)</FlowEdge>
          <PipelineNode
            tone="console"
            label="SSE endpoint → console live tail"
            detail="The bus drives a Server-Sent Events stream the operator console reads to render its live audit tail — push, not poll."
            source="apps/console · api/admin/stream/route.ts"
          />
        </Stagger>
      </Stagger>

      {/* Terminus — the operator console. */}
      <Stagger className="mt-3 grid grid-cols-1">
        <PipelineNode
          tone="console"
          label="Operator console (:5180)"
          detail="Operators query the durable mirror over the admin-sdk tRPC API (40+ procedures) and watch the live tail in real time — the authenticated ground-truth surface."
          source="apps/console · @adjudicate/admin-sdk (tRPC)"
        />
      </Stagger>
    </div>
  );
}
