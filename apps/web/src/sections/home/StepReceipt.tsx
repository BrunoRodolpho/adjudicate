import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionRewrite,
  type AuditRecord,
} from "@adjudicate/core";
import {
  Fingerprint,
  Gavel,
  Database,
  ScrollText,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/Section";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { DECISIONS } from "@/content/decisions";
import { runPlayground, type PlaygroundResponse } from "@/lib/kernel-runner";
import { cn } from "@/lib/cn";

/**
 * Step 3 — "What was recorded?" — THE CENTERPIECE.
 *
 * Async server component. Runs the REAL kernel server-side via runPlayground()
 * for the canonical deploy scenario (production ramp 100% → REWRITE clamp to
 * 25%) and renders the resulting AuditRecord through the shared ReceiptCard.
 * Annotation callouts point at the load-bearing fields: decision, basis,
 * intentHash, auditHash (tamper-evidence), signature (non-repudiation), and a
 * rail noting the record is persisted to Postgres.
 *
 * If runPlayground throws at build time (it shouldn't — the kernel is pure,
 * deterministic, and dependency-free), we fall back to a representative record
 * built from the same @adjudicate/core primitives so the page never crashes.
 * The REAL run is always preferred.
 */

const PRESET = DECISIONS.REWRITE.playgroundPreset;

async function loadReceipt(): Promise<{
  readonly result: PlaygroundResponse;
  readonly real: boolean;
}> {
  try {
    const result = await runPlayground({
      intentKind: PRESET.intentKind,
      payload: PRESET.payload,
    });
    return { result, real: true };
  } catch {
    return { result: buildFallback(), real: false };
  }
}

/**
 * Representative REWRITE response, built from the same core primitives the
 * kernel uses. Only ever reached if the real server-side run fails at build.
 */
function buildFallback(): PlaygroundResponse {
  const proposed = buildEnvelope({
    kind: PRESET.intentKind,
    payload: PRESET.payload,
    actor: { principal: "llm", sessionId: "s-3f7a" },
    taint: "UNTRUSTED",
    nonce: "fallback-rewrite",
    createdAt: "2026-06-07T00:00:00.000Z",
  });
  const rewritten = buildEnvelope({
    kind: PRESET.intentKind,
    payload: { ...PRESET.payload, rampPercent: 25 },
    actor: proposed.actor,
    taint: proposed.taint,
    nonce: proposed.nonce,
    createdAt: proposed.createdAt,
  });
  const decision = decisionRewrite(
    rewritten,
    "Production ramp clamped from 100% to 25%.",
    [
      basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
        requested: 100,
        cap: 25,
      }),
    ],
  );
  const record: AuditRecord = buildAuditRecord({
    envelope: proposed,
    decision,
    durationMs: 1,
    at: "2026-06-07T00:00:00.000Z",
  });
  return {
    decision,
    record,
    packId: "pack-deployments-approval",
    packName: "Deployments · Approval",
    trace: [],
  };
}

export async function StepReceipt() {
  const { result, real } = await loadReceipt();

  return (
    <Section tone="canvas" id="step-receipt">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-muted">
          Step 3 / 4 · Receipt saved
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Every decision becomes a signed receipt.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          The kernel emits one tamper-evident{" "}
          <span className="font-medium text-ink">AuditRecord</span> per decision
          — the proposed envelope, the outcome, the basis, and the hashes that
          make it verifiable. This is a real record{" "}
          {real ? (
            <span className="font-medium text-ink">
              produced live, server-side, by the kernel
            </span>
          ) : (
            <span className="font-medium text-ink">
              built from the kernel&apos;s own primitives
            </span>
          )}{" "}
          for the scenario above.
        </p>
      </div>

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The real receipt. */}
        <div className="min-w-0">
          <ReceiptCard result={result} variant="full" />
        </div>

        {/* Annotation rail — what each load-bearing field proves. */}
        <aside
          aria-label="What the receipt records"
          className="flex flex-col gap-3"
        >
          <Annotation
            icon={<Gavel size={16} aria-hidden="true" />}
            field="decision"
            tone="rewrite"
          >
            The structured outcome — here{" "}
            <span className="font-mono font-semibold text-rewrite-strong">
              REWRITE
            </span>
            . One of six, never free-form.
          </Annotation>
          <Annotation
            icon={<ScrollText size={16} aria-hidden="true" />}
            field="basis"
            tone="rewrite"
          >
            The machine-readable reason —{" "}
            <span className="font-mono text-ink/85">quantity_capped</span> — so
            the decision is explainable, not opaque.
          </Annotation>
          <Annotation
            icon={<Fingerprint size={16} aria-hidden="true" />}
            field="intentHash"
            tone="neutral"
          >
            Content-addressed hash of the proposed envelope. The rewritten
            envelope hashes differently — the swap is provable.
          </Annotation>
          <Annotation
            icon={<ShieldCheck size={16} aria-hidden="true" />}
            field="auditHash"
            tone="neutral"
          >
            <span className="font-medium text-ink">Tamper-evidence.</span> A hash
            binding envelope, decision, and basis. Change one byte and
            verification fails.
          </Annotation>
          <Annotation
            icon={<PenLine size={16} aria-hidden="true" />}
            field="signature"
            tone="neutral"
          >
            <span className="font-medium text-ink">Non-repudiation.</span> An
            optional cryptographic signature over the auditHash — who attests
            this record, provably.
          </Annotation>

          {/* Persistence rail. */}
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-execute/30 bg-execute/5 px-4 py-3">
            <Database
              size={18}
              className="shrink-0 text-execute"
              aria-hidden="true"
            />
            <p className="text-sm leading-snug text-muted">
              <span className="font-medium text-ink">
                &rarr; saved to a database
              </span>{" "}
              (Postgres). Append-only, queryable, replayable.
            </p>
          </div>
        </aside>
      </div>
    </Section>
  );
}

function Annotation({
  icon,
  field,
  tone,
  children,
}: {
  readonly icon: ReactNode;
  readonly field: string;
  readonly tone: "rewrite" | "neutral";
  readonly children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "rewrite" ? "text-rewrite-strong" : "text-muted",
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <code
          className={cn(
            "w-fit rounded-md border bg-canvas px-2 py-0.5 font-mono text-[11px]",
            tone === "rewrite"
              ? "border-rewrite/40 text-rewrite-strong"
              : "border-edge text-ink/85",
          )}
        >
          {field}
        </code>
        <p className="text-sm leading-snug text-muted">{children}</p>
      </div>
    </div>
  );
}
