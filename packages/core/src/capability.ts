/**
 * Capability — the kernel-authorized grant the impure shell mints on EXECUTE.
 *
 * Per the §B topology arrow "on EXECUTE → mint signed CAPABILITY", a
 * `Capability` is an immutable record describing a single kernel-minted grant:
 * it binds the authorizing `intentHash` (which already content-addresses
 * kind+payload+taint+nonce+actor+origin and excludes `createdAt`, §D #4), the
 * deciding kernel identity (`KernelIdentity.id`), and a signature slot shaped
 * IDENTICALLY to `AuditRecord.signature` (`{ keyId; alg; value }`, `audit.ts`)
 * so audit and capability share one signature shape.
 *
 * **This plan (021) ships only the schema + its canonical pre-image + the
 * pure-JS constant-time `verifyCapability`.** It does NOT wire a cap-gated
 * executor (that is plan 024), a burn store (022), resource-binding (023), or
 * expiry (025). No guard and no decision-path code consults a `Capability` in
 * 021 — minting/signing/verifying live in the IMPURE shell, AFTER the pure
 * decision (§D: "the kernel decides; the shell signs and persists"). The pure
 * `adjudicate()` is unchanged and never signs.
 *
 * **Signing mechanism — hash-bind pre-image, asymmetric signature.** The home
 * for the actual ed25519 cryptography is a NODE-resident package
 * (`@adjudicate/approval-engine`, mirroring the `governance.ts` `node:crypto`
 * boundary). `@adjudicate/core` carries only:
 *   - `capabilityPreimage` — a versioned canonical pre-image STRING built from
 *     the unsigned capability via `sha256Canonical` (@adjudicate/canonical, the
 *     NFC-normalizing, golden-vector-locked, invariant-#4-compatible encoder).
 *   - `verifyCapability` — a pure-JS constant-time check that the bytes carried
 *     by a capability are self-consistent (the value commits to the exact
 *     pre-image), compared with `timingSafeHexEqual` (never early-exit, never
 *     throws).
 * Core stays browser-bundleable: no `node:crypto`, no `Buffer`.
 */

import { sha256Canonical } from "./hash.js";
import { timingSafeHexEqual } from "./timing-safe.js";

/**
 * Versioned pre-image tag. The first line of every capability pre-image, in the
 * style of `attestationMessage` (`approval-engine/governance.ts`). Versioned so
 * the pre-image format can evolve without ambiguity — a v2 reader never
 * mis-parses a v1 pre-image, and a signature minted over v1 bytes can never be
 * presented against a v2 pre-image (the tag line differs, so the hash differs).
 */
export const CAPABILITY_PREIMAGE_VERSION = "adjudicate-capability-v1" as const;

/**
 * The cryptographic signature slot, shaped IDENTICALLY to
 * `AuditRecord.signature` (`audit.ts`) so audit and capability share one
 * signature shape:
 *   - `keyId` — identifier of the signing key (e.g. a KMS key alias).
 *   - `alg`   — the signature algorithm (e.g. `"ed25519"`).
 *   - `value` — the detached signature, base64-encoded.
 */
export interface CapabilitySignature {
  readonly keyId: string;
  readonly alg: string;
  readonly value: string;
}

/**
 * The signature-free core of a `Capability` — exactly the bytes the pre-image
 * commits to. A `Capability` is this plus a `signature` slot. Keeping the
 * unsigned shape its own type lets `capabilityPreimage` accept "the capability
 * without its signature" without the caller having to delete a field, and makes
 * it impossible to accidentally fold the signature into its own pre-image.
 */
export interface UnsignedCapability {
  /**
   * The authorizing intent's content-addressed hash. Binding THIS exact value
   * (which already binds kind+payload+taint+nonce+actor+origin and excludes
   * `createdAt`, §D #4) is what makes a capability non-detachable from its
   * authorizing intent and non-replayable across intents: a signature minted
   * for one intent re-derives a different pre-image (and so fails verify)
   * against any other intent.
   */
  readonly intentHash: string;
  /**
   * The id of the kernel identity whose decision authorized this grant
   * (`KernelIdentity.id`, e.g. `kernel://prod/us-east-1`). Descriptive — the
   * kernel never signs (its `attest` stub throws, reserved for v0.2); the
   * impure shell signs.
   */
  readonly kernelId: string;
}

/**
 * A kernel-minted, signed grant. Immutable. The signature is asymmetric
 * (ed25519, produced node-side); the pre-image it signs is a deterministic
 * canonical hash-bind over the unsigned capability, so the bytes replay
 * byte-identically (§D #5) and are golden-vector-locked.
 */
