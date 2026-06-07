/**
 * ILLUSTRATIVE sample data for the public PII transparency view — NOT live
 * production numbers. `apps/web` is a public, unauthenticated surface with no
 * database credentials, so its transparency pages render from this committed
 * fixture rather than from real governance results. The shape mirrors what a
 * real (authenticated) projection would produce: aggregate counts per
 * (sensitivity × disposition), with the public cohort floor applied at render
 * time. The spread below deliberately includes a small cohort (< 5) so the
 * floor / "<5" censoring is exercised on the page.
 */

/** Closed-enum sensitivity class for a PII aggregate row. */
export type PiiSensitivityLevel = "low" | "medium" | "high" | "critical";

/** Closed-enum disposition: how the sensitive field was handled. */
export type PiiDisposition = "redacted" | "blocked";

/** A single aggregate row: count of PII handlings for a (sensitivity, disposition). */
export interface PiiTransparencyRow {
  readonly sensitivityLevel: PiiSensitivityLevel;
  readonly disposition: PiiDisposition;
  readonly count: number;
}

/**
 * Illustrative PII aggregate sample. Realistic spread across sensitivity classes
 * and dispositions; `critical` × `redacted` is a small cohort (count 3) to
 * exercise the small-cohort floor on the public page.
 */
export const PII_TRANSPARENCY_SAMPLE: readonly PiiTransparencyRow[] = [
  { sensitivityLevel: "low", disposition: "redacted", count: 1842 },
  { sensitivityLevel: "low", disposition: "blocked", count: 7 },
  { sensitivityLevel: "medium", disposition: "redacted", count: 936 },
  { sensitivityLevel: "medium", disposition: "blocked", count: 58 },
  { sensitivityLevel: "high", disposition: "redacted", count: 214 },
  { sensitivityLevel: "high", disposition: "blocked", count: 41 },
  { sensitivityLevel: "critical", disposition: "redacted", count: 3 },
  { sensitivityLevel: "critical", disposition: "blocked", count: 29 },
];

// ─── AI-BOM transparency (ADR-130) ──────────────────────────────────────────

/** A model reference in an illustrative AI-BOM. */
export interface AiBomSampleModel {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
}

/** A declared tool reference — names/digests only, never invocations. */
export interface AiBomSampleTool {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly schemaDigest?: string;
}

/** A retrieval/vector-store reference — store identity only, never contents. */
export interface AiBomSampleRag {
  readonly name: string;
  readonly kind?: string;
  readonly version?: string;
  readonly embeddingModel?: string;
}

/** A declared prompt-template hash — a hash, never the template text. */
export interface AiBomSamplePromptHash {
  readonly id: string;
  readonly sha256: string;
}

/**
 * One ILLUSTRATIVE AI Bill-of-Materials for a reference pack. The shape mirrors
 * the producer's `AiBom` (ADR-127) but is committed sample data, NOT a live
 * generated BOM. Every field here is non-sensitive by design — hashes and
 * component references, never contents (no raw prompts, no retrieved documents,
 * no tool invocations, no signature value). It deliberately omits the live
 * `signature` object: the public view advertises `signed: false` honestly.
 */
export interface AiBomTransparencySample {
  readonly bomVersion: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly contract: string;
  readonly kernelMinVersion: string;
  readonly fingerprint: string;
  readonly model?: AiBomSampleModel;
  readonly intents: readonly string[];
  readonly signals: readonly string[];
  readonly basisCodes: readonly string[];
  readonly tools: readonly AiBomSampleTool[];
  readonly rag: readonly AiBomSampleRag[];
  readonly promptHashes: readonly AiBomSamplePromptHash[];
  readonly guardrails: readonly { basisCode: string; category: string }[];
  readonly conformance: {
    readonly passed: boolean;
    readonly total: number;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly reportDigest: string;
  };
  readonly healthTier: string;
  readonly healthScore: { readonly score: number; readonly maxScore: number };
  readonly frameworks: readonly string[];
  readonly bomDigest: string;
  readonly generatedAt: string;
}

/**
 * Illustrative AI-BOMs for the shipped reference packs. Faithful in shape to a
 * real generated BOM (ADR-127), but committed sample data — `apps/web` is a
 * public surface with no kernel runtime, so it renders these rather than
 * generating live. SHA-256 values are illustrative 64-hex placeholders.
 */
