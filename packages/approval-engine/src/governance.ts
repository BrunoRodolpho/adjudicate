/**
 * Approval governance primitives (ADR-143): quorum, escalation timing, and
 * approver attestation. All pure / dependency-light; the engine wires them in.
 */
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { ApprovalRequest } from "./registry.js";

// ── Quorum ───────────────────────────────────────────────────────────────────

export interface QuorumPolicy {
  /** Approvals required before the underlying confirm() runs. */
  readonly minApprovals: number;
  /** Count only distinct approver ids toward quorum. Default true. */
  readonly distinctApprovers?: boolean;
}

/** Whether the accumulated approvals satisfy the quorum policy. Pure. */
export function quorumMet(
  approvals: ReadonlyArray<{ readonly id: string }> | undefined,
  policy: QuorumPolicy,
): boolean {
  const list = approvals ?? [];
  const count = policy.distinctApprovers === false ? list.length : new Set(list.map((a) => a.id)).size;
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
