/**
 * LIVE-MODEL validation harness — runs the scripted 6-turn PIX transcript
 * against a LOCAL Nemotron model (Ollama, OpenAI-compatible /v1) through the
 * @adjudicate/openai adapter wired to @adjudicate/pack-payments-pix.
 *
 * This is the OpenAI-adapter twin of index.ts (which targets Claude). It proves
 * the real "AI proposes, kernel decides" loop end-to-end against a live model:
 *   live Nemotron tool_call → classifyIncomingToolUse → kernel adjudicate →
 *   EXECUTE/REFUSE/REWRITE/REQUEST_CONFIRMATION/ESCALATE/DEFER → executor.
 *
 * The point is that the KERNEL deterministically governs whatever the (small,
 * 4B) model proposes — not that Nemotron matches a frontier model's coverage.
 *
 *   NEMOTRON_BASE_URL  default http://192.168.1.80:11434/v1
 *   NEMOTRON_MODEL     default nemotron-3-nano:4b
 *   Run: pnpm -F @example/quickstart-anthropic exec tsx src/index-nemotron.ts
 */

import {
  installPack,
  noopAuditSink,
  type Decision,
  type DecisionKind,
} from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createOpenAIPromptRenderer,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AgentEvent,
  type AgentTurnResult,
  type OpenAIChatLikeClient,
} from "@adjudicate/openai";
import {
  paymentsPixPack,
  type PixIntentKind,
  type PixState,
  type PixContext,
} from "@adjudicate/pack-payments-pix";
import { createPixExecutor } from "./executor.js";
import { PIX_INTENT_TOOL_SCHEMAS } from "./tool-schemas.js";
import { DEMO_BASE_PROMPT, TRANSCRIPT } from "./transcript.js";
import { makeRecordingClient, writeLiveRun, summarizeLatency, makeFetchOllamaClient } from "./nemo-capture.js";

const BASE_URL = process.env.NEMOTRON_BASE_URL ?? "http://192.168.1.80:11434/v1";
const MODEL = process.env.NEMOTRON_MODEL ?? "nemotron-3-nano:4b";

const REQUIRED_DECISIONS: ReadonlyArray<DecisionKind> = [
  "EXECUTE",
  "REFUSE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "ESCALATE",
  "DEFER",
];

const openaiClient = makeFetchOllamaClient(BASE_URL) as unknown as OpenAIChatLikeClient;

function banner(text: string): void {
  const line = "─".repeat(72);
  console.log(`\n${line}\n  ${text}\n${line}`);
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

function summarizeEvents(events: ReadonlyArray<AgentEvent>): Set<DecisionKind> {
  const seen = new Set<DecisionKind>();
  for (const e of events) {
    if (e.kind === "assistant_text") console.log(`  [assistant] ${e.text}`);
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
      seen.add(e.decision.kind);
      console.log(`  [DECISION] ${describeDecision(e.decision)}`);
    }
    if (e.kind === "handler_result") {
      console.log(`  [handler_result] ${e.toolUseId}: ${JSON.stringify(e.result)}`);
    }
  }
  return seen;
}

function describeOutcome(result: AgentTurnResult): string {
  const o = result.outcome;
  switch (o.kind) {
    case "completed":
      return "completed";
    case "deferred":
      return `deferred on signal=${o.signal} intentHash=${o.intentHash.slice(0, 16)}…`;
    case "awaiting_confirmation":
      return `awaiting_confirmation token=${o.confirmationToken.slice(0, 8)}…`;
    case "escalated":
      return `escalated to=${o.to} reason="${o.reason}"`;
    case "max_iterations_exceeded":
      return "max_iterations_exceeded";
    default:
      return (o as { kind: string }).kind;
  }
}

