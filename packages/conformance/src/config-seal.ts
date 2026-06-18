/**
 * Configuration Integrity Seal (ADR-121, hardened by 081).
 *
 * `computePackFingerprint` (ADR-115) pins only the declarative subset and
 * cannot hash policy/planner *function bodies*. The seal pins a *richer*
 * introspectable surface — declarative subset + guard metadata descriptions
 * (via `describePolicyBundle`) + per-guard CODE-artifact digests (081:
 * closure-captured caps + predicate bodies surfaced via
 * `attachGuardCodeArtifact`) + the probed taint minimums for each declared
 * intent + basis codes — under an ed25519/RSA-PSS signature, and lets the
 * adapter verify at runtime that the installed config has not drifted.
 *
 * 081 closes Critique #27: previously a behavior-changing edit to a
 * closure-captured cap (e.g. `createRewriteGuard`'s
 * `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) left a byte-identical sealable
 * surface that verified clean, because the seal saw guard METADATA only. The
 * surface now binds guard CODE, so such an edit drives a digest mismatch.
 *
 * Pure functions: no I/O, clock, or RNG. Callers own PEM/key loading.
 */

import { createHash } from "node:crypto";
import type { PolicyBundleDescriptor, Taint } from "@adjudicate/core";
import { describePolicyBundle } from "@adjudicate/core";
import type { PolicyBundle } from "@adjudicate/core";
import { canonicalJson } from "./canonical-json.js";
import {
  signPackFingerprint,
  verifyPackSignature,
  type PackSignature,
  type PackSignatureAlgorithm,
} from "./pack-trust.js";

/**
 * One per-guard code-artifact digest, addressed by its position in the policy
 * structure (081). `phase` + `index` make the address order-stable and
 * collision-free across phases; `codeDigest` is `describePolicyBundle`'s
 * `sha256Canonical` over the guard's `GuardCodeArtifact`. Guards with no
 * artifact to pin are omitted (the list is sparse, not padded).
 */
export interface GuardCodeDigest {
  readonly phase: string;
  readonly index: number;
  readonly codeDigest: string;
}

/** The introspectable configuration surface a seal pins (superset of the fingerprint). */
export interface SealableSurface {
  readonly id: string;
  readonly version: string;
  readonly contract: string;
  readonly intents: ReadonlyArray<string>;
  readonly signals: ReadonlyArray<string>;
  readonly basisCodes: ReadonlyArray<string>;
  /** Per-phase guard metadata from describePolicyBundle (anonymous guards pinned too). */
  readonly policyStructure: PolicyBundleDescriptor;
  /**
   * Per-guard CODE-artifact digests (081). Binds the *executable* surface —
   * closure-captured caps + predicate bodies — that guard METADATA alone is
   * blind to. Threaded as a dedicated field (not left implicit inside
   * `policyStructure.codeDigest`) so the body-integrity coverage is a named,
   * first-class part of the digest and survives any descriptor-rendering layer
   * that might strip nested optional fields. Order-stable: phase order then
   * guard index.
   */
  readonly guardCodeDigests: ReadonlyArray<GuardCodeDigest>;
  /** Probed `taint.minimumFor(kind)` for each declared intent — captures system-only config. */
  readonly taintMinimums: ReadonlyArray<{ readonly kind: string; readonly minimum: Taint }>;
}

/** Minimal Pack shape the extractor needs (wider than PackFingerprintInput). */
export interface SealablePackInput {
  readonly id: string;
  readonly version: string;
  readonly contract: string;
  readonly intents: ReadonlyArray<string>;
  readonly signals?: ReadonlyArray<string>;
  readonly basisCodes?: ReadonlyArray<string>;
  readonly policy: PolicyBundle<string, unknown, unknown>;
}

/**
 * Flatten the per-guard code digests out of a describe-bundle descriptor into
 * an order-stable list (081). Phase order is the descriptor's own (state →
 * taint → auth → business); guard index is positional within the phase. Guards
 * with no `codeDigest` are skipped, so the list is sparse — only guards that
 * exposed a `GuardCodeArtifact` (e.g. `createRewriteGuard`'s cap) contribute.
 */
function collectGuardCodeDigests(
  structure: PolicyBundleDescriptor,
): ReadonlyArray<GuardCodeDigest> {
  const out: GuardCodeDigest[] = [];
  for (const phase of structure.phases) {
    phase.guards.forEach((guard, index) => {
      if (guard.codeDigest !== undefined) {
        out.push({ phase: phase.phase, index, codeDigest: guard.codeDigest });
      }
    });
  }
  return out;
}

/** Pure: extract the order-stable sealable surface from a Pack. */
export function extractSealableSurface(pack: SealablePackInput): SealableSurface {
  const taintMinimums = [...pack.intents]
    .sort()
    .map((kind) => ({ kind, minimum: pack.policy.taint.minimumFor(kind) }));
  const policyStructure = describePolicyBundle(pack.policy);
  return {
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents].sort(),
    signals: pack.signals ? [...pack.signals].sort() : [],
    basisCodes: pack.basisCodes ? [...pack.basisCodes].sort() : [],
    policyStructure,
    guardCodeDigests: collectGuardCodeDigests(policyStructure),
    taintMinimums,
  };
}

