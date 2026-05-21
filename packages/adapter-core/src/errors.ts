/**
 * Error taxonomy for the provider-neutral adapter loop.
 *
 * Most failures inside the loop become `isError: true` tool-results
 * surfaced back to the model (so it can recover gracefully). Errors
 * thrown out of the adapter are reserved for adopter-visible
 * misconfiguration or contract violations.
 */

export const AdapterErrorCode = {
  OUT_OF_PLAN_TOOL_USE: "OUT_OF_PLAN_TOOL_USE",
  EXECUTOR_FAILED: "EXECUTOR_FAILED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MAX_ITERATIONS_EXCEEDED: "MAX_ITERATIONS_EXCEEDED",
  CONFIRMATION_TOKEN_INVALID: "CONFIRMATION_TOKEN_INVALID",
  RESUME_NO_PARKED: "RESUME_NO_PARKED",
} as const;

export type AdapterErrorCode =
  (typeof AdapterErrorCode)[keyof typeof AdapterErrorCode];

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AdapterErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.details = details;
  }
}
