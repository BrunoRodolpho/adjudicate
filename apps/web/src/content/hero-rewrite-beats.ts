import type { DecisionKind } from "@adjudicate/core";
import type { JsonSegment } from "@/lib/json-segment";

export type { JsonSegment };

/**
 * Beat content for the Hero's REWRITE mechanism panel. The panel animates
 * through four cards (envelope-in, decision, envelope-out, audit) and at
 * each beat one card is "active" while the rest dim. Every JSON field name
 * here matches `packages/core/src/{envelope,decision,audit,basis-codes}.ts`
 * exactly — nothing invented, nothing aspirational.
 *
 * The two intentHash values are intentionally distinct: a REWRITE produces
 * a NEW envelope whose hash differs from the original (because the payload
 * differs). h1 is the original; h2 is the rewritten one.
 */

export type CardId = "envelopeIn" | "decision" | "envelopeOut" | "audit";

export interface CardState {
  readonly id: CardId;
  /** Mono label shown above the card. */
  readonly label: string;
  /** Tint applied when active. "neutral" = no tint (just border). */
  readonly tint: "neutral" | "rewrite" | "audit";
  /** Pre-segmented JSON lines for this beat. Empty = placeholder render. */
  readonly segments: readonly JsonSegment[];
  /** True when this card is the focal point of this beat. */
  readonly active: boolean;
  /** Opacity tier — full, referenced (active in a prior beat), or backgrounded. */
  readonly opacity: "full" | "referenced" | "background";
}

export interface MechanismBeat {
  readonly index: 0 | 1 | 2 | 3;
  readonly headline: string;
  readonly body: string;
  readonly cards: Record<CardId, CardState>;
}

const H1 = "sha256:9f4c…c4f2";
const H2 = "sha256:3a01…8a91";

/** Single-line JSON segment with no highlight. */
const plain = (text: string): JsonSegment => ({
  before: text,
  highlight: "",
  after: "",
});

/** Segment with a highlighted token in the middle. */
const hl = (before: string, highlight: string, after = ""): JsonSegment => ({
  before,
  highlight,
  after,
});

// ── Envelope-in shapes ────────────────────────────────────────────────

const envelopeInProposed = (highlightRamp: boolean): readonly JsonSegment[] => [
  plain("{"),
  plain("  version: 2,"),
  plain('  kind: "deployment.approval.request",'),
  plain("  payload: {"),
  plain('    service: "api",'),
  plain('    environment: "production",'),
  highlightRamp ? hl("    rampPercent: ", "100") : plain("    rampPercent: 100"),
  plain("  },"),
  plain('  actor: { principal: "llm", sessionId: "s-7e2…" },'),
  plain('  taint: "UNTRUSTED",'),
  plain('  nonce: "01HVT…",'),
  hl("  intentHash: ", `"${H1}"`),
  plain("}"),
];

// ── Decision shapes ───────────────────────────────────────────────────

const decisionPlaceholder: readonly JsonSegment[] = [plain("decision: pending")];

const decisionRewrite: readonly JsonSegment[] = [
  plain("{"),
  hl("  kind: ", '"REWRITE"', ","),
  plain("  rewritten: { …new envelope… },"),
  hl("  reason: ", '"rampPercent capped to staged-rollout max."', ","),
  plain("  basis: ["),
  plain("    {"),
  plain('      category: "business",'),
  hl('      code: ', '"QUANTITY_CAPPED"', ","),
  plain("      details: { requested: 100, cappedTo: 25 }"),
  plain("    }"),
  plain("  ]"),
  plain("}"),
];

// ── Envelope-out shapes ───────────────────────────────────────────────

const envelopeOutPlaceholder: readonly JsonSegment[] = [
  plain("envelope · rewritten: —"),
];

const envelopeOutRewritten = (highlight: boolean): readonly JsonSegment[] => [
  plain("{"),
  plain("  version: 2,"),
  plain('  kind: "deployment.approval.request",'),
  plain("  payload: {"),
  plain('    service: "api",'),
  plain('    environment: "production",'),
  highlight ? hl("    rampPercent: ", "25") : plain("    rampPercent: 25"),
  plain("  },"),
  plain('  actor: { principal: "llm", sessionId: "s-7e2…" },'),
  plain('  taint: "UNTRUSTED",'),
  plain('  nonce: "01HVT…",'),
  hl("  intentHash: ", `"${H2}"`),
  plain("}"),
];

// ── Audit shapes ──────────────────────────────────────────────────────

const auditPlaceholder: readonly JsonSegment[] = [plain("audit: —")];

const auditRecord: readonly JsonSegment[] = [
  plain("{"),
  plain("  version: 3,"),
  hl("  intentHash: ", `"${H1}"`, ","),
  plain("  envelope: { …original above… },"),
  hl("  decision: { kind: ", '"REWRITE"', ", … },"),
  plain("  decision_basis: ["),
  plain('    { category: "business",'),
  plain('      code: "QUANTITY_CAPPED",'),
  plain("      details: { requested: 100, cappedTo: 25 } }"),
  plain("  ],"),
  plain('  at: "2026-05-15T11:32:08Z",'),
  plain("  durationMs: 0.42"),
  plain("}"),
];

