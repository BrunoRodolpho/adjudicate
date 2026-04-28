import type { ToolSchema } from "@adjudicate/core/llm";

/**
 * Anthropic-format tool schemas the renderer surfaces to Claude.
 *
 * Names must match either:
 *   - `Plan.allowedIntents` (intent kinds — `pix.charge.*`), OR
 *   - `Plan.visibleReadTools` (read tool names from the planner)
 *
 * Schemas not advertised by the planner this turn are filtered out by
 * `createAnthropicPromptRenderer` before they reach the LLM.
 */
export const PIX_INTENT_TOOL_SCHEMAS: ReadonlyArray<ToolSchema> = [
  {
    name: "pix.charge.create",
    description:
      "Propose creating a new PIX charge. Result will be DEFERRED waiting on the bank's webhook confirmation.",
    input_schema: {
      type: "object",
      properties: {
        amountCentavos: {
          type: "integer",
          description: "Amount in centavos (R$ × 100, integer only).",
        },
        payerDocument: {
          type: "string",
          description: "Payer's CPF (11 digits) or CNPJ (14 digits), digits only.",
        },
        description: {
          type: "string",
          description: "Free-text description shown to the payer in their bank app.",
        },
      },
      required: ["amountCentavos", "payerDocument", "description"],
    },
  },
  {
    name: "pix.charge.refund",
    description:
      "Propose refunding a confirmed PIX charge (full or partial). The kernel may clamp the amount to the original charge, ask for confirmation above R$ 500, or escalate above R$ 1000.",
    input_schema: {
      type: "object",
      properties: {
        chargeId: {
          type: "string",
          description: "Charge id from a prior pix.charge.create.",
        },
        refundCentavos: {
          type: "integer",
          description: "Refund amount in centavos. May be clamped if it exceeds the original charge.",
        },
        reason: {
          type: "string",
          description: "Free-text reason for the refund.",
        },
      },
      required: ["chargeId", "refundCentavos", "reason"],
    },
  },
  {
    name: "list_pix_charges",
    description: "List all known PIX charges with status.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_pix_charge",
    description: "Get a single PIX charge by id.",
    input_schema: {
      type: "object",
      properties: {
        chargeId: { type: "string" },
      },
      required: ["chargeId"],
    },
  },
];
