import { z } from "zod";

/**
 * Pinned element schema for a tool reference (ADR-127 / ADR-130). Mirrors the
 * producer's `AiBomToolRef` from `@adjudicate/conformance`. Tightens the
 * previously-permissive `z.record(z.string(), z.unknown())` element — additive
 * narrowing within `bomVersion "1.0"` (the producer already only ever emits
 * these fields, so no wire bytes change). See ADR-130.
 */
export const AiBomToolRefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  schemaDigest: z.string().optional(),
});

export type AiBomToolRefParsed = z.infer<typeof AiBomToolRefSchema>;

/**
 * Pinned element schema for a retrieval/vector-store reference (ADR-127 /
 * ADR-130). Mirrors the producer's `AiBomRagRef`. Carries store *references*
 * (name/kind/version/embedding-model id) — never retrieved contents.
 */
export const AiBomRagRefSchema = z.object({
  name: z.string(),
  kind: z.string().optional(),
  version: z.string().optional(),
  embeddingModel: z.string().optional(),
});

export type AiBomRagRefParsed = z.infer<typeof AiBomRagRefSchema>;

/**
 * Wire schema for an AI-BOM (ADR-127). Mirrors `@adjudicate/conformance`'s
 * `AiBom`. As of ADR-130 the `tools`/`rag` element shapes are pinned to
 * `AiBomToolRefSchema`/`AiBomRagRefSchema` (previously permissive records) so
 * the wire contract matches the producer.
 */
export const AiBomSchema = z.object({
  bomVersion: z.string(),
  packId: z.string(),
  packVersion: z.string(),
  contract: z.string(),
  kernelMinVersion: z.string(),
  kernelVersion: z.string().optional(),
  fingerprint: z.string(),
  model: z.object({ provider: z.string(), model: z.string(), modelVersion: z.string().optional() }).optional(),
  intents: z.array(z.string()),
  signals: z.array(z.string()),
  basisCodes: z.array(z.string()),
  tools: z.array(AiBomToolRefSchema),
  rag: z.array(AiBomRagRefSchema),
  promptHashes: z.array(z.object({ id: z.string(), sha256: z.string() })),
  guardrails: z.array(z.object({ basisCode: z.string(), category: z.string() })),
  conformance: z.object({
    passed: z.boolean(),
    total: z.number(),
    passedCount: z.number(),
    failedCount: z.number(),
    reportDigest: z.string(),
  }),
  healthTier: z.string(),
  healthScore: z.object({ score: z.number(), maxScore: z.number() }),
  frameworks: z.array(z.string()),
  bomDigest: z.string(),
  generatedAt: z.string(),
  signature: z.object({ algorithm: z.string(), keyId: z.string(), value: z.string() }).optional(),
});

export type AiBomParsed = z.infer<typeof AiBomSchema>;

/**
 * Cheap list projection of an AI-BOM (ADR-130) for the Explorer's left rail.
 * Omits the heavy `promptHashes`/`tools`/`rag`/`guardrails` arrays so a
 * multi-pack list call stays small; the detail view lazy-loads the full
 * `AiBomSchema` via `pack.aiBomById`.
 *
 * `signed` is DERIVED from `signature` presence — the signature value is never
 * carried in a summary (or even surfaced by the list procedure).
 */
export const AiBomSummarySchema = z.object({
  packId: z.string(),
  packVersion: z.string(),
  bomVersion: z.string(),
  model: z
    .object({ provider: z.string(), model: z.string(), modelVersion: z.string().optional() })
    .optional(),
  healthTier: z.string(),
  healthScore: z.object({ score: z.number(), maxScore: z.number() }),
  conformance: z.object({
    passed: z.boolean(),
    passedCount: z.number(),
    total: z.number(),
  }),
  fingerprint: z.string(),
  bomDigest: z.string(),
  frameworks: z.array(z.string()),
  generatedAt: z.string(),
  /** Derived: `signature !== undefined`. The value itself is never exposed here. */
  signed: z.boolean(),
});

export type AiBomSummaryParsed = z.infer<typeof AiBomSummarySchema>;

/** Result of `pack.aiBomList` — one summary per wired Pack BOM (ADR-130). */
export const AiBomListResultSchema = z.object({
  boms: z.array(AiBomSummarySchema),
});

export type AiBomListResultParsed = z.infer<typeof AiBomListResultSchema>;

/**
 * Input for `pack.aiBomById` (ADR-130). `packVersion` is optional — omit to get
 * the latest/only wired version for the pack (deterministic semver-max pick,
 * `bomDigest` tiebreak; no wall-clock).
 */
export const AiBomByIdQuerySchema = z.object({
  packId: z.string(),
  packVersion: z.string().optional(),
});

export type AiBomByIdQueryParsed = z.infer<typeof AiBomByIdQuerySchema>;

/**
 * Project a full parsed AI-BOM down to its list summary (ADR-130). Pure;
 * `signed` is derived from `signature` presence and the value is dropped.
 */
export function toAiBomSummary(bom: AiBomParsed): AiBomSummaryParsed {
  return {
    packId: bom.packId,
    packVersion: bom.packVersion,
    bomVersion: bom.bomVersion,
    ...(bom.model ? { model: bom.model } : {}),
    healthTier: bom.healthTier,
    healthScore: bom.healthScore,
    conformance: {
      passed: bom.conformance.passed,
      passedCount: bom.conformance.passedCount,
      total: bom.conformance.total,
    },
    fingerprint: bom.fingerprint,
    bomDigest: bom.bomDigest,
    frameworks: bom.frameworks,
    generatedAt: bom.generatedAt,
    signed: bom.signature !== undefined,
  };
}

/**
 * Deterministically pick the "latest" BOM among same-packId matches (ADR-130):
 * highest `packVersion` by numeric-dotted semver-ish compare, ties broken by
 * `bomDigest` string order. No wall-clock — `generatedAt` is never consulted,
 * so the pick is reproducible across runs.
 */
export function pickLatestAiBom(matches: ReadonlyArray<AiBomParsed>): AiBomParsed {
  return [...matches].sort(compareForLatest)[0]!;
}

/** Sort comparator placing the "latest" BOM first. Total-order (equal → 0). */
function compareForLatest(a: AiBomParsed, b: AiBomParsed): number {
  const v = compareVersionDesc(a.packVersion, b.packVersion);
  if (v !== 0) return v;
  // Tiebreak on bomDigest (ascending) for a stable, clock-free ordering.
  if (a.bomDigest < b.bomDigest) return -1;
  if (a.bomDigest > b.bomDigest) return 1;
  return 0;
}

/** Compare two dotted-numeric version strings, HIGHEST first. */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = Number.parseInt(pa[i] ?? "0", 10);
    const nb = Number.parseInt(pb[i] ?? "0", 10);
    const aNum = Number.isNaN(na) ? -1 : na;
    const bNum = Number.isNaN(nb) ? -1 : nb;
    if (aNum !== bNum) return bNum - aNum; // descending
  }
  // Equal numeric segments → fall back to reverse string order for stability.
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}