// ── The four beats ────────────────────────────────────────────────────

export const MECHANISM_BEATS: readonly MechanismBeat[] = [
  {
    index: 0,
    headline: "An envelope arrives at the kernel.",
    body:
      "The agent proposes a deployment. Every field is hashed — including nonce, the idempotency key.",
    cards: {
      envelopeIn: {
        id: "envelopeIn",
        label: "envelope · proposed",
        tint: "neutral",
        segments: envelopeInProposed(true),
        active: true,
        opacity: "full",
      },
      decision: {
        id: "decision",
        label: "decision",
        tint: "rewrite",
        segments: decisionPlaceholder,
        active: false,
        opacity: "background",
      },
      envelopeOut: {
        id: "envelopeOut",
        label: "envelope · rewritten",
        tint: "rewrite",
        segments: envelopeOutPlaceholder,
        active: false,
        opacity: "background",
      },
      audit: {
        id: "audit",
        label: "auditRecord",
        tint: "audit",
        segments: auditPlaceholder,
        active: false,
        opacity: "background",
      },
    },
  },
  {
    index: 1,
    headline: "A guard returns REWRITE.",
    body:
      "REWRITE is one of six structured outcomes. It carries a replacement envelope and a reason.",
    cards: {
      envelopeIn: {
        id: "envelopeIn",
        label: "envelope · proposed",
        tint: "neutral",
        segments: envelopeInProposed(false),
        active: false,
        opacity: "referenced",
      },
      decision: {
        id: "decision",
        label: "decision",
        tint: "rewrite",
        segments: decisionRewrite,
        active: true,
        opacity: "full",
      },
      envelopeOut: {
        id: "envelopeOut",
        label: "envelope · rewritten",
        tint: "rewrite",
        segments: envelopeOutPlaceholder,
        active: false,
        opacity: "background",
      },
      audit: {
        id: "audit",
        label: "auditRecord",
        tint: "audit",
        segments: auditPlaceholder,
        active: false,
        opacity: "background",
      },
    },
  },
  {
    index: 2,
    headline: "Payload mutated, hash recomputed.",
    body:
      "The original envelope is untouched. The replacement is a complete new object — same shape, new fields, new intentHash.",
    cards: {
      envelopeIn: {
        id: "envelopeIn",
        label: "envelope · proposed",
        tint: "neutral",
        segments: envelopeInProposed(false),
        active: false,
        opacity: "referenced",
      },
      decision: {
        id: "decision",
        label: "decision",
        tint: "rewrite",
        segments: decisionRewrite,
        active: false,
        opacity: "referenced",
      },
      envelopeOut: {
        id: "envelopeOut",
        label: "envelope · rewritten",
        tint: "rewrite",
        segments: envelopeOutRewritten(true),
        active: true,
        opacity: "full",
      },
      audit: {
        id: "audit",
        label: "auditRecord",
        tint: "audit",
        segments: auditPlaceholder,
        active: false,
        opacity: "background",
      },
    },
  },
  {
    index: 3,
    headline: "The audit captures both.",
    body:
      "Executor runs against the rewritten envelope. The audit record preserves the original, the decision, the basis, and the intentHash of what actually ran.",
    cards: {
      envelopeIn: {
        id: "envelopeIn",
        label: "envelope · proposed",
        tint: "neutral",
        segments: envelopeInProposed(false),
        active: false,
        opacity: "referenced",
      },
      decision: {
        id: "decision",
        label: "decision",
        tint: "rewrite",
        segments: decisionRewrite,
        active: false,
        opacity: "referenced",
      },
      envelopeOut: {
        id: "envelopeOut",
        label: "envelope · rewritten",
        tint: "rewrite",
        segments: envelopeOutRewritten(false),
        active: false,
        opacity: "referenced",
      },
      audit: {
        id: "audit",
        label: "auditRecord",
        tint: "audit",
        segments: auditRecord,
        active: true,
        opacity: "full",
      },
    },
  },
];

/**
 * Strip copy for the 6-outcome comparison row beneath the hero exhibit.
 * British spelling matches the rest of apps/web ("sanitised", "normalised").
 * Each line ≤ 60 chars to fit a single line at 11px in the strip cell.
 */
export const STRIP_COPY: Record<DecisionKind, string> = {
  EXECUTE: "Run the proposed action as-is.",
  REFUSE: "Block with a typed, machine-readable reason.",
  REWRITE: "Substitute a sanitised, capped, or normalised envelope.",
  DEFER: "Park until an external signal arrives.",
  ESCALATE: "Route to a human or supervisor.",
  REQUEST_CONFIRMATION: "Ask the caller to re-confirm before proceeding.",
};
