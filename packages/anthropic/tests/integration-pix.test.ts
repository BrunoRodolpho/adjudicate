/**
 * Integration test — real PIX pack + real kernel + mocked Anthropic SDK.
 *
 * Verifies the adapter against the actual `paymentsPixPack` (applied
 * through `installPack`, which composes `assertPackConformance` +
 * `withBasisAudit` + `safePlan`). Asserts the load-bearing claims
 * the plan called out:
 *
 *   1. All 6 Decision kinds emerge across the canned conversation.
 *   2. The AuditSink receives one record per intent Decision.
 *   3. `safePlan` is honored — no MUTATING tool name leaks into
 *      `Plan.visibleReadTools`. Asserted by reading every plan event.
 *   4. `withBasisAudit` records no drift — no `basis_code_drift`,
 *      `basis_vocabulary_drift`, `rewrite_taint_regression`, or
 *      `defer_signal_drift` MetricsSink failure events.
 *   5. The full event log is deterministic given identical inputs
 *      (replay-safe).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
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
import { createAdjudicatedAgent } from "../src/adapter.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import { createAnthropicPromptRenderer } from "../src/renderer-anthropic.js";
import type { AdopterExecutor, AgentEvent } from "../src/types.js";

// ── Test harness ─────────────────────────────────────────────────────────────

interface CannedTurn {
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
  text?: string;
}

function mockAnthropic(turns: CannedTurn[]) {
  const turnsCopy = [...turns];
  const create = vi.fn(async () => {
    const turn = turnsCopy.shift();
    if (turn === undefined) {
      throw new Error("mockAnthropic: no more canned turns");
    }
    const content: Message["content"] = [];
    if (turn.text) {
      content.push({ type: "text", text: turn.text, citations: null });
    }
    if (turn.toolUses) {
      for (const tu of turn.toolUses) {
        const block: ToolUseBlock = {
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input as Record<string, unknown>,
        };
        content.push(block);
      }
    }
    return {
      id: "msg-mock",
      type: "message",
      role: "assistant",
      content,
      model: "claude-test",
      stop_reason: turn.toolUses?.length ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as Message;
  });
  return {
    client: { messages: { create } } as unknown as Parameters<
      typeof createAdjudicatedAgent
    >[0]["anthropicClient"],
    create,
  };
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

const now = () => new Date().toISOString();
const confirmedCharge = (
  id: string,
  amountCentavos: number,
): PixCharge => ({
  id,
  amountCentavos,
  status: "confirmed",
  createdAt: now(),
  confirmedAt: now(),
});

// ── Drift-capturing metrics sink ─────────────────────────────────────────────

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

// ── Audit sink that captures records ────────────────────────────────────────

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

// ── The canned conversation: one tool_use per Decision ──────────────────────

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
          toolUses: [
            {
              id: "tu-defer-1",
              name: "pix.charge.create",
              input: {
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
          toolUses: [
            {
              id: "tu-refuse-1",
              name: "pix.charge.refund",
              input: {
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
          toolUses: [
            {
              id: "tu-execute-1",
              name: "pix.charge.refund",
              input: {
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
          toolUses: [
            {
              id: "tu-rewrite-1",
              name: "pix.charge.refund",
              input: {
                chargeId: "cha-rewrite",
                refundCentavos: 9000, // > original 5000 — kernel clamps
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
          toolUses: [
            {
              id: "tu-confirm-1",
              name: "pix.charge.refund",
              input: {
                chargeId: "cha-confirm",
                refundCentavos: 60_000, // ≥ 50_000 confirm threshold, < 100_000 escalate
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
          toolUses: [
            {
              id: "tu-escalate-1",
              name: "pix.charge.refund",
              input: {
                chargeId: "cha-escalate",
                refundCentavos: 200_000, // ≥ 100_000 escalate threshold
                reason: "fraud claim",
              },
            },
          ],
        },
      ],
    },
  ];
}

// ── Conversation runner ─────────────────────────────────────────────────────

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

  // Capture the planner's outputs by spying on plan().
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
    const { client } = mockAnthropic(step.turns);
    const agent = createAdjudicatedAgent<
      PixIntentKind,
      unknown,
      PixState,
      PixContext
    >({
      pack: packWithSpy,
      anthropicClient: client,
      model: "claude-test",
      maxTokens: 256,
      renderer: createAnthropicPromptRenderer<PixState, PixContext>({
        packId: pack.id,
        toolSchemas: PIX_TOOL_SCHEMAS,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      auditSink,
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

/**
 * Strip non-deterministic fields (timestamps, randomly-generated tokens)
 * from event sequences so two runs with identical canned inputs produce
 * identical fingerprints.
 */
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
        is_error: e.payload.is_error ?? false,
      };
    }
    if (e.kind === "tool_use") {
      return {
        kind: "tool_use",
        name: e.toolName,
      };
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("integration: real PIX pack through the adapter", () => {
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
    // Every record's decision kind matches the order in the event log.
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
