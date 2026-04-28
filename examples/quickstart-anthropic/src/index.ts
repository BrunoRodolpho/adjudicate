/**
 * Quickstart entry point. Runs the scripted 6-turn transcript against
 * Claude (live API) with the @adjudicate/anthropic adapter wired to the
 * @adjudicate/pack-payments-pix Pack.
 *
 * Each turn prints a banner with the expected Decision, the user message,
 * Claude's tool_use proposal, the kernel's actual Decision, the executor's
 * effect, and the agent's outcome. After all turns run, the script prints
 * a summary and exits non-zero if any of the six Decisions was missed.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  installPack,
  type Decision,
  type DecisionKind,
} from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createAnthropicPromptRenderer,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  type AgentEvent,
  type AgentTurnResult,
} from "@adjudicate/anthropic";
import {
  paymentsPixPack,
  type PixIntentKind,
  type PixState,
  type PixContext,
} from "@adjudicate/pack-payments-pix";
import { createPixExecutor } from "./executor.js";
import { PIX_INTENT_TOOL_SCHEMAS } from "./tool-schemas.js";
import { DEMO_BASE_PROMPT, TRANSCRIPT, type ExpectedDecision } from "./transcript.js";

const REQUIRED_DECISIONS: ReadonlyArray<DecisionKind> = [
  "EXECUTE",
  "REFUSE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "ESCALATE",
  "DEFER",
];

function banner(text: string): void {
  const line = "─".repeat(72);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

function summarizeEvents(events: ReadonlyArray<AgentEvent>): Set<DecisionKind> {
  const seen = new Set<DecisionKind>();
  for (const e of events) {
    if (e.kind === "decision") seen.add(e.decision.kind);
    if (e.kind === "assistant_text") {
      console.log(`  [assistant] ${e.text}`);
    }
    if (e.kind === "tool_use") {
      console.log(
        `  [tool_use] ${e.toolName} (${e.toolUseId})\n             input: ${JSON.stringify(e.input)}`,
      );
    }
    if (e.kind === "intent_proposed") {
      console.log(
        `  [intent_proposed] kind=${e.envelope.kind} taint=${e.envelope.taint} principal=${e.envelope.actor.principal}`,
      );
    }
    if (e.kind === "decision") {
      console.log(`  [DECISION] ${describeDecision(e.decision)}`);
    }
    if (e.kind === "handler_result") {
      console.log(
        `  [handler_result] ${e.toolUseId}: ${JSON.stringify(e.result)}`,
      );
    }
  }
  return seen;
}

function describeDecision(d: Decision): string {
  switch (d.kind) {
    case "EXECUTE":
      return "EXECUTE";
    case "REFUSE":
      return `REFUSE (${d.refusal.kind}: ${d.refusal.code}) — "${d.refusal.userFacing}"`;
    case "REWRITE":
      return `REWRITE — ${d.reason}`;
    case "REQUEST_CONFIRMATION":
      return `REQUEST_CONFIRMATION — "${d.prompt}"`;
    case "ESCALATE":
      return `ESCALATE → ${d.to}: ${d.reason}`;
    case "DEFER":
      return `DEFER on signal "${d.signal}" (timeout ${d.timeoutMs}ms)`;
  }
}

function describeOutcome(result: AgentTurnResult): string {
  const o = result.outcome;
  switch (o.kind) {
    case "completed":
      return `completed`;
    case "deferred":
      return `deferred on signal=${o.signal} intentHash=${o.intentHash.slice(0, 16)}…`;
    case "awaiting_confirmation":
      return `awaiting_confirmation token=${o.confirmationToken.slice(0, 8)}…`;
    case "escalated":
      return `escalated to=${o.to} reason="${o.reason}"`;
    case "max_iterations_exceeded":
      return `max_iterations_exceeded`;
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or export the variable.",
    );
    process.exit(1);
  }

  const anthropicClient = new Anthropic();
  const { pack } = installPack(paymentsPixPack);

  const agent = createAdjudicatedAgent<
    PixIntentKind,
    unknown,
    PixState,
    PixContext
  >({
    pack,
    anthropicClient,
    model: "claude-opus-4-7",
    maxTokens: 1024,
    renderer: createAnthropicPromptRenderer<PixState, PixContext>({
      packId: pack.id,
      toolSchemas: PIX_INTENT_TOOL_SCHEMAS,
      basePrompt: DEMO_BASE_PROMPT,
    }),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore(),
    executor: createPixExecutor(),
  });

  const observed = new Set<DecisionKind>();
  let state: PixState = { charges: new Map() };

  for (let i = 0; i < TRANSCRIPT.length; i++) {
    const turn = TRANSCRIPT[i];
    state = turn.setupState(state);

    banner(`Turn ${i + 1}: ${turn.title}  [expected: ${turn.expected}]`);
    console.log(`  [user] ${turn.userMessage}`);

    const result = await agent.send({
      sessionId: `quickstart-session-${i + 1}`,
      userMessage: turn.userMessage,
      state,
      context: { customerId: "c-1", merchantId: "m-1" },
    });
    const seenThisTurn = summarizeEvents(result.events);
    for (const d of seenThisTurn) observed.add(d);
    console.log(`  [outcome] ${describeOutcome(result)}`);

    // Auto-confirm pause turns when the script expects it.
    if (
      result.outcome.kind === "awaiting_confirmation" &&
      turn.autoConfirm === true
    ) {
      console.log(`  [auto-confirm] accepting confirmation token`);
      const confirmed = await agent.confirm({
        confirmationToken: result.outcome.confirmationToken,
        accepted: true,
        state,
        context: { customerId: "c-1", merchantId: "m-1" },
      });
      const seenOnConfirm = summarizeEvents(confirmed.events);
      for (const d of seenOnConfirm) observed.add(d);
      console.log(`  [outcome after confirm] ${describeOutcome(confirmed)}`);
    }

    state = turn.afterTurn(state);
  }

  banner("Summary");
  for (const d of REQUIRED_DECISIONS) {
    const mark = observed.has(d) ? "✓" : "✗";
    console.log(`  ${mark} ${d}`);
  }

  const missing = REQUIRED_DECISIONS.filter((d) => !observed.has(d));
  if (missing.length === 0) {
    console.log("\n  All six Decisions exercised. Demo passed.\n");
    process.exit(0);
  }
  console.error(
    `\n  Missing Decisions: ${missing.join(", ")}\n  The LLM may not have proposed the expected tool. Re-run; if it persists, check the system prompt in transcript.ts.\n`,
  );
  process.exit(2);
}

main().catch((err) => {
  console.error("Demo failed with error:");
  console.error(err);
  process.exit(1);
});