/** Pure: sha256 hex over canonical-JSON of the sealable surface. */
export function computeConfigDigest(surface: SealableSurface): string {
  return createHash("sha256")
    .update(canonicalJson(surface as unknown as Record<string, unknown>), "utf-8")
    .digest("hex");
}

export interface ConfigSeal {
  readonly schemaVersion: 1;
  /** sha256 hex of the sealable surface. */
  readonly digest: string;
  /** Optional signature over `digest` (reuses pack-trust signing). */
  readonly signature?: PackSignature;
  /** Pack id at seal time — fast operator-facing mismatch detection. */
  readonly packId: string;
  /** ISO date the seal was minted (informational; NOT part of the digest). */
  readonly sealedAt?: string;
}

export function sealPackConfig(
  pack: SealablePackInput,
  options: {
    readonly privateKeyPem?: string;
    readonly algorithm?: PackSignatureAlgorithm;
    readonly keyId?: string;
    readonly sealedAt?: string;
  } = {},
): ConfigSeal {
  const digest = computeConfigDigest(extractSealableSurface(pack));
  let signature: PackSignature | undefined;
  if (options.privateKeyPem !== undefined) {
    signature = signPackFingerprint({
      fingerprint: digest,
      privateKeyPem: options.privateKeyPem,
      algorithm: options.algorithm ?? "ed25519",
      keyId: options.keyId ?? "config-seal",
    });
  }
  return {
    schemaVersion: 1,
    digest,
    packId: pack.id,
    ...(signature ? { signature } : {}),
    ...(options.sealedAt !== undefined ? { sealedAt: options.sealedAt } : {}),
  };
}

export type ConfigSealPolicy = "require_digest" | "require_signature";

export interface ConfigSealReport {
  readonly verified: boolean;
  readonly digestMatch: "match" | "mismatch";
  readonly computedDigest: string;
  readonly expectedDigest: string;
  readonly signatureVerification:
    | { readonly verified: true }
    | { readonly verified: false; readonly reason: string }
    | { readonly verified: null; readonly reason: "not_supplied" | "not_required" };
  readonly errors: ReadonlyArray<string>;
}

/** Shared digest+signature verdict over an already-computed digest. */
function buildConfigSealReport(
  computedDigest: string,
  seal: ConfigSeal,
  options: { readonly publicKeyPem?: string; readonly policy?: ConfigSealPolicy },
): ConfigSealReport {
  const policy = options.policy ?? "require_digest";
  const errors: string[] = [];
  const digestMatch: "match" | "mismatch" =
    computedDigest === seal.digest ? "match" : "mismatch";
  if (digestMatch === "mismatch") {
    errors.push(`config digest mismatch: expected ${seal.digest}, got ${computedDigest}`);
  }

  let signatureVerification: ConfigSealReport["signatureVerification"];
  if (seal.signature !== undefined && options.publicKeyPem !== undefined) {
    const v = verifyPackSignature({
      fingerprint: seal.digest,
      signature: seal.signature,
      publicKeyPem: options.publicKeyPem,
    });
    signatureVerification = v;
    if (v.verified === false) errors.push(`config seal signature failed: ${v.reason}`);
  } else if (policy === "require_signature") {
    signatureVerification = { verified: null, reason: "not_supplied" };
    errors.push("config seal policy require_signature requires signature + publicKeyPem");
  } else {
    signatureVerification = { verified: null, reason: "not_required" };
  }

  return {
    verified: errors.length === 0,
    digestMatch,
    computedDigest,
    expectedDigest: seal.digest,
    signatureVerification,
    errors,
  };
}

/** Verify a seal by re-extracting + re-hashing the LIVE pack (catches drift). */
export function verifyConfigSeal(
  pack: SealablePackInput,
  seal: ConfigSeal,
  options: { readonly publicKeyPem?: string; readonly policy?: ConfigSealPolicy } = {},
): ConfigSealReport {
  return buildConfigSealReport(computeConfigDigest(extractSealableSurface(pack)), seal, options);
}

/**
 * Deep-freeze a sealable surface so a captured reference cannot be mutated in
 * place (ADR-137). Returns the same (now frozen) object.
 */
export function freezeSealableSurface(surface: SealableSurface): Readonly<SealableSurface> {
  const deepFreeze = (o: unknown): void => {
    if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    }
  };
  deepFreeze(surface);
  return surface;
}

/**
 * Verify a seal against an ALREADY-EXTRACTED (typically frozen) surface — the
 * 'frozen' re-verify cadence (ADR-137). Cheaper than re-extracting from the live
 * pack each turn; pair with `freezeSealableSurface` captured at construction.
 */
export function verifyConfigSealFrozen(
  frozen: Readonly<SealableSurface>,
  seal: ConfigSeal,
  options: { readonly publicKeyPem?: string; readonly policy?: ConfigSealPolicy } = {},
): ConfigSealReport {
  return buildConfigSealReport(computeConfigDigest(frozen), seal, options);
}
