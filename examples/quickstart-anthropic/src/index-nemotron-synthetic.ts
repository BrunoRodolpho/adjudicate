/**
 * SYNTHETIC forced-proposal coverage harness (Track A, Synthetic = 6/6).
 *
 * Where index-nemotron.ts measures what the *live 4B model* naturally proposes
 * (a model-capability metric), this harness proves BRANCH EXISTENCE: it injects
 * engineered tool_calls — in the real OpenAI wire shape — through the SAME real
 * pipeline (bridge `classifyIncomingToolUse` -> kernel `adjudicate` -> executor)
 * and asserts each of the six kernel Decisions is reached, including a STANDALONE
 * REWRITE (a clamp whose clamped amount stays below the confirmation threshold,
 * so REWRITE is the surfaced decision rather than being masked by a more
 * restrictive REQUEST_CONFIRMATION via the lattice).
 *
 * The "model" here is a deterministic scripted client — NO live inference — so
 * the result is a clean, reproducible kernel-coverage proof. Each scenario's
 * proposal is engineered; the DECISION is whatever the real policy renders, and
 * the harness asserts it equals the ground-truth target derived from
 * packages/pack-payments-pix/src/policies.ts. Assertions are never weakened: a
 * mismatch exits non-zero.
 *
 *   Run: pnpm -F @example/quickstart-anthropic exec tsx src/index-nemotron-synthetic.ts
 */

import {
  installPack,
  noopAuditSink,
  type DecisionKind,
} from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createOpenAIPromptRenderer,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AgentEvent,
  type OpenAIChatLikeClient,
} from "@adjudicate/openai";
import {
  paymentsPixPack,
  type PixIntentKind,
  type PixState,
  type PixContext,
  type PixCharge,
} from "@adjudicate/pack-payments-pix";
import { createPixExecutor } from "./executor.js";
import { PIX_INTENT_TOOL_SCHEMAS } from "./tool-schemas.js";
import { DEMO_BASE_PROMPT } from "./transcript.js";
import { writeLiveRun, makeScriptedClient } from "./nemo-capture.js";

const MODEL = "synthetic-forced-proposal";

interface EngineeredToolCall {
  readonly name: string; // underscored wire name, e.g. pix_charge_refund
  readonly args: Record<string, unknown>;
}

interface Scenario {
  readonly title: string;
  readonly expected: DecisionKind;
  readonly toolCall: EngineeredToolCall;
  readonly userMessage: string;
}

function charge(
  id: string,
  amountCentavos: number,
  status: PixCharge["status"],
): [string, PixCharge] {
  const now = "2026-06-23T00:00:00.000Z";
  return [
    id,
    { id, amountCentavos, status, createdAt: now, confirmedAt: now },
  ];
}

// Deterministic primed state engineered so every branch is reachable.
function syntheticState(): PixState {
  return {
    charges: new Map<string, PixCharge>([
      charge("cha-exec-low", 5_000, "confirmed"), // EXECUTE: refund 3000 <= 5000
      charge("cha-rewrite", 30_000, "confirmed"), // REWRITE: refund 40000 -> clamp 30000 (<50000)
      charge("cha-confirm", 300_000, "confirmed"), // CONFIRM: refund 60000 (>=50000, <100000)
      charge("cha-escalate", 500_000, "confirmed"), // ESCALATE: refund 200000 (>=100000)
    ]),
  };
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    title: "DEFER — create charge parks on provider webhook",
    expected: "DEFER",
    userMessage: "Create a PIX charge for R$ 50,00.",
    toolCall: {
      name: "pix_charge_create",
      args: { amountCentavos: 5000, payerDocument: "12345678900", description: "iced coffee" },
    },
  },
  {
    title: "REFUSE — refund a charge that does not exist",
    expected: "REFUSE",
    userMessage: "Refund R$ 100,00 from charge cha-nonexistent.",
    toolCall: {
      name: "pix_charge_refund",
      args: { chargeId: "cha-nonexistent", refundCentavos: 10000, reason: "customer requested" },
    },
  },
  {
    title: "EXECUTE — small valid refund below all thresholds",
    expected: "EXECUTE",
    userMessage: "Refund R$ 30,00 from charge cha-exec-low.",
    toolCall: {
      name: "pix_charge_refund",
      args: { chargeId: "cha-exec-low", refundCentavos: 3000, reason: "partial refund" },
    },
  },
  {
    title: "REWRITE — refund > original, clamped amount stays below CONFIRM threshold",
    expected: "REWRITE",
    userMessage: "Refund R$ 400,00 from charge cha-rewrite (original R$ 300,00).",
    toolCall: {
      name: "pix_charge_refund",
      args: { chargeId: "cha-rewrite", refundCentavos: 40000, reason: "overcharge dispute" },
    },
  },
  {
    title: "REQUEST_CONFIRMATION — medium refund crosses CONFIRM threshold",
    expected: "REQUEST_CONFIRMATION",
    userMessage: "Refund R$ 600,00 from charge cha-confirm.",
    toolCall: {
      name: "pix_charge_refund",
      args: { chargeId: "cha-confirm", refundCentavos: 60000, reason: "dispute" },
    },
  },
  {
    title: "ESCALATE — large refund crosses supervisor threshold",
    expected: "ESCALATE",
    userMessage: "Refund R$ 2000,00 from charge cha-escalate.",
    toolCall: {
      name: "pix_charge_refund",
      args: { chargeId: "cha-escalate", refundCentavos: 200000, reason: "fraud claim" },
    },
  },
];


