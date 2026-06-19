/**
 * Approval governance primitives (ADR-143): quorum, escalation timing, and
 * approver attestation. All pure / dependency-light; the engine wires them in.
 */
import {
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  capabilityPreimage,
  type Capability,
  type CapabilitySignature,
  type UnsignedCapability,
} from "@adjudicate/core";
import type { ApprovalRequest } from "./registry.js";

// ── Quorum ───────────────────────────────────────────────────────────────────

export interface QuorumPolicy {
  /** Approvals required before the underlying confirm() runs. */
  readonly minApprovals: number;
  /** Count only distinct approver ids toward quorum. Default true. */
  readonly distinctApprovers?: boolean;
}

/**
 * Whether the accumulated approvals satisfy the quorum policy. Pure.
 *
 * 072 — separation-of-duty: when a `proposerId` is supplied AND
 * `distinctApprovers` is in effect (the default), a vote cast by the PROPOSER
 * (the maker) is NOT counted toward `minApprovals` — a maker self-vote must not
 * advance the four-eyes quorum. The proposer id is deduped against the approver
 * set exactly as approver ids are deduped against each other. When
 * `distinctApprovers === false` (raw-vote counting), the proposer filter is also
 * applied so a self-vote never inflates a raw tally either. Omitting `proposerId`
 * is byte-identical to the pre-072 behavior.
 */
export function quorumMet(
  approvals: ReadonlyArray<{ readonly id: string }> | undefined,
  policy: QuorumPolicy,
  proposerId?: string,
): boolean {
  const list = approvals ?? [];
  const eligible =
    proposerId === undefined ? list : list.filter((a) => a.id !== proposerId);
  const count =
    policy.distinctApprovers === false
      ? eligible.length
      : new Set(eligible.map((a) => a.id)).size;
  return count >= policy.minApprovals;
}

// ── Escalation ───────────────────────────────────────────────────────────────

/**
 * Whether a pending request is past its escalation deadline at `nowMs`. The
 * actual re-route/reminder is adopter-driven (a scheduler polls this) — kept out
 * of the kernel and the decision path. Pure (parses the stored requestedAt).
 */
export function isEscalationDue(
  req: Pick<ApprovalRequest, "status" | "requestedAt" | "escalation">,
  nowMs: number,
): boolean {
  if (req.status !== "pending" || !req.escalation) return false;
  return nowMs - Date.parse(req.requestedAt) >= req.escalation.afterMs;
}

// ── Attestation ──────────────────────────────────────────────────────────────

export interface Attestation {
  readonly approverId: string;
  /** base64 signature over the canonical attestation message (see `attestationMessage`). */
  readonly signature: string;
}

export type AttestationVerifier = (input: {
  readonly approverId: string;
  readonly token: string;
  /** The outcome the approver is attesting to — bound into the signed message. */
  readonly accepted: boolean;
  /** The intent being approved — bound so a signature can't be moved to another request. */
  readonly intentHash: string;
  readonly signature: string;
}) => boolean;

/**
 * Canonical attestation pre-image. An approver signs THIS exact string. Binding
 * the outcome (`accept`/`decline`) AND the `intentHash` — not just the token —
 * is what makes the attestation authorize the actual decision: a signature an
 * approver produced intending to DECLINE cannot be replayed as an APPROVE (the
 * outcome differs), and a valid attestation for one request cannot be forwarded
 * to another (the intentHash differs). The token still scopes it to a single
 * single-use approval. Versioned so the format can evolve without ambiguity.
 */
export function attestationMessage(input: {
  readonly token: string;
  readonly accepted: boolean;
  readonly intentHash: string;
}): string {
  return `adjudicate-approval-attestation-v1\n${input.token}\n${input.accepted ? "approve" : "decline"}\n${input.intentHash}`;
}

/**
 * ed25519 attestation verifier: verifies the signature over the canonical
 * `attestationMessage` (token + outcome + intentHash) against the approver's
 * registered public key. Replaces the forgeable `resolvedBy` claim with
 * cryptographic non-repudiation of the actual decision. Returns false on any
 * unknown approver / malformed key / bad signature (fail-closed).
 */
