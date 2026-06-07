export type ApprovalErrorCode =
  | "UNKNOWN_TOKEN"
  | "ALREADY_RESOLVED"
  | "CHANNEL_FAILED"
  | "CONFIRM_REJECTED";

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}