export const AI_BOM_TRANSPARENCY_SAMPLE: readonly AiBomTransparencySample[] = [
  {
    bomVersion: "1.0",
    packId: "pack-payments-pix",
    packVersion: "1.0.0",
    contract: "v0",
    kernelMinVersion: ">=1 <2",
    fingerprint:
      "9f1c4a2b7d3e6f08a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778",
    model: { provider: "anthropic", model: "claude-sonnet", modelVersion: "2026-05" },
    intents: ["pix.charge.create", "pix.charge.refund"],
    signals: ["amount_centavos", "counterparty_doc"],
    basisCodes: ["pix.limit.exceeded", "pix.recipient.blocked"],
    tools: [
      {
        name: "pix.charge.create",
        description: "Create a PIX charge",
        version: "1.0.0",
        schemaDigest:
          "aa01bb02cc03dd04ee05ff060718293a4b5c6d7e8f9011223344556677889900",
      },
      {
        name: "pix.charge.refund",
        description: "Refund a settled PIX charge",
        version: "1.0.0",
      },
    ],
    rag: [
      { name: "pix-policy-kb", kind: "vector", version: "2026.05", embeddingModel: "text-embedding-3-large" },
    ],
    promptHashes: [
      { id: "system", sha256: "11" + "0".repeat(62) },
      { id: "refund-confirmation", sha256: "22" + "0".repeat(62) },
    ],
    guardrails: [
      { basisCode: "pix.limit.exceeded", category: "pix" },
      { basisCode: "pix.recipient.blocked", category: "pix" },
    ],
    conformance: {
      passed: true,
      total: 6,
      passedCount: 6,
      failedCount: 0,
      reportDigest: "cc" + "0".repeat(62),
    },
    healthTier: "gold",
    healthScore: { score: 6, maxScore: 6 },
    frameworks: ["eu-ai-act", "nist-ai-rmf"],
    bomDigest: "dd" + "0".repeat(62),
    generatedAt: "2026-06-06T00:00:00.000Z",
  },
  {
    bomVersion: "1.0",
    packId: "pack-identity-kyc",
    packVersion: "2.1.0",
    contract: "v0",
    kernelMinVersion: ">=1 <2",
    fingerprint:
      "1a2b3c4d5e6f70819203a4b5c6d7e8f90112233445566778899aabbccddeeff00",
    model: { provider: "anthropic", model: "claude-opus", modelVersion: "2026-05" },
    intents: ["kyc.session.start", "kyc.document.verify", "kyc.session.approve"],
    signals: ["document_type", "risk_score"],
    basisCodes: ["kyc.document.invalid", "kyc.risk.high"],
    tools: [
      { name: "kyc.document.verify", description: "Verify an identity document", version: "2.1.0" },
    ],
    rag: [],
    promptHashes: [{ id: "system", sha256: "33" + "0".repeat(62) }],
    guardrails: [
      { basisCode: "kyc.document.invalid", category: "kyc" },
      { basisCode: "kyc.risk.high", category: "kyc" },
    ],
    conformance: {
      passed: true,
      total: 5,
      passedCount: 5,
      failedCount: 0,
      reportDigest: "ee" + "0".repeat(62),
    },
    healthTier: "silver",
    healthScore: { score: 5, maxScore: 6 },
    frameworks: ["eu-ai-act", "nist-ai-rmf"],
    bomDigest: "ff" + "0".repeat(62),
    generatedAt: "2026-06-06T00:00:00.000Z",
  },
];

// ─── Configuration integrity transparency (ADR-131) ──────────────────────────

/**
 * Kill-switch stability class — closed enum, byte-equal to `@adjudicate/audit`'s
 * `KillSwitchStabilityClass` and admin-sdk's `KillSwitchStabilityClassSchema`.
 */
export type KillSwitchStabilityClass =
  | "stable"
  | "single_incident"
  | "recurring_incidents"
  | "storm";

/**
 * ILLUSTRATIVE per-pack seal status for the public integrity view. The PUBLIC
 * projection reads ONLY `verified` (a boolean) — never the digest, errors,
 * signature detail, or pack version, which are operator-only. `packId` is kept
 * here for fixture legibility but is intentionally NOT projected to the public
 * shape (which exposes only aggregate counts).
 */
export interface ConfigSealStatusSample {
  readonly packId: string;
  readonly verified: boolean;
}

/**
 * One ILLUSTRATIVE configuration-integrity sample for the public transparency
 * badge. `apps/web` is a public surface with no kernel runtime, so it renders
 * this committed fixture rather than live reports. It deliberately carries the
 * operator-only fields (digests/reasons/actors are NEVER present here at all)
 * collapsed to a boolean per pack plus a single closed stability class — the
 * public projection is an aggregate of exactly these.
 */
export interface ConfigIntegrityTransparencySample {
  readonly seals: readonly ConfigSealStatusSample[];
  readonly killSwitchStability: KillSwitchStabilityClass;
}

/**
 * Illustrative configuration-integrity sample for the shipped reference packs.
 * All seals verify and the kill switch is `stable` — the healthy posture a
 * reference deployment advertises publicly. Aggregates only; no digests,
 * reasons, or actors appear anywhere in this fixture.
 */