export interface Capability extends UnsignedCapability {
  readonly signature: CapabilitySignature;
}

/**
 * Build the versioned canonical pre-image STRING an issuer signs and a verifier
 * re-derives — in the style of `attestationMessage` (`governance.ts`): a
 * version tag line followed by the canonical-JSON SHA-256 of the UNSIGNED
 * capability.
 *
 * Deterministic and golden-vector-locked (§D #5): `sha256Canonical`
 * (@adjudicate/canonical) sorts keys, NFC-normalizes strings, and throws on
 * non-finite numbers, so the bytes are reproducible across Node and the browser
 * and across any conforming external (Rust/Go) re-implementation. Changing any
 * bound field — most importantly the `intentHash` — changes the pre-image; the
 * descriptive `createdAt`-style metadata the kernel emits elsewhere is NOT part
 * of the capability and so cannot drift the pre-image.
 *
 * Pure: no I/O, no clock, no `node:crypto`. Safe in the browser bundle.
 */
export function capabilityPreimage(cap: UnsignedCapability): string {
  // Hash-bind the unsigned capability with the SAME canonical encoder that
  // produces `intentHash` (invariant #4) — never the conformance fork. The
  // signature slot is deliberately absent from the pre-image (a value cannot
  // sign over itself), exactly as `AuditRecord.signature` is excluded from the
  // auditHash pre-image.
  const bodyHash = sha256Canonical({
    intentHash: cap.intentHash,
    kernelId: cap.kernelId,
  });
  return `${CAPABILITY_PREIMAGE_VERSION}\n${bodyHash}`;
}

/**
 * Verify that a capability's signature `value` is self-consistent with its
 * unsigned body via a constant-time compare of the re-derived pre-image hash
 * against the carried value — the pure-JS, browser-safe verification leg.
 *
 * This is NOT asymmetric signature verification (that requires `node:crypto`
 * and the issuer's public key, and lives in `@adjudicate/approval-engine`'s
 * `verifyCapabilitySignature`). It is the constant-time HASH-BIND check that
 * core can run anywhere: it recomputes `capabilityPreimage(cap)`, hashes it
 * with `sha256Canonical`, and compares with `timingSafeHexEqual` (never
 * early-exit, never throws). A tampered `intentHash`, `kernelId`, or
 * `signature.value` re-derives a different hash and fails. Returns `false` —
 * never throws — on any malformed input (non-object, missing fields, non-hex
 * value, length mismatch), so the verify path is fail-safe.
 *
 * The pre-image binding makes this the side-channel-safe, replay-safe gate the
 * cap-gated executor (024) composes ABOVE the asymmetric verify: even a valid
 * ed25519 signature for intent A cannot be re-presented for intent B, because
 * the bound `intentHash` differs and so the pre-image hash differs.
 */
export function verifyCapability(cap: unknown): boolean {
  if (cap === null || typeof cap !== "object") return false;
  const c = cap as Partial<Capability>;
  if (typeof c.intentHash !== "string" || typeof c.kernelId !== "string") {
    return false;
  }
  const sig = c.signature;
  if (
    sig === null ||
    typeof sig !== "object" ||
    typeof sig.value !== "string"
  ) {
    return false;
  }
  // Re-derive the pre-image from the (validated) unsigned body and hash it.
  // `capabilityPreimage` only reads `intentHash`/`kernelId`, both confirmed
  // strings above, so it cannot throw here.
  const expected = sha256Canonical(
    capabilityPreimage({ intentHash: c.intentHash, kernelId: c.kernelId }),
  );
  // Constant-time: `timingSafeHexEqual` runs the full length regardless of
  // where the strings first differ and returns false (never throws) on length
  // mismatch / non-string — closing the digit-by-digit forgery oracle.
  return timingSafeHexEqual(sig.value, expected);
}

/**
 * Mint the pure-JS, hash-bind capability whose `signature.value` is the
 * `sha256Canonical` of its own pre-image. This is the BROWSER-SAFE binding leg
 * that `verifyCapability` checks; the ASYMMETRIC (ed25519) signer lives in
 * `@adjudicate/approval-engine` (`signCapability`, node-only) and overwrites
 * `signature.value` with a detached ed25519 signature over the SAME pre-image.
 *
 * Exposed so callers (and tests) can construct a verifiable hash-bound
 * capability without reaching for the node signer when asymmetric
 * non-repudiation is not required. Pure; never throws on well-typed input.
 */
export function bindCapability(
  body: UnsignedCapability,
  keyId: string,
  alg = "sha256-hashbind",
): Capability {
  const value = sha256Canonical(capabilityPreimage(body));
  return { ...body, signature: { keyId, alg, value } };
}
