/**
 * Error taxonomy for `@adjudicate/anthropic`.
 *
 * Most failures inside the agent loop become `is_error: true` tool_results
 * surfaced back to the LLM (so the model can recover gracefully). Errors
 * thrown out of the adapter are reserved for adopter-visible misconfiguration
 * or contract violations.
 */

export const AnthropicAdapterErrorCode = {
  OUT_OF_PLAN_TOOL_USE: "OUT_OF_PLAN_TOOL_USE",
  EXECUTOR_FAILED: "EXECUTOR_FAILED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MAX_ITERATIONS_EXCEEDED: "MAX_ITERATIONS_EXCEEDED",
  CONFIRMATION_TOKEN_INVALID: "CONFIRMATION_TOKEN_INVALID",
  RESUME_NO_PARKED: "RESUME_NO_PARKED",
} as const;

export type AnthropicAdapterErrorCode =
  (typeof AnthropicAdapterErrorCode)[keyof typeof AnthropicAdapterErrorCode];

export class AnthropicAdapterError extends Error {
  readonly code: AnthropicAdapterErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AnthropicAdapterErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AnthropicAdapterError";
    this.code = code;
    this.details = details;
  }
}