export const CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE: ConfigIntegrityTransparencySample =
  {
    seals: [
      { packId: "pack-payments-pix", verified: true },
      { packId: "pack-identity-kyc", verified: true },
      { packId: "pack-deployments-approval", verified: true },
      { packId: "pack-incident-response", verified: true },
      { packId: "pack-access-governance", verified: true },
    ],
    killSwitchStability: "stable",
  };

// ─── Behavioral drift transparency (ADR-132) ─────────────────────────────────

/**
 * Closed-enum drift dimension NAME — byte-equal to `@adjudicate/drift`'s
 * `DriftDimension` and admin-sdk's `DriftDimensionNameSchema`. The dimension
 * NAME is public vocabulary (`decision.kind` etc.); the public projection
 * exposes only the name of the top-drifting dimension, never any category VALUE.
 */
export type DriftDimensionName = "decision.kind" | "intent.kind" | "basis";

/**
 * ILLUSTRATIVE per-dimension drift roll-up for the public drift view. Carries
 * only the closed dimension NAME, its TVD, and its alert count — never the
 * baseline/recent category maps (operator-only). The public projection reads
 * these to compute one banded status; it never publishes a raw TVD number or a
 * category value.
 */
export interface DriftTransparencyDimension {
  readonly dimension: DriftDimensionName;
  readonly tvd: number;
  readonly alertCount: number;
}

/**
 * One ILLUSTRATIVE behavioral-drift sample for the public transparency status.
 * `apps/web` is a public surface with no kernel runtime, so it renders this
 * committed fixture rather than a live detector snapshot. The operator console
 * shows full per-dimension category maps + a TVD timeline; this fixture carries
 * only the closed dimension names + TVD/alert roll-ups + a threshold, which the
 * aggregate-only projection collapses into a banded status.
 */
export interface DriftTransparencySample {
  /** TVD/proportion threshold above which a dimension is alerting. */
  readonly alertThreshold: number;
  readonly dimensions: readonly DriftTransparencyDimension[];
}

/**
 * Illustrative behavioral-drift sample for the reference deployment. One
 * dimension is mildly elevated (a single alert just over threshold) so the
 * public status renders the "elevated" band with a top dimension — the healthy
 * "watch it" posture, not a crisis. Aggregates only; no category values appear.
 */
export const DRIFT_TRANSPARENCY_SAMPLE: DriftTransparencySample = {
  alertThreshold: 0.25,
  dimensions: [
    { dimension: "decision.kind", tvd: 0.31, alertCount: 1 },
    { dimension: "intent.kind", tvd: 0.12, alertCount: 0 },
    { dimension: "basis", tvd: 0.04, alertCount: 0 },
  ],
};

// ─── Red-team defenses transparency (ADR-133) ────────────────────────────────

/**
 * ILLUSTRATIVE per-pack red-team defense roll-up for the public "Defenses" view.
 * The operator console shows the full adversarial report — per-scenario NAMES,
 * the firing `basisCodes`, decisions, raw escape payloads, and a per-vector
 * escape table — all of which telegraph attack construction or advertise a live
 * hole. NONE of that may reach apps/web.
 *
 * This fixture therefore carries ONLY two counts per pack: `total` (scenarios
 * exercised) and `defended` (scenarios the policy held against). The public
 * projection collapses these into `{ packId, total, defended, lastRunStatus }`
 * where `lastRunStatus` is the BOOLEAN clean/regressed band (defended === total
 * ? clean : regressed) — never a raw escaped/error count, never a vector, never
 * a scenario name or basis code. `apps/web` never imports the red-team report
 * shape and has no path to `results[]`. `displayName` is the public pack label.
 */
export interface RedTeamDefenseSample {
  readonly packId: string;
  readonly displayName: string;
  readonly total: number;
  readonly defended: number;
}

/**
 * Illustrative red-team defenses for the shipped reference packs. `apps/web` is
 * a public surface with no kernel runtime, so it renders this committed sample
 * rather than running the suite live. All packs are clean (defended === total) —
 * the healthy posture a reference deployment advertises — except the deployments
 * pack, which carries one synthetic regression so the public page exercises the
 * "Regressed" badge. Counts only; no scenario names, payloads, or basis codes
 * appear anywhere in this fixture.
 */
export const RED_TEAM_TRANSPARENCY_SAMPLE: readonly RedTeamDefenseSample[] = [
  { packId: "pack-payments-pix", displayName: "Payments · PIX", total: 36, defended: 36 },
  { packId: "pack-identity-kyc", displayName: "Identity · KYC", total: 30, defended: 30 },
  { packId: "pack-deployments-approval", displayName: "Deployments · Approval", total: 33, defended: 32 },
  { packId: "pack-incident-response", displayName: "Incident Response", total: 27, defended: 27 },
  { packId: "pack-access-governance", displayName: "Access Governance", total: 30, defended: 30 },
];
