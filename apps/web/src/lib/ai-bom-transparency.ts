/**
 * Public AI-BOM transparency projection (ADR-130, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. The AI-BOM is the one
 * governance artifact that is non-sensitive BY DESIGN — it is a manifest of
 * hashes and component *references*, never contents (no raw prompts, no
 * retrieved documents, no tool invocations, no tokens, no PII — see ADR-127 /
 * ADR-130 Security Analysis).
 *
 * `sanitizeBomForPublic` is an ALLOWLIST projection: it copies only the fields
 * explicitly named below. Any future additive BOM field is therefore EXCLUDED
 * by default until someone consciously adds it here with a "is this safe to
 * publish?" sign-off. This is the load-bearing safety property of the web
 * surface. In particular the live `signature` object is reduced to a
 * `signed: boolean` — the signature value/keyId/algorithm are never published.
 */

import type { AiBomTransparencySample } from "./transparency-fixtures";

/** A model reference safe for public display. */
export interface PublicAiBomModel {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
}

/** A tool reference safe for public display (names/digests only). */
export interface PublicAiBomTool {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly schemaDigest?: string;
}

/** A vector-store reference safe for public display (store identity only). */
export interface PublicAiBomRag {
  readonly name: string;
  readonly kind?: string;
  readonly version?: string;
  readonly embeddingModel?: string;
}

/** A prompt-template hash safe for public display (hash, never contents). */
export interface PublicAiBomPromptHash {
  readonly id: string;
  readonly sha256: string;
}

/**
 * The public, sanitized projection of an AI-BOM. This is an explicit allowlist
 * — only the fields named here ever reach the public page. `signed` replaces
 * the `signature` object; the value is dropped.
 */
export interface PublicAiBom {
  readonly bomVersion: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly contract: string;
  readonly kernelMinVersion: string;
  readonly fingerprint: string;
  readonly model?: PublicAiBomModel;
  readonly intents: readonly string[];
  readonly signals: readonly string[];
  readonly basisCodes: readonly string[];
  readonly tools: readonly PublicAiBomTool[];
  readonly rag: readonly PublicAiBomRag[];
  readonly promptHashes: readonly PublicAiBomPromptHash[];
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
  /** Derived from `signature` presence — the value is NEVER published. */
  readonly signed: boolean;
}

/**
 * Allowlist-project one BOM-shaped object into its public form. Accepts the
 * widest possible input (an arbitrary record) precisely so that any unknown /
 * future field is dropped rather than copied. The `signature` value (if any) is
 * collapsed to `signed: boolean`.
 *
 * Pure and deterministic; no clock/RNG/I/O.
 */
export function sanitizeBomForPublic(
  bom: Readonly<Record<string, unknown>>,
): PublicAiBom {
  const model = bom.model as AiBomTransparencySample["model"] | undefined;
  const tools = (bom.tools as AiBomTransparencySample["tools"] | undefined) ?? [];
  const rag = (bom.rag as AiBomTransparencySample["rag"] | undefined) ?? [];
  const promptHashes =
    (bom.promptHashes as AiBomTransparencySample["promptHashes"] | undefined) ??
    [];
  const guardrails =
    (bom.guardrails as AiBomTransparencySample["guardrails"] | undefined) ?? [];
  const conformance = bom.conformance as
    | AiBomTransparencySample["conformance"]
    | undefined;
  const healthScore = bom.healthScore as
    | AiBomTransparencySample["healthScore"]
    | undefined;

  return {
    bomVersion: String(bom.bomVersion ?? ""),
    packId: String(bom.packId ?? ""),
    packVersion: String(bom.packVersion ?? ""),
    contract: String(bom.contract ?? ""),
    kernelMinVersion: String(bom.kernelMinVersion ?? ""),
    fingerprint: String(bom.fingerprint ?? ""),
    ...(model
      ? {
          model: {
            provider: model.provider,
            model: model.model,
            ...(model.modelVersion ? { modelVersion: model.modelVersion } : {}),
          },
        }
      : {}),
    intents: [...((bom.intents as readonly string[] | undefined) ?? [])],
    signals: [...((bom.signals as readonly string[] | undefined) ?? [])],
    basisCodes: [...((bom.basisCodes as readonly string[] | undefined) ?? [])],
    tools: tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(t.version ? { version: t.version } : {}),
      ...(t.schemaDigest ? { schemaDigest: t.schemaDigest } : {}),
    })),
    rag: rag.map((r) => ({
      name: r.name,
      ...(r.kind ? { kind: r.kind } : {}),
      ...(r.version ? { version: r.version } : {}),
      ...(r.embeddingModel ? { embeddingModel: r.embeddingModel } : {}),
    })),
    promptHashes: promptHashes.map((p) => ({ id: p.id, sha256: p.sha256 })),
    guardrails: guardrails.map((g) => ({
      basisCode: g.basisCode,
      category: g.category,
    })),
    conformance: {
      passed: conformance?.passed ?? false,
      total: conformance?.total ?? 0,
      passedCount: conformance?.passedCount ?? 0,
      failedCount: conformance?.failedCount ?? 0,
      reportDigest: conformance?.reportDigest ?? "",
    },
    healthTier: String(bom.healthTier ?? ""),
    healthScore: {
      score: healthScore?.score ?? 0,
      maxScore: healthScore?.maxScore ?? 0,
    },
    frameworks: [...((bom.frameworks as readonly string[] | undefined) ?? [])],
    bomDigest: String(bom.bomDigest ?? ""),
    generatedAt: String(bom.generatedAt ?? ""),
    // Derived: the live `signature` object (if present) is collapsed to a
    // boolean. The value is never published.
    signed: bom.signature !== undefined && bom.signature !== null,
  };
}

/**
 * Project the committed illustrative reference BOMs into their public,
 * sanitized form, in declaration order. Pure and deterministic.
 */
export function projectAiBomTransparency(
  sample: ReadonlyArray<AiBomTransparencySample>,
): PublicAiBom[] {
  return sample.map((bom) =>
    sanitizeBomForPublic(bom as unknown as Record<string, unknown>),
  );
}