export function createEd25519AttestationVerifier(
  publicKeyPemByApprover: Readonly<Record<string, string>>,
): AttestationVerifier {
  return ({ approverId, token, accepted, intentHash, signature }) => {
    const pem = publicKeyPemByApprover[approverId];
    if (!pem) return false;
    try {
      const key = createPublicKey(pem);
      const message = Buffer.from(attestationMessage({ token, accepted, intentHash }), "utf-8");
      return cryptoVerify(null, message, key, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  };
}

// ── Capability signer (021) ────────────────────────────────────────────────

/**
 * NODE-RESIDENT ed25519 capability signer (021 / §D shell-signs boundary).
 *
 * The §B topology arrow "on EXECUTE → mint signed CAPABILITY" runs in the
 * IMPURE shell, AFTER the pure decision — the kernel never signs (its
 * `KernelIdentity.attest` stub stays a throwing v0.2 seam; this plan does not
 * unstub it). `@adjudicate/core` holds only the pure-JS canonical
 * `capabilityPreimage` + constant-time hash-bind `verifyCapability`; the actual
 * asymmetric cryptography lives HERE because it needs `node:crypto`, exactly
 * mirroring `createEd25519AttestationVerifier`'s node-only boundary
 * (`governance.ts:5`). Importing this into a browser/client bundle would break
 * the build (`UnhandledSchemeError: node:crypto`) — keep it node-side.
 *
 * `signCapability` signs the SAME versioned canonical pre-image string that
 * `core.capabilityPreimage` produces (so an external verifier re-derives it
 * identically), producing a detached ed25519 signature, base64-encoded, in the
 * shared `{ keyId; alg; value }` slot (`alg: "ed25519"`).
 */
export function signCapability(input: {
  readonly body: UnsignedCapability;
  /** PEM-encoded ed25519 private key (pkcs8). */
  readonly privateKeyPem: string;
  /** Identifier of the signing key, recorded in the signature slot. */
  readonly keyId: string;
}): Capability {
  const message = Buffer.from(capabilityPreimage(input.body), "utf-8");
  const value = cryptoSign(null, message, input.privateKeyPem).toString(
    "base64",
  );
  const signature: CapabilitySignature = {
    keyId: input.keyId,
    alg: "ed25519",
    value,
  };
  return { ...input.body, signature };
}

/**
 * Verify a capability's ASYMMETRIC ed25519 signature over its canonical
 * pre-image against a registered public key. The complement to
 * `core.verifyCapability` (which checks the pure-JS hash-bind leg): this is the
 * non-repudiation leg that needs the issuer's public key and `node:crypto`.
 *
 * Re-derives `capabilityPreimage(cap)` from the capability's OWN unsigned body
 * — so a signature minted for one `intentHash`/`kernelId` cannot be replayed on
 * another (the pre-image differs, §D #4) — and ed25519-verifies the carried
 * base64 `signature.value`. Fails CLOSED (returns false, never throws) on any
 * unknown key id / malformed key / non-ed25519 alg / bad or cross-intent
 * signature, mirroring `createEd25519AttestationVerifier`.
 */
export function verifyCapabilitySignature(
  cap: Capability,
  publicKeyPemByKeyId: Readonly<Record<string, string>>,
): boolean {
  if (cap.signature.alg !== "ed25519") return false;
  const pem = publicKeyPemByKeyId[cap.signature.keyId];
  if (!pem) return false;
  try {
    const key = createPublicKey(pem);
    const message = Buffer.from(
      capabilityPreimage({
        intentHash: cap.intentHash,
        kernelId: cap.kernelId,
      }),
      "utf-8",
    );
    return cryptoVerify(
      null,
      message,
      key,
      Buffer.from(cap.signature.value, "base64"),
    );
  } catch {
    return false;
  }
}
