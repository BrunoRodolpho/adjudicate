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
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { DECISIONS } from "@/content/decisions";
import { runPlayground, type PlaygroundResponse } from "@/lib/kernel-runner";
import { cn } from "@/lib/cn";

/**
 * Step 3 — "The black box recorder for AI" — THE CENTERPIECE.
 *
 * Async server component. Runs the REAL kernel server-side via runPlayground()
 * for the canonical deploy scenario (production ramp 100% → REWRITE clamp to
 * 25%) and renders the resulting AuditRecord through the shared ReceiptCard.
 *
 * The reframe: an aircraft has a flight recorder so that, after the fact, you
 * can replay exactly what happened and prove it wasn't altered. adjudicate is
 * that for AI actions. Every decision becomes a signed, hash-chained,
 * tamper-evident receipt. The annotation rail translates the load-bearing
 * cryptographic fields into plain English — what each one PROVES, with no
 * crypto fluency assumed: intentHash (a fingerprint of the action), auditHash
 * (tamper-evidence), signature (non-repudiation) — plus the persistence rail
 * (append-only, replayable).
 *
 * If runPlayground throws at build time (it shouldn't — the kernel is pure,
 * deterministic, and dependency-free), we fall back to a representative record
 * built from the same @adjudicate/core primitives so the page never crashes.
 * The REAL run is always preferred.
 *
 * Motion: the receipt fades in via <Reveal> and the annotation rail cascades
 * via <Stagger> — both useReducedMotion-gated (static, all-visible under
 * reduce-motion). Transform/opacity-only; no layout shift.
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
          The black box recorder for AI.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          A plane has a flight recorder so you can replay exactly what happened
          and prove nothing was tampered with. adjudicate is that for AI
          actions. Every decision emits one{" "}
          <span className="font-medium text-ink">tamper-evident,
          hash-chained, signed receipt</span> — the proposed envelope, the
          outcome, the basis, and the hashes that make it verifiable and
          replayable. This is a real record{" "}
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
        <Reveal className="min-w-0">
          <ReceiptCard result={result} variant="full" />
        </Reveal>

        {/* Annotation rail — what each load-bearing field PROVES, in plain
            English. Cascades in via Stagger (static under reduce-motion). */}
        <Stagger
          as="aside"
          aria-label="What the receipt records — in plain English"
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
            . One of six, never free-form. It records what the kernel decided.
          </Annotation>
          <Annotation
            icon={<ScrollText size={16} aria-hidden="true" />}
            field="basis"
            tone="rewrite"
          >
            The machine-readable reason —{" "}
            <span className="font-mono text-ink/85">quantity_capped</span> — so
            you can answer <span className="italic">why</span> after the fact,
            not just <span className="italic">what</span>. Explainable, not
            opaque.
          </Annotation>
          <Annotation
            icon={<Fingerprint size={16} aria-hidden="true" />}
            field="intentHash"
            tone="neutral"
          >
            <span className="font-medium text-ink">
              A fingerprint of the action.
            </span>{" "}
            Change one byte of the request and this hash changes. The rewritten
            envelope fingerprints differently — so the swap from 100% to 25% is
            provable, not just claimed.
          </Annotation>
          <Annotation
            icon={<ShieldCheck size={16} aria-hidden="true" />}
            field="auditHash"
            tone="neutral"
          >
            <span className="font-medium text-ink">Tamper-evidence.</span> A
            single hash binding the envelope, the decision, and the basis
            together — and chaining to the record before it. Alter any past
            record and the chain no longer verifies. This is the black box you
            can&apos;t quietly rewrite.
          </Annotation>
          <Annotation
            icon={<PenLine size={16} aria-hidden="true" />}
            field="signature"
            tone="neutral"
          >
            <span className="font-medium text-ink">Non-repudiation.</span> A
            cryptographic signature over the auditHash. It proves{" "}
            <span className="italic">who</span> attests this record — so no one
            can later deny producing it. Optional, but on when you need it.
          </Annotation>

          {/* Persistence rail. */}
          <StaggerItem>
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
                (Postgres). Append-only, queryable, replayable — every receipt
                kept, none overwritten.
              </p>
            </div>
          </StaggerItem>
        </Stagger>
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
    <StaggerItem className="flex gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
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
    </StaggerItem>
  );
}
