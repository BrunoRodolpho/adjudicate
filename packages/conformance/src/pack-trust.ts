/**
 * Pack trust primitives — deterministic fingerprinting + signature
 * verification for installed Packs.
 *
 * # Why this exists
 *
 * The Pack ecosystem currently has:
 *   - manifest validation (`validatePackManifest`) — well-formed shape
 *   - runtime conformance (`runConformance`) — invariants pass
 *
 * Missing: a primitive answering "is THIS specific Pack object the same
 * one I signed off on?" Adopters running multi-tenant control planes,
 * security teams reviewing third-party Packs, and adopters running CI
 * gates that block unsigned Packs all need a canonical fingerprint.
 *
 * # Design
 *
 * `computePackFingerprint(pack)` produces `sha256(canonical-JSON of the
 * declarative subset)`. The "declarative subset" is the metadata that:
 *   - reviewers actually evaluate (id, version, contract, intents,
 *     signals, basisCodes), and
 *   - canonical-JSON can deterministically serialize (strings, arrays,
 *     primitives — no function references).
 *
 * Excluded: `policy`, `planner`, `handlers`. These hold function
 * references which canonical-JSON can't hash. The fingerprint pins
 * declared SURFACE, not behavior. Behavior verification is what
 * `runConformance()` is for.
 *
 * Two Packs with the same fingerprint declare the same intents, signals,
 * basisCodes, id, version, and contract. They may still implement them
 * differently — that's why conformance + fingerprint are complementary.
 *
 * # Signature scheme
 *
 * Signature verification uses Node's `node:crypto`. Ed25519 is the
 * recommended algorithm (RFC 8032, ~128-bit security, ~32-byte keys).
 * RSA-PSS is supported for environments without ed25519. Asymmetric
 * crypto is the only sensible choice — adopters distribute the public
 * key, signers hold the private key.
 *
 * The signature is over the fingerprint, NOT the raw Pack bytes. This
 * means a Pack author can re-build their Pack from source (different
 * file system layout, different bundler output) and still produce the
 * same signed fingerprint — the declarative surface is stable across
 * builds even when the function-implementation bytes drift.
 *
 * # Pure functions
 *
 * Every function in this module is pure: no I/O, no global state. The
 * CLI / install-hook wraps these with key-loading and file-reading.
 */

import { createHash, createPublicKey, createPrivateKey, sign, verify } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";

/**
 * Minimal Pack shape required for fingerprinting. Wider than PackV0 so
 * adopters who add `policyVersion` or `qualityTier` at the Pack level
 * (Phase 5 extensions) still fingerprint stably.
 */
export interface PackFingerprintInput {
  readonly id: string;
  readonly version: string;
  readonly contract: string;
  readonly intents: ReadonlyArray<string>;
  readonly signals?: ReadonlyArray<string>;
  readonly basisCodes?: ReadonlyArray<string>;
}

/** Supported asymmetric signature algorithms. */
export type PackSignatureAlgorithm = "ed25519" | "rsa-pss-sha256";

export interface PackSignature {
  readonly algorithm: PackSignatureAlgorithm;
  /** Public-key identifier (e.g., "ops@adjudicate.dev" or a fingerprint). */
  readonly keyId: string;
  /** Base64-encoded signature bytes over the Pack fingerprint. */
  readonly value: string;
}


/**
 * Compute the Pack's deterministic fingerprint. Returns 64-char lowercase
 * hex (sha256). Same input → same fingerprint, byte-for-byte.
 *
 * The fingerprint is computed over the DECLARATIVE subset
 * `(id, version, contract, intents, signals, basisCodes)` — the part of
 * a Pack that a security reviewer can read and reason about without
 * executing code. Behavioral verification (policy + planner) is what
 * `runConformance` is for.
 *
 * # Stability across builds
 *
 * Re-bundling the same Pack source produces the same fingerprint. The
 * function bodies in `policy` and `planner` are NOT inputs to the
 * fingerprint — they may legitimately differ across bundler outputs
 * (esbuild vs tsc) while still being the same Pack.
 */
