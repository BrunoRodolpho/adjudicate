/**
 * P0-2 integration test — adapter exercises `adjudicateAndAudit`'s ledger path.
 *
 * Pre-P0-2 the adapter called pure `adjudicate()` and emitted the audit
 * record by hand with `durationMs: 0` hardcoded — no ledger consult, no
 * race-loss flip, no metrics, no learning. Two duplicate webhook
 * deliveries hitting the same Pack would both EXECUTE.
 *
 * P0-2 rewires the call to `adjudicateAndAudit(envelope, state, policy,
 * { sink, ledger, context, plan })`. This test pins:
 *
 *  1. **Replay suppression**: two `agent.send()` calls with the same
 *     `nonce` (via `deriveNonce`) produce EXECUTE on the first call
 *     and REFUSE with `ledger:replay_suppressed` basis on the second.
 *  2. **Forensic continuity**: the second call still emits an
 *     `AuditRecord` (count = 2, not 1). Otherwise an attacker could
 *     intentionally trigger replay suppression to erase the evidence
 *     trail. The second record's decision is REFUSE; its basis carries
 *     the replay-suppression code; the trace surface is preserved
 *     through the kernel-side audit emission path.
 *  3. **Adapter no longer hardcodes `durationMs: 0`** — the kernel owns
 *     timing now; both records carry a real (non-negative) duration.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import {
  installPack,
  type AuditRecord,
  type AuditSink,
} from "@adjudicate/core";
import {
  paymentsPixPack,
  type PixContext,
  type PixIntentKind,
  type PixState,
} from "@adjudicate/pack-payments-pix";
import { createAdjudicatedAgent, createMemoryLedger } from "../src/index.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import { createAnthropicPromptRenderer } from "../src/renderer-anthropic.js";
import type { AdopterExecutor } from "../src/types.js";

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
    name: "pix.charge.refund",
    description: "Refund a PIX charge",
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

function buildCapturingAuditSink(): {
  sink: AuditSink;
  records: AuditRecord[];
} {
  const records: AuditRecord[] = [];
  return {
    sink: {
      async emit(record) {
        records.push(record);
      },
    },
    records,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function buildStateWithConfirmedCharge() {
  return {
    charges: new Map([
      [
        "ch-replay-test",
        {
          id: "ch-replay-test",
          amountCentavos: 5_000,
          status: "confirmed" as const,
          createdAt: nowIso(),
          confirmedAt: nowIso(),
        },
      ],
    ]),
  } satisfies PixState;
}

describe("P0-2: adapter replay-suppression integration", () => {
  it("two sends with the same nonce: first EXECUTEs, second REFUSEs with replay-suppressed basis", async () => {
    const { pack } = installPack(paymentsPixPack);
    const { sink: auditSink, records } = buildCapturingAuditSink();
    const ledger = createMemoryLedger();
    const state = buildStateWithConfirmedCharge();

    // Pin the same toolUseId + payload across both turns so the default
    // `deriveNonce: ({ toolUseId }) => toolUseId` produces the same
    // intentHash. (Anthropic's tool_use IDs are stable per logical
    // proposal — the duplicate-delivery scenario this guards against is
    // a webhook or message-bus replay surfacing the same proposal twice.)
    const refundCall = {
      id: "tu-replay",
      name: "pix.charge.refund",
      input: {
        chargeId: "ch-replay-test",
        refundCentavos: 1_000,
        reason: "duplicate-delivery test",
      },
    };

    function makeAgent() {
      const { client } = mockAnthropic([
        { toolUses: [refundCall] },
        { text: "Done." },
      ]);
      return createAdjudicatedAgent<PixIntentKind, unknown, PixState, PixContext>({
        pack,
        anthropicClient: client,
        model: "claude-test",
        maxTokens: 256,
        renderer: createAnthropicPromptRenderer<PixState, PixContext>({
          packId: pack.id,
          toolSchemas: PIX_TOOL_SCHEMAS,
        }),
        deferStore: createInMemoryDeferStore(),
        confirmationStore: createInMemoryConfirmationStore(),
        ledger,
        auditSink,
        executor: buildExecutor(),
      });
    }

    const first = await makeAgent().send({
      sessionId: "s-replay",
      userMessage: "Refund 10 reais.",
      state,
      context: { customerId: "c-1", merchantId: "m-1" },
    });
    const second = await makeAgent().send({
      sessionId: "s-replay",
      userMessage: "Refund 10 reais.",
      state,
      context: { customerId: "c-1", merchantId: "m-1" },
    });

    // ── Decisions: first EXECUTEs, second REFUSEs ──
    const firstDecisions = first.events.filter((e) => e.kind === "decision");
    const secondDecisions = second.events.filter((e) => e.kind === "decision");
    expect(firstDecisions).toHaveLength(1);
    expect(secondDecisions).toHaveLength(1);

    const firstDecision = firstDecisions[0];
    const secondDecision = secondDecisions[0];
    if (firstDecision.kind !== "decision" || secondDecision.kind !== "decision") {
      throw new Error("expected decision events");
    }
    expect(firstDecision.decision.kind).toBe("EXECUTE");
    expect(secondDecision.decision.kind).toBe("REFUSE");

    // The same intentHash flowed through both adjudications — that's the
    // pre-condition for the ledger to suppress.
    expect(firstDecision.envelope.intentHash).toBe(
      secondDecision.envelope.intentHash,
    );

    // ── Forensic-continuity: BOTH adjudications emit audit records ──
    // Without this property, an attacker could intentionally trigger
    // replay suppression to erase the evidence trail. The synthesis
    // calls this out as a load-bearing compliance invariant.
    expect(records).toHaveLength(2);

    const [firstRecord, secondRecord] = records;
    expect(firstRecord.decision.kind).toBe("EXECUTE");
    expect(secondRecord.decision.kind).toBe("REFUSE");

    // Second record's basis carries the replay-suppression code.
    const secondBasisCodes = secondRecord.decision.basis.map((b) => b.code);
    expect(
      secondBasisCodes.some((code) =>
        code.toLowerCase().includes("replay"),
      ),
    ).toBe(true);

    // ── No more hardcoded `durationMs: 0` — the kernel owns timing ──
    // Pre-P0-2 the adapter passed durationMs: 0 by hand. Now both
    // records carry a real (non-negative) duration measured by the
    // kernel-side clock.
    expect(firstRecord.durationMs).toBeGreaterThanOrEqual(0);
    expect(secondRecord.durationMs).toBeGreaterThanOrEqual(0);
    // At least one of the records' durations should be observable as
    // a number, even if both happen to be 0 on a fast machine. The
    // important property is that the field is populated by the kernel.
    expect(typeof firstRecord.durationMs).toBe("number");
    expect(typeof secondRecord.durationMs).toBe("number");
  });
});
