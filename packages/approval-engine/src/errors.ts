export type ApprovalErrorCode =
  | "UNKNOWN_TOKEN"
  | "ALREADY_RESOLVED"
  | "CHANNEL_FAILED"
  | "CONFIRM_REJECTED"
  | "ATTESTATION_INVALID"
  | "QUORUM_VOTER_REQUIRED"
  /**
   * 072 — separation-of-duty (four-eyes / maker-checker) violation: the resolving
   * approver is the same identity that proposed the intent (or maps to the agent
   * identity), so the request cannot be self-approved. Raised fail-closed: when
   * separation-of-duty enforcement is enabled and the approver identity cannot be
   * established as DISTINCT from the proposer, the resolve is rejected, never
   * approved (§C monotonicity, §D-6 fail-closed).
   */
  | "SELF_APPROVAL_FORBIDDEN";

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}
