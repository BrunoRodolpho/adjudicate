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
  /** base64 signature over the approval token. */
  readonly signature: string;
}

export type AttestationVerifier = (input: {
  readonly approverId: string;
  readonly token: string;
  readonly signature: string;
}) => boolean;

/**
 * ed25519 attestation verifier: verifies the signature over the UTF-8 approval
 * token against the approver's registered public key. Replaces the forgeable
 * `resolvedBy` claim with cryptographic non-repudiation. Returns false on any
 * unknown approver / malformed key / bad signature (fail-closed).
 */
export function createEd25519AttestationVerifier(
  publicKeyPemByApprover: Readonly<Record<string, string>>,
): AttestationVerifier {
  return ({ approverId, token, signature }) => {
    const pem = publicKeyPemByApprover[approverId];
    if (!pem) return false;
    try {
      const key = createPublicKey(pem);
      return cryptoVerify(null, Buffer.from(token, "utf-8"), key, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  };
}
