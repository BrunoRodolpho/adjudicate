import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionRewrite,
  type AuditRecord,
  type Decision,
} from "@adjudicate/core";
import { Section } from "@/components/ui/Section";
import { DECISIONS } from "@/content/decisions";
import { runPlayground } from "@/lib/kernel-runner";
import { MagicMomentSplit } from "@/components/home/MagicMomentSplit";

/**
 * MagicMoment — the "Risk → Fix" conversion centerpiece.
 *
 * Async SERVER component. Runs the REAL kernel server-side (at build time) via
 * runPlayground() for the canonical deploy scenario — a production deploy at
 * 100% ramp with no recorded approval — and reads the actual REWRITE decision
 * back out: the rewritten rampPercent and the record's auditHash. Those real
 * values are handed to a thin client component (MagicMomentSplit) that animates
 * the danger (left) → fixed (right) reveal with the shared motion kit and
 * degrades to a static side-by-side under prefers-reduced-motion.
 *
 * The left pane shows what the agent *proposed* (danger-tinted: production,
 * 100% ramp, no approval). The right pane shows what adjudicate *decided* —
 * REWRITE, ramp clamped to the real cap — plus a compact, real receipt line
 * carrying the auditHash. Nothing here is mocked: the caption says so.
 *
 * If the real run ever fails at build (it shouldn't — the kernel is pure and
 * deterministic), we fall back to a record built from the same @adjudicate/core
 * primitives so the homepage never crashes. The REAL run is always preferred.
 */

const PRESET = DECISIONS.REWRITE.playgroundPreset;

interface MomentData {
  /** Ramp the agent proposed (from the preset payload). */
  readonly proposedRamp: number;
  /** Ramp adjudicate clamped to (read off the real rewritten envelope). */
  readonly rewrittenRamp: number;
  /** The proposed environment (danger context). */
  readonly environment: string;
  /** Real audit hash of the decision, truncated for display. */
  readonly auditHashShort: string;
  /** True when the values came from the live server-side kernel run. */
  readonly real: boolean;
}

function rampOf(payload: unknown): number | undefined {
  const v = (payload as { rampPercent?: unknown } | null)?.rampPercent;
  return typeof v === "number" ? v : undefined;
}

function envOf(payload: unknown): string | undefined {
  const v = (payload as { environment?: unknown } | null)?.environment;
  return typeof v === "string" ? v : undefined;
}

/** Short, stable middle-truncation of a hash for a compact receipt line. */
function shortHash(hash: string | undefined): string {
  if (!hash) return "—";
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

async function loadMoment(): Promise<MomentData> {
  const proposedRamp = rampOf(PRESET.payload) ?? 100;
  const environment = envOf(PRESET.payload) ?? "production";
  try {
    const result = await runPlayground({
      intentKind: PRESET.intentKind,
      payload: PRESET.payload,
    });
    const rewrittenRamp =
      result.decision.kind === "REWRITE"
        ? rampOf(result.decision.rewritten.payload)
        : undefined;
    return {
      proposedRamp,
      rewrittenRamp: rewrittenRamp ?? 25,
      environment,
      auditHashShort: shortHash(result.record.auditHash),
      real: true,
    };
  } catch {
    const fb = buildFallback();
    const rewrittenRamp =
      fb.decision.kind === "REWRITE"
        ? rampOf(fb.decision.rewritten.payload)
        : undefined;
    return {
      proposedRamp,
      rewrittenRamp: rewrittenRamp ?? 25,
      environment,
      auditHashShort: shortHash(fb.record.auditHash),
      real: false,
    };
  }
}

/**
 * Representative REWRITE response built from the same core primitives the
 * kernel uses. Only reached if the real server-side run fails at build.
 */
function buildFallback(): { decision: Decision; record: AuditRecord } {
  const proposed = buildEnvelope({
    kind: PRESET.intentKind,
    payload: PRESET.payload,
    actor: { principal: "llm", sessionId: "s-3f7a" },
    taint: "UNTRUSTED",
    nonce: "fallback-magic-moment",
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
  const record = buildAuditRecord({
    envelope: proposed,
    decision,
    durationMs: 1,
    at: "2026-06-07T00:00:00.000Z",
  });
  return { decision, record };
}

export async function MagicMoment() {
  const data = await loadMoment();
  return (
    <Section tone="surface" id="magic-moment">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-muted">
          Risk &rarr; Fix
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          One risky deploy, caught and rewritten — in milliseconds.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          An agent proposes shipping to{" "}
          <span className="font-medium text-ink">
            all of {data.environment}
          </span>{" "}
          with no recorded approval. adjudicate doesn&apos;t just block it — it
          returns a <span className="font-medium text-ink">safer action</span>{" "}
          and a tamper-evident receipt.
        </p>
      </div>

      <div className="mt-12">
        <MagicMomentSplit
          environment={data.environment}
          proposedRamp={data.proposedRamp}
          rewrittenRamp={data.rewrittenRamp}
          auditHashShort={data.auditHashShort}
          real={data.real}
        />
      </div>
    </Section>
  );
}