function decisionKindsFromEvents(events: ReadonlyArray<AgentEvent>): {
  kinds: DecisionKind[];
  envelopeHash?: string;
  canonicalIntent?: unknown;
  decision?: unknown;
} {
  const kinds: DecisionKind[] = [];
  let envelopeHash: string | undefined;
  let canonicalIntent: unknown;
  let decision: unknown;
  for (const e of events) {
    if (e.kind === "intent_proposed") {
      envelopeHash = e.envelope.intentHash;
      canonicalIntent = {
        kind: e.envelope.kind,
        taint: e.envelope.taint,
        principal: e.envelope.actor?.principal,
      };
    }
    if (e.kind === "decision") {
      kinds.push(e.decision.kind);
      if (decision === undefined) decision = e.decision;
    }
  }
  return { kinds, envelopeHash, canonicalIntent, decision };
}

async function main(): Promise<void> {
  const { pack } = installPack(paymentsPixPack);
  const context: PixContext = { customerId: "c-1", merchantId: "m-1" };
  const results: Array<{ title: string; expected: DecisionKind; observed: DecisionKind | "NONE"; pass: boolean }> = [];

  for (const [i, sc] of SCENARIOS.entries()) {
    const agent = createAdjudicatedAgent<PixIntentKind, unknown, PixState, PixContext>({
      pack,
      openaiClient: makeScriptedClient([sc.toolCall], MODEL) as unknown as OpenAIChatLikeClient,
      model: MODEL,
      maxTokens: 256,
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

    const state = syntheticState();
    const t0 = performance.now();
    const result = await agent.send({
      sessionId: `synthetic-${i + 1}`,
      userMessage: sc.userMessage,
      state,
      context,
    });
    const latencyMs = Number((performance.now() - t0).toFixed(1));
    const { kinds, envelopeHash, canonicalIntent, decision } = decisionKindsFromEvents(result.events);
    const observed = (kinds[0] ?? "NONE") as DecisionKind | "NONE";
    const pass = observed === sc.expected;
    results.push({ title: sc.title, expected: sc.expected, observed, pass });

    writeLiveRun({
      track: "trackA-synthetic",
      scenario: sc.title,
      expected: sc.expected,
      provider: "scripted-forced-proposal",
      providerVersion: "@adjudicate/openai (real bridge)",
      modelConfig: { model: MODEL },
      userMessage: sc.userMessage,
      modelCalls: [],
      toolCalls: [sc.toolCall],
      canonicalIntent,
      intentHash: envelopeHash,
      decisionKind: observed === "NONE" ? undefined : observed,
      decision,
      outcome: result.outcome.kind,
      finalOutput: undefined,
      state: { charges: [...state.charges.keys()] },
      latencyMs,
      tokensPerSec: null,
      capturedAt: new Date().toISOString(),
    });

    const mark = pass ? "✓" : "✗";
    console.log(
      `${mark} ${sc.expected.padEnd(20)} observed=${observed.padEnd(20)} decisions=[${kinds.join(", ")}]  ${sc.title}`,
    );
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nSynthetic decision coverage: ${passed}/${SCENARIOS.length}`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.error("\nFAILED scenarios (observed != ground-truth expected):");
    for (const f of failures) console.error(`  - ${f.title}: expected ${f.expected}, observed ${f.observed}`);
    process.exit(1);
  }
  console.log("All six kernel Decisions reached via forced proposals through the real bridge + kernel. No fail-open.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Synthetic harness crashed:");
  console.error(err);
  process.exit(1);
});
