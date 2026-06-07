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