export function computePackFingerprint(pack: PackFingerprintInput): string {
  const subset = {
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    intents: [...pack.intents].sort(),
    ...(pack.signals !== undefined
      ? { signals: [...pack.signals].sort() }
      : {}),
    ...(pack.basisCodes !== undefined
      ? { basisCodes: [...pack.basisCodes].sort() }
      : {}),
  };
  const canonical = canonicalJson(subset);
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/**
 * Sign a Pack fingerprint with an adopter-supplied private key. The
 * returned signature includes the algorithm and a caller-supplied keyId
 * so verifiers know which public key to use.
 *
 * `privateKeyPem` is the PEM-encoded private key. For ed25519 this is the
 * 32-byte key wrapped in PKCS#8; for RSA-PSS, the corresponding PKCS#8.
 *
 * Throws if the key shape doesn't match the requested algorithm. Adopters
 * managing a fleet of signing keys typically use a small helper to
 * route from `keyId` → PEM.
 */
export function signPackFingerprint(args: {
  readonly fingerprint: string;
  readonly privateKeyPem: string;
  readonly algorithm: PackSignatureAlgorithm;
  readonly keyId: string;
}): PackSignature {
  const key = createPrivateKey({ key: args.privateKeyPem, format: "pem" });
  const data = Buffer.from(args.fingerprint, "utf-8");
  let value: Buffer;
  switch (args.algorithm) {
    case "ed25519":
      value = sign(null, data, key);
      break;
    case "rsa-pss-sha256":
      value = sign("sha256", data, {
        key,
        padding: 6, // RSA_PKCS1_PSS_PADDING
        saltLength: 32,
      });
      break;
  }
  return {
    algorithm: args.algorithm,
    keyId: args.keyId,
    value: value.toString("base64"),
  };
}

/**
 * Verify a Pack signature against the fingerprint. Returns
 * `{ verified: true }` on success, `{ verified: false, reason }` on
 * failure. Pure — does not throw on bad signatures; throws only on
 * malformed PEM (a programmer error, not a verification failure).
 */
export type PackSignatureVerification =
  | { readonly verified: true }
  | {
      readonly verified: false;
      readonly reason:
        | "signature_mismatch"
        | "unsupported_algorithm"
        | "key_algorithm_mismatch";
    };

export function verifyPackSignature(args: {
  readonly fingerprint: string;
  readonly signature: PackSignature;
  readonly publicKeyPem: string;
}): PackSignatureVerification {
  let key;
  try {
    key = createPublicKey({ key: args.publicKeyPem, format: "pem" });
  } catch (err) {
    // Invalid PEM is a programmer error, not a verification result.
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`verifyPackSignature: invalid public key PEM (${e.message})`);
  }
  const data = Buffer.from(args.fingerprint, "utf-8");
  const sig = Buffer.from(args.signature.value, "base64");

  // Defensive: cross-algorithm misuse (signing with ed25519, verifying
  // with RSA) returns `false` from `verify`. We surface key/algorithm
  // mismatches as their own reason for operator clarity.
  const keyType = key.asymmetricKeyType;
  if (
    (args.signature.algorithm === "ed25519" && keyType !== "ed25519") ||
    (args.signature.algorithm === "rsa-pss-sha256" && keyType !== "rsa")
  ) {
    return { verified: false, reason: "key_algorithm_mismatch" };
  }

  let ok: boolean;
  switch (args.signature.algorithm) {
    case "ed25519":
      ok = verify(null, data, key, sig);
      break;
    case "rsa-pss-sha256":
      ok = verify(
        "sha256",
        data,
        {
          key,
          padding: 6, // RSA_PKCS1_PSS_PADDING
          saltLength: 32,
        },
        sig,
      );
      break;
    default:
      return { verified: false, reason: "unsupported_algorithm" };
  }
  return ok ? { verified: true } : { verified: false, reason: "signature_mismatch" };
}