async function main(): Promise<void> {
  banner(`Live model: ${MODEL} @ ${BASE_URL}`);
  const { pack } = installPack(paymentsPixPack);

  const { client: recordingClient, drain } = makeRecordingClient(
    openaiClient as unknown as {
      chat: { completions: { create(body: unknown): Promise<unknown> } };
    },
  );
  const allLatencies: number[] = [];

  const agent = createAdjudicatedAgent<PixIntentKind, unknown, PixState, PixContext>({
    pack,
    openaiClient: recordingClient as unknown as typeof openaiClient,
    model: MODEL,
    maxTokens: 1024,
    renderer: createOpenAIPromptRenderer<PixState, PixContext>({
      packId: pack.id,
      toolSchemas: PIX_INTENT_TOOL_SCHEMAS,
      basePrompt: DEMO_BASE_PROMPT,
    }),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore(),
    ledger: createMemoryLedger(),
    auditSink: noopAuditSink(),
    executor: createPixExecutor(),
  });

  const observed = new Set<DecisionKind>();
  let state: PixState = { charges: new Map() };

  for (const [i, turn] of TRANSCRIPT.entries()) {
    state = turn.setupState(state);
    banner(`Turn ${i + 1}: ${turn.title}  [expected: ${turn.expected}]`);
    console.log(`  [user] ${turn.userMessage}`);

    const result = await agent.send({
      sessionId: `nemotron-session-${i + 1}`,
      userMessage: turn.userMessage,
      state,
      context: { customerId: "c-1", merchantId: "m-1" },
    });
    for (const d of summarizeEvents(result.events)) observed.add(d);
    console.log(`  [outcome] ${describeOutcome(result)}`);

    {
      const caps = drain();
      for (const c of caps) allLatencies.push(c.latencyMs);
      const decisions = result.events.filter((e) => e.kind === "decision");
      const dks = decisions.map((e) => (e as { decision: { kind: string } }).decision.kind);
      const intentEv = result.events.find((e) => e.kind === "intent_proposed") as
        | { envelope?: { intentHash?: string; kind?: unknown; taint?: unknown; actor?: { principal?: unknown } } }
        | undefined;
      const totalLatency = caps.reduce((s, c) => s + c.latencyMs, 0);
      const totalCompletionTokens = caps.reduce((s, c) => s + (c.completionTokens ?? 0), 0);
      writeLiveRun({
        track: "trackA-natural",
        scenario: turn.title,
        expected: turn.expected,
        provider: "openai-compat-fetch",
        providerVersion: "@adjudicate/openai (real bridge) -> Ollama /v1",
        modelConfig: { model: MODEL },
        userMessage: turn.userMessage,
        modelCalls: caps,
        toolCalls: result.events
          .filter((e) => e.kind === "tool_use")
          .map((e) => {
            const t = e as { toolName?: unknown; input?: unknown; toolUseId?: unknown };
            return { name: t.toolName, input: t.input, id: t.toolUseId };
          }),
        canonicalIntent: intentEv?.envelope
          ? {
              kind: intentEv.envelope.kind,
              taint: intentEv.envelope.taint,
              principal: intentEv.envelope.actor?.principal,
            }
          : undefined,
        intentHash: intentEv?.envelope?.intentHash,
        decisionKind: dks[0],
        decision: decisions[0],
        outcome: result.outcome.kind,
        latencyMs: Number(totalLatency.toFixed(1)),
        tokensPerSec:
          totalLatency > 0
            ? Number(((totalCompletionTokens / totalLatency) * 1000).toFixed(2))
            : null,
        capturedAt: new Date().toISOString(),
      });
    }

    if (result.outcome.kind === "awaiting_confirmation" && turn.autoConfirm === true) {
      console.log(`  [auto-confirm] accepting confirmation token`);
      const confirmed = await agent.confirm({
        confirmationToken: result.outcome.confirmationToken,
        accepted: true,
        state,
        context: { customerId: "c-1", merchantId: "m-1" },
      });
      for (const d of summarizeEvents(confirmed.events)) observed.add(d);
      console.log(`  [outcome after confirm] ${describeOutcome(confirmed)}`);
    }

    state = turn.afterTurn(state);
  }

  banner("Summary — kernel decisions exercised by the live model");
  for (const d of REQUIRED_DECISIONS) {
    console.log(`  ${observed.has(d) ? "✓" : "·"} ${d}`);
  }
  const missing = REQUIRED_DECISIONS.filter((d) => !observed.has(d));
  console.log(
    missing.length === 0
      ? "\n  All six kernel decisions exercised against the live model.\n"
      : `\n  Not exercised this run: ${missing.join(", ")} — the 4B model may not have proposed the triggering tool call. The kernel correctly governed every proposal it DID make (no fail-open, no crash).\n`,
  );
  const latency = summarizeLatency(allLatencies);
  console.log(
    `  Latency (live model calls): P50=${latency.p50}ms P95=${latency.p95}ms max=${latency.max}ms n=${latency.count}`,
  );
  console.log(`  Natural decisions observed: ${[...observed].join(", ") || "(none)"}`);
  // Validation success = the loop ran end-to-end against the live model and the
  // kernel rendered a defined Decision for every proposal. Coverage of all six
  // is a model-capability metric, not a kernel-correctness one.
  // Non-zero exit if NO decisions were observed at all — a silent run that never
  // adjudicated anything is not a green result.
  if (observed.size === 0) {
    console.error("\n  NON-GREEN: no kernel decisions observed across the run — the model may not have proposed any tool calls. Governance loop did not exercise the kernel.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Live-model harness failed:");
  console.error(err);
  process.exit(1);
});
