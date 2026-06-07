/**
 * AI Bill-of-Materials generator (ADR-127).
 *
 * A pure function that composes the existing fingerprint + conformance + health
 * primitives into a machine-readable manifest of a Pack deployment's AI
 * components — aligned with EU AI Act (Art. 11 technical documentation) and NIST
 * AI RMF framing. No I/O, no clock: `generatedAt` and any signature are
 * caller-supplied so the function stays deterministic and the `bomDigest`
 * (computed over everything EXCEPT `generatedAt` + `signature`) is reproducible.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { computePackFingerprint, type PackFingerprintInput, type PackSignature } from "./pack-trust.js";
import type { PackManifest } from "./manifest.js";
import type { ConformanceReport } from "./types.js";
import type { PackHealthReport, PackHealthTier } from "./pack-health.js";

export type AiBomVersion = "1.0";
export type AiBomFramework = "eu-ai-act" | "nist-ai-rmf";

export interface AiBomModelRef {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
}
export interface AiBomPromptHash {
  readonly id: string;
  readonly sha256: string;
}
export interface AiBomToolRef {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly schemaDigest?: string;
}
export interface AiBomRagRef {
  readonly name: string;
  readonly kind?: string;
  readonly version?: string;
  readonly embeddingModel?: string;
}
export interface AiBomGuardrail {
  readonly basisCode: string;
  readonly category: string;
}

export interface AiBom {
  readonly bomVersion: AiBomVersion;
  readonly packId: string;
  readonly packVersion: string;
  readonly contract: string;
  readonly kernelMinVersion: string;
  readonly kernelVersion?: string;
  readonly fingerprint: string;
  readonly model?: AiBomModelRef;
  readonly intents: ReadonlyArray<string>;
  readonly signals: ReadonlyArray<string>;
  readonly basisCodes: ReadonlyArray<string>;
  readonly tools: ReadonlyArray<AiBomToolRef>;
  readonly rag: ReadonlyArray<AiBomRagRef>;
  readonly promptHashes: ReadonlyArray<AiBomPromptHash>;
  readonly guardrails: ReadonlyArray<AiBomGuardrail>;
  readonly conformance: {
    readonly passed: boolean;
    readonly total: number;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly reportDigest: string;
  };
  readonly healthTier: PackHealthTier;
  readonly healthScore: { readonly score: number; readonly maxScore: number };
  readonly frameworks: ReadonlyArray<AiBomFramework>;
  readonly bomDigest: string;
  readonly generatedAt: string;
  readonly signature?: PackSignature;
}

export interface GenerateAiBomInputs {
  readonly pack: PackFingerprintInput;
  readonly manifest: PackManifest;
  readonly conformance: ConformanceReport;
  readonly health: PackHealthReport;
  readonly generatedAt: string;
  readonly kernelVersion?: string;
  readonly model?: AiBomModelRef;
  readonly promptHashes?: ReadonlyArray<AiBomPromptHash>;
  readonly tools?: ReadonlyArray<AiBomToolRef>;
  readonly rag?: ReadonlyArray<AiBomRagRef>;
  readonly frameworks?: ReadonlyArray<AiBomFramework>;
  readonly signature?: PackSignature;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

/** Pure: the canonical subset used for `bomDigest` (excludes generatedAt + signature). */
export function computeBomDigest(
  bomCore: Omit<AiBom, "bomDigest" | "generatedAt" | "signature">,
): string {
  return sha256(canonicalJson(bomCore as unknown as Record<string, unknown>));
}

export function generateAiBom(inputs: GenerateAiBomInputs): AiBom {
  const { pack, manifest, conformance, health } = inputs;
  const intents = [...pack.intents].sort();
  const signals = pack.signals ? [...pack.signals].sort() : [];
  const basisCodes = pack.basisCodes ? [...pack.basisCodes].sort() : [];
  const guardrails: AiBomGuardrail[] = basisCodes.map((code) => ({
    basisCode: code,
    category: code.split(".")[0] ?? "",
  }));
  const tools = (inputs.tools ?? intents.map((name) => ({ name })))
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Total-order comparators: equal keys MUST return 0, else the sort is not a
  // deterministic permutation for duplicate keys and the bomDigest stops being
  // reproducible (V8's sort is not guaranteed stable for an inconsistent
  // comparator). Mirror the `tools` comparator above.
  const rag = (inputs.rag ?? []).slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const promptHashes = (inputs.promptHashes ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const frameworks = inputs.frameworks ?? ["eu-ai-act", "nist-ai-rmf"];

  const core: Omit<AiBom, "bomDigest" | "generatedAt" | "signature"> = {
    bomVersion: "1.0",
    packId: pack.id,
    packVersion: pack.version,
    contract: pack.contract,
    kernelMinVersion: manifest.kernelMinVersion,
    ...(inputs.kernelVersion !== undefined ? { kernelVersion: inputs.kernelVersion } : {}),
    fingerprint: computePackFingerprint(pack),
    ...(inputs.model !== undefined ? { model: inputs.model } : {}),
    intents,
    signals,
    basisCodes,
    tools,
    rag,
    promptHashes,
    guardrails,
    conformance: {
      passed: conformance.passed,
      total: conformance.summary.total,
      passedCount: conformance.summary.passed,
      failedCount: conformance.summary.failed,
      reportDigest: sha256(canonicalJson(conformance.results as unknown as Record<string, unknown>)),
    },
    healthTier: health.tier,
    healthScore: { score: health.score, maxScore: health.maxScore },
    frameworks,
  };

  return {
    ...core,
    bomDigest: computeBomDigest(core),
    generatedAt: inputs.generatedAt,
    ...(inputs.signature !== undefined ? { signature: inputs.signature } : {}),
  };
}