// ── Composite verification ────────────────────────────────────────────────

export type TrustPolicy =
  | "require_signature"
  | "require_fingerprint"
  | "best_effort"
  | "none";

export interface VerifyPackTrustOptions {
  readonly pack: PackFingerprintInput;
  /** When supplied, the computed fingerprint MUST match this value. */
  readonly expectedFingerprint?: string;
  /** When supplied, the signature is verified against this public key. */
  readonly publicKeyPem?: string;
  /** When supplied, the signature is verified against the computed fingerprint. */
  readonly signature?: PackSignature;
  /**
   * Trust policy gates whether missing inputs are tolerated or flagged.
   *   - `none`            — no trust requirements; fingerprint is still computed.
   *   - `best_effort`     — verify anything supplied; missing is OK.
   *   - `require_fingerprint` — `expectedFingerprint` MUST be supplied and match.
   *   - `require_signature`   — `signature` + `publicKeyPem` MUST be supplied and verify.
   */
  readonly policy?: TrustPolicy;
}

export interface PackTrustReport {
  readonly fingerprint: string;
  /** True when nothing failed (no errors), modulo the trust policy. */
  readonly trusted: boolean;
  readonly errors: ReadonlyArray<string>;
  /** Per-axis results so operators can render granular diagnostics. */
  readonly fingerprintMatch?: "match" | "mismatch" | "not_checked";
  readonly signatureVerification?:
    | { verified: true }
    | { verified: false; reason: string }
    | { verified: null; reason: "not_supplied" };
}

/**
 * Composite trust evaluator. Combines fingerprint check + signature
 * check + trust-policy enforcement into one operator-readable report.
 *
 * # Typical wirings
 *
 *   - Local dev: `policy: "none"` — just compute the fingerprint.
 *   - CI gate:   `policy: "require_fingerprint"` with an expected hash
 *                committed to the repo. Detects unintended Pack drift.
 *   - Prod:      `policy: "require_signature"` with the publisher's
 *                public key trusted by the adopter's CA.
 */
export function verifyPackTrust(opts: VerifyPackTrustOptions): PackTrustReport {
  const policy = opts.policy ?? "best_effort";
  const fingerprint = computePackFingerprint(opts.pack);
  const errors: string[] = [];

  let fingerprintMatch: "match" | "mismatch" | "not_checked" = "not_checked";
  if (opts.expectedFingerprint !== undefined) {
    fingerprintMatch =
      opts.expectedFingerprint === fingerprint ? "match" : "mismatch";
    if (fingerprintMatch === "mismatch") {
      errors.push(
        `pack fingerprint mismatch: expected ${opts.expectedFingerprint}, got ${fingerprint}`,
      );
    }
  } else if (policy === "require_fingerprint") {
    errors.push(
      "trust policy require_fingerprint requires expectedFingerprint to be supplied",
    );
  }

  let signatureVerification: PackTrustReport["signatureVerification"];
  if (opts.signature !== undefined && opts.publicKeyPem !== undefined) {
    const v = verifyPackSignature({
      fingerprint,
      signature: opts.signature,
      publicKeyPem: opts.publicKeyPem,
    });
    signatureVerification = v;
    if (v.verified === false) {
      errors.push(`pack signature verification failed: ${v.reason}`);
    }
  } else if (policy === "require_signature") {
    signatureVerification = { verified: null, reason: "not_supplied" };
    errors.push(
      "trust policy require_signature requires both signature and publicKeyPem",
    );
  } else {
    signatureVerification = { verified: null, reason: "not_supplied" };
  }

  return {
    fingerprint,
    trusted: errors.length === 0,
    errors,
    fingerprintMatch,
    signatureVerification,
  };
}
