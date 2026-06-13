/**
 * Integration test — real PIX Pack + real kernel + mocked AI SDK
 * `generateText`.
 *
 * Cross-provider parity check: same Pack, same canned conversation
 * shape, same kernel invariants verified, just driven through the AI
 * SDK `generateText` surface instead of OpenAI Chat Completions or
 * Anthropic Messages.
 *
 * Asserted invariants (identical to the OpenAI adapter's PIX integration):
 *   1. All 6 Decision kinds emerge across the canned conversation.
 *   2. The AuditSink receives one record per intent Decision.
 *   3. `safePlan` is honored — no MUTATING tool name leaks into
 *      `Plan.visibleReadTools`.
 *   4. `withBasisAudit` records no drift events for a healthy run.
 *   5. Event log is deterministic across two identical runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetMetricsSink,
  installPack,
  setMetricsSink,
  type AuditRecord,
  type AuditSink,
  type DecisionKind,
  type MetricsSink,
  type SinkFailureEvent,
} from "@adjudicate/core";
import { isMutating } from "@adjudicate/core/llm";
import {
  PIX_TOOLS,
  paymentsPixPack,
  type PixCharge,
  type PixContext,
  type PixIntentKind,
  type PixState,
} from "@adjudicate/pack-payments-pix";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "@adjudicate/adapter-core";
import { createAdjudicatedAgent } from "../src/adapter.js";
import { createVercelPromptRenderer } from "../src/renderer-vercel.js";
import type {
  VercelGenerateTextFn,
  VercelToolCall,
} from "../src/vercel-types.js";
import type { AdopterExecutor, AgentEvent } from "../src/types.js";

interface CannedTurn {
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
  text?: string;
}

function mockVercel(turns: CannedTurn[]): {
  generateText: VercelGenerateTextFn;
  create: ReturnType<typeof vi.fn>;
} {
  const turnsCopy = [...turns];
  const create = vi.fn(async () => {
    const turn = turnsCopy.shift();
    if (turn === undefined) {
      throw new Error("mockVercel: no more canned turns");
    }
    // The AI SDK delivers tool-call inputs already parsed as objects —
    // no JSON.stringify on the wire, unlike Chat Completions.
    const toolCalls: VercelToolCall[] = (turn.toolCalls ?? []).map((tc) => ({
      toolCallId: tc.id,
      toolName: tc.name,
      input: tc.arguments ?? {},
    }));
    return {
      text: turn.text ?? "",
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  });
  return { generateText: create, create };
}

const PIX_TOOL_SCHEMAS = [
  {
    name: "pix.charge.create",
    description: "Create a PIX charge",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "pix.charge.refund",
    description: "Refund a PIX charge",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_pix_charges",
    description: "List charges",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_pix_charge",
    description: "Get a charge",
    input_schema: { type: "object", properties: {} },
  },
];

function buildExecutor(): AdopterExecutor<PixIntentKind, unknown, PixState> {
  return {
    async invokeRead() {
      return [];
    },
    async invokeIntent(env) {
      return { ok: true, kind: env.kind };
    },
  };
}

function buildState(charges: PixCharge[] = []): PixState {
  return { charges: new Map(charges.map((c) => [c.id, c])) };
}

const nowIso = () => new Date().toISOString();
const confirmedCharge = (id: string, amountCentavos: number): PixCharge => ({
  id,
  amountCentavos,
  status: "confirmed",
  createdAt: nowIso(),
  confirmedAt: nowIso(),
});

function buildCapturingMetricsSink(): {
  sink: MetricsSink;
  failures: SinkFailureEvent[];
} {
  const failures: SinkFailureEvent[] = [];
  const sink: MetricsSink = {
    recordLedgerOp() {},
    recordDecision() {},
    recordRefusal() {},
    recordSinkFailure(event) {
      failures.push(event);
    },
    recordShadowDivergence() {},
    recordResourceLimit() {},
  };
  return { sink, failures };
}

function buildCapturingAuditSink(): {
  sink: AuditSink;
  records: AuditRecord[];
} {
  const records: AuditRecord[] = [];
  const sink: AuditSink = {
    async emit(record) {
      records.push(record);
    },
  };
  return { sink, records };
}

interface ConversationStep {
  readonly label: DecisionKind;
  readonly state: PixState;
  readonly turns: CannedTurn[];
}

function buildSixDecisionConversation(): ConversationStep[] {
  return [
    {
      label: "DEFER",
      state: buildState(),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-defer-1",
              name: "pix_charge_create",
              arguments: {
                amountCentavos: 5000,
                payerDocument: "12345678900",
                description: "iced coffee",
              },
            },
          ],
        },
      ],
    },
    {
      label: "REFUSE",
      state: buildState([confirmedCharge("cha-confirmed", 5000)]),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-refuse-1",
              name: "pix_charge_refund",
              arguments: {
                chargeId: "cha-doesnotexist",
                refundCentavos: 1000,
                reason: "test refuse",
              },
            },
          ],
        },
        { text: "I cannot find that charge." },
      ],
    },
    {
      label: "EXECUTE",
      state: buildState([confirmedCharge("cha-execute", 5000)]),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-execute-1",
              name: "pix_charge_refund",
              arguments: {
                chargeId: "cha-execute",
                refundCentavos: 3000,
                reason: "small refund",
              },
            },
          ],
        },
        { text: "Refund completed." },
      ],
    },
    {
      label: "REWRITE",
      state: buildState([confirmedCharge("cha-rewrite", 5000)]),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-rewrite-1",
              name: "pix_charge_refund",
              arguments: {
                chargeId: "cha-rewrite",
                refundCentavos: 9000,
                reason: "kernel clamps me",
              },
            },
          ],
        },
        { text: "Refund clamped to original amount." },
      ],
    },
    {
      label: "REQUEST_CONFIRMATION",
      state: buildState([confirmedCharge("cha-confirm", 80_000)]),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-confirm-1",
              name: "pix_charge_refund",
              arguments: {
                chargeId: "cha-confirm",
                refundCentavos: 60_000,
                reason: "medium refund needs confirmation",
              },
            },
          ],
        },
      ],
    },
    {
      label: "ESCALATE",
      state: buildState([confirmedCharge("cha-escalate", 500_000)]),
      turns: [
        {
          toolCalls: [
            {
              id: "tc-escalate-1",
              name: "pix_charge_refund",
              arguments: {
                chargeId: "cha-escalate",
                refundCentavos: 200_000,
                reason: "fraud claim",
              },
            },
          ],
        },
      ],
    },
  ];
}

interface RunResult {
  events: AgentEvent[];
  outcomes: Array<string>;
  decisions: DecisionKind[];
  plans: Array<{
    visibleReadTools: ReadonlyArray<string>;
    allowedIntents: ReadonlyArray<string>;
  }>;
}

async function runConversation(
  conversation: ConversationStep[],
  auditSink: AuditSink,
): Promise<RunResult> {
  const { pack } = installPack(paymentsPixPack);

  const plans: RunResult["plans"] = [];
  const wrappedPlanner = {
    plan(state: PixState, context: PixContext) {
      const p = pack.planner.plan(state, context);
      plans.push({
        visibleReadTools: p.visibleReadTools,
        allowedIntents: p.allowedIntents,
      });
      return p;
    },
  };
  const packWithSpy = { ...pack, planner: wrappedPlanner };

  const collected: AgentEvent[] = [];
  const outcomes: string[] = [];
  const decisions: DecisionKind[] = [];

  for (let i = 0; i < conversation.length; i++) {
    const step = conversation[i];
    const { generateText } = mockVercel(step.turns);
    const agent = createAdjudicatedAgent<
      PixIntentKind,
      unknown,
      PixState,
      PixContext
    >({
      pack: packWithSpy,
      generateText,
      model: {},
      maxTokens: 256,
      renderer: createVercelPromptRenderer<PixState, PixContext>({
        packId: pack.id,
        toolSchemas: PIX_TOOL_SCHEMAS,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      auditSink,
      ledger: (await import("@adjudicate/adapter-core")).createMemoryLedger(),
      executor: buildExecutor(),
    });
    const result = await agent.send({
      sessionId: `s-int-${i}`,
      userMessage: `Step ${step.label}`,
      state: step.state,
      context: { customerId: "c-1", merchantId: "m-1" },
    });
    collected.push(...result.events);
    outcomes.push(result.outcome.kind);
    for (const e of result.events) {
      if (e.kind === "decision") decisions.push(e.decision.kind);
    }
  }

  return { events: collected, outcomes, decisions, plans };
}

function fingerprintEvents(events: AgentEvent[]): unknown[] {
  return events.map((e) => {
    if (e.kind === "intent_proposed") {
      const env = e.envelope;
      return {
        kind: "intent_proposed",
        envKind: env.kind,
        actor: env.actor,
        taint: env.taint,
        intentHash: env.intentHash,
        nonce: env.nonce,
      };
    }
    if (e.kind === "decision") {
      return { kind: "decision", decisionKind: e.decision.kind };
    }
    if (e.kind === "tool_result") {
      return {
        kind: "tool_result",
        toolUseId: e.toolUseId,
        isError: e.payload.isError ?? false,
      };
    }
    if (e.kind === "tool_use") {
      return { kind: "tool_use", name: e.toolName };
    }
    if (e.kind === "handler_result") {
      return { kind: "handler_result", toolUseId: e.toolUseId };
    }
    if (e.kind === "user_message") {
      return { kind: "user_message", text: e.text };
    }
    if (e.kind === "assistant_text") {
      return { kind: "assistant_text", text: e.text };
    }
    return e;
  });
}

describe("integration (Vercel AI): real PIX pack through the adapter", () => {
  let metricsCapture: ReturnType<typeof buildCapturingMetricsSink>;

  beforeEach(() => {
    metricsCapture = buildCapturingMetricsSink();
    setMetricsSink(metricsCapture.sink);
  });

  afterEach(() => {
    _resetMetricsSink();
  });

  it("produces all 6 Decision kinds across the canned conversation", async () => {
    const audit = buildCapturingAuditSink();
    const result = await runConversation(
      buildSixDecisionConversation(),
      audit.sink,
    );

    const required: DecisionKind[] = [
      "EXECUTE",
      "REFUSE",
      "REWRITE",
      "REQUEST_CONFIRMATION",
      "ESCALATE",
      "DEFER",
    ];
    for (const r of required) {
      expect(result.decisions).toContain(r);
    }
  });

  it("AuditSink receives exactly one record per intent Decision", async () => {
    const audit = buildCapturingAuditSink();
    const result = await runConversation(
      buildSixDecisionConversation(),
      audit.sink,
    );

    expect(audit.records).toHaveLength(result.decisions.length);
    for (let i = 0; i < audit.records.length; i++) {
      expect(audit.records[i].decision.kind).toBe(result.decisions[i]);
    }
  });

  it("safePlan is honored — no MUTATING tool name leaks into visibleReadTools", async () => {
    const audit = buildCapturingAuditSink();
    const result = await runConversation(
      buildSixDecisionConversation(),
      audit.sink,
    );

    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      for (const readTool of plan.visibleReadTools) {
        expect(isMutating(PIX_TOOLS, readTool)).toBe(false);
      }
    }
  });

  it("withBasisAudit emits no drift events for a healthy run", async () => {
    const audit = buildCapturingAuditSink();
    await runConversation(buildSixDecisionConversation(), audit.sink);

    const driftClasses = new Set<string>([
      "basis_code_drift",
      "basis_vocabulary_drift",
      "rewrite_taint_regression",
      "defer_signal_drift",
    ]);
    const driftEvents = metricsCapture.failures.filter((f) =>
      driftClasses.has(f.errorClass),
    );
    expect(driftEvents).toEqual([]);
  });

  it("event log is deterministic given identical canned inputs (replay-safe)", async () => {
    const a = await runConversation(
      buildSixDecisionConversation(),
      buildCapturingAuditSink().sink,
    );
    const b = await runConversation(
      buildSixDecisionConversation(),
      buildCapturingAuditSink().sink,
    );

    expect(fingerprintEvents(a.events)).toEqual(fingerprintEvents(b.events));
    expect(a.decisions).toEqual(b.decisions);
    expect(a.outcomes).toEqual(b.outcomes);
  });
});
