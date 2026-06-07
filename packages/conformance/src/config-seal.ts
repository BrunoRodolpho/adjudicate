/**
 * Configuration Integrity Seal (ADR-121).
 *
 * `computePackFingerprint` (ADR-115) pins only the declarative subset and
 * cannot hash policy/planner *function bodies*. The seal pins a *richer*
 * introspectable surface — declarative subset + guard metadata descriptions
 * (via `describePolicyBundle`) + the probed taint minimums for each declared
 * intent + basis codes — under an ed25519/RSA-PSS signature, and lets the
 * adapter verify at runtime that the installed config has not drifted.
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

/** Pure: extract the order-stable sealable surface from a Pack. */
export function extractSealableSurface(pack: SealablePackInput): SealableSurface {
  const taintMinimums = [...pack.intents]
    .sort()
    .map((kind) => ({ kind, minimum: pack.policy.taint.minimumFor(kind) }));
  return {
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents].sort(),
    signals: pack.signals ? [...pack.signals].sort() : [],
    basisCodes: pack.basisCodes ? [...pack.basisCodes].sort() : [],
    policyStructure: describePolicyBundle(pack.policy),
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

export function verifyConfigSeal(
  pack: SealablePackInput,
  seal: ConfigSeal,
  options: { readonly publicKeyPem?: string; readonly policy?: ConfigSealPolicy } = {},
): ConfigSealReport {
  const policy = options.policy ?? "require_digest";
  const computedDigest = computeConfigDigest(extractSealableSurface(pack));
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
