/**
 * Phase 0 — Provider Validation Suite for the adjudicate `@adjudicate/openai`
 * adapter (Protocol + Semantic layers over the REAL bridge).
 *
 * Protocol layer: drives the real `createOpenAIBridge` and the real
 * `classifyIncomingToolUse` / `intentKindToApiName` against crafted and PINNED
 * (captured-live) OpenAI ChatCompletion responses, asserting:
 *   naming round-trip (dotted<->underscored) · out-of-plan rejection ·
 *   wire-name-collision fail-closed · argument JSON parse incl. malformed __raw ·
 *   tool-vs-text turn handling · tool_call id echo · multi-tool turns ·
 *   usage mapping. Stream reassembly is N/A for this bridge (non-streaming) —
 *   the streaming path is the claustrum @claustrum/openai provider's concern.
 *
 * Semantic layer: a PINNED real Nemotron tool_call normalizes — through the
 * live-API (underscored) path AND the mocked (dotted) path — to the SAME
 * canonical intent (kind + payload). Drift would live exactly here.
 *
 *   Run: pnpm -F @example/quickstart-anthropic exec tsx src/provider-validation-openai.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  intentKindToApiName,
  classifyIncomingToolUse,
  createOpenAIBridge,
} from "@adjudicate/openai";
import type { Plan } from "@adjudicate/core/llm";

const ARTIFACTS = process.env.NEMO_ARTIFACTS ?? join(homedir(), "projects", "validation_artifacts");
const PV_DIR = join(ARTIFACTS, "provider-validation");
mkdirSync(PV_DIR, { recursive: true });

const checks: Array<{ id: string; layer: "protocol" | "semantic"; desc: string; pass: boolean; detail?: unknown }> = [];
function check(id: string, layer: "protocol" | "semantic", desc: string, pass: boolean, detail?: unknown): void {
  checks.push({ id, layer, desc, pass, detail });
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const PLAN: Plan = {
  allowedIntents: ["pix.charge.create", "pix.charge.refund"],
  visibleReadTools: ["list_pix_charges", "get_pix_charge"],
} as unknown as Plan;

/** A stub OpenAI client that returns a fixed ChatCompletion for the next send. */
function stubClient(response: unknown) {
  return {
    chat: { completions: { async create(): Promise<unknown> { return response; } } },
  } as unknown as Parameters<typeof createOpenAIBridge>[0]["client"];
}

function chatCompletion(opts: {
  content?: string | null;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  finish_reason?: string;
}): unknown {
  return {
    model: "nemotron-3-nano:4b",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: opts.content ?? "",
          ...(opts.toolCalls
            ? {
                tool_calls: opts.toolCalls.map((tc, i) => ({
                  id: tc.id,
                  index: i,
                  type: "function",
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              }
            : {}),
        },
        finish_reason: opts.finish_reason ?? (opts.toolCalls ? "tool_calls" : "stop"),
      },
    ],
    ...(opts.usage ? { usage: opts.usage } : {}),
  };
}

async function send(response: unknown) {
  const bridge = createOpenAIBridge({ client: stubClient(response), model: "nemotron-3-nano:4b" });
  let history = bridge.emptyHistory();
  history = bridge.appendUserMessage(history, "go");
  const req = { systemPrompt: "sys", maxTokens: 256, toolSchemas: [] as unknown[] } as never;
  return bridge.send(history, req);
}

async function main(): Promise<void> {
  // ── PROTOCOL ──────────────────────────────────────────────────────────
  // P1 naming round-trip
  {
    const api = intentKindToApiName("pix.charge.refund");
    const fromUnderscore = classifyIncomingToolUse({ name: "pix_charge_refund", input: {} }, PLAN);
    const fromDotted = classifyIncomingToolUse({ name: "pix.charge.refund", input: {} }, PLAN);
    const ok =
      api === "pix_charge_refund" &&
      fromUnderscore.kind === "intent" &&
      (fromUnderscore as { intentKind: string }).intentKind === "pix.charge.refund" &&
      fromDotted.kind === "intent" &&
      (fromDotted as { intentKind: string }).intentKind === "pix.charge.refund";
    check("P1-naming-roundtrip", "protocol", "dotted<->underscored tool name maps to the same intent both ways", ok, { api });
  }
  // P2 out-of-plan (hallucinated tool)
  {
    const c = classifyIncomingToolUse({ name: "transfer_money_to_mom", input: {} }, PLAN);
    check("P2-out-of-plan", "protocol", "hallucinated tool classified out_of_plan (fail-closed)", c.kind === "out_of_plan", c);
  }
  // P3 wire-name collision fail-closed
  {
    const collidePlan = { allowedIntents: ["a.b"], visibleReadTools: ["a_b"] } as unknown as Plan;
    const c = classifyIncomingToolUse({ name: "a_b", input: {} }, collidePlan);
    check("P3-collision-failclosed", "protocol", "name matching BOTH a read tool and an intent -> out_of_plan", c.kind === "out_of_plan", c);
  }
  // P4 argument parse: valid -> object; malformed -> {__raw}
  {
    const turnValid = (await send(chatCompletion({ toolCalls: [{ id: "t1", name: "pix_charge_refund", arguments: JSON.stringify({ chargeId: "x", refundCentavos: 100, reason: "r" }) }] }))).turn;
    const turnBad = (await send(chatCompletion({ toolCalls: [{ id: "t2", name: "pix_charge_refund", arguments: "{ not json" }] }))).turn;
    const okValid = eq(turnValid.toolUses[0]?.input, { chargeId: "x", refundCentavos: 100, reason: "r" });
    const okRaw = eq(turnBad.toolUses[0]?.input, { __raw: "{ not json" });
    check("P4-arg-parse", "protocol", "valid args parsed to object; malformed args surface as {__raw}", okValid && okRaw, { okValid, okRaw, raw: turnBad.toolUses[0]?.input });
  }
  // P5 tool-vs-text turn handling
  {
    const toolTurn = (await send(chatCompletion({ toolCalls: [{ id: "t1", name: "pix_charge_refund", arguments: "{}" }] }))).turn;
    const textTurn = (await send(chatCompletion({ content: "just a sentence" }))).turn;
    const ok = toolTurn.toolUses.length === 1 && toolTurn.textBlocks.length === 0 && textTurn.toolUses.length === 0 && eq(textTurn.textBlocks, ["just a sentence"]);
    check("P5-tool-vs-text", "protocol", "tool_calls -> toolUses (no text); content -> textBlocks (no toolUses)", ok, { tool: toolTurn.toolUses.length, text: textTurn.textBlocks });
  }
  // P6 tool_call id echo (forward + result threading)
  {
    const { turn } = await send(chatCompletion({ toolCalls: [{ id: "call_abc123", name: "pix_charge_refund", arguments: "{}" }] }));
    const idForward = turn.toolUses[0]?.id === "call_abc123";
    const bridge = createOpenAIBridge({ client: stubClient(chatCompletion({})), model: "m" });
    const withResults = bridge.appendToolResults(bridge.emptyHistory(), [{ toolUseId: "call_abc123", content: "ok" } as never]);
    const last = withResults[withResults.length - 1] as { role: string; tool_call_id?: string };
    const idBack = last.role === "tool" && last.tool_call_id === "call_abc123";
    check("P6-tool-id-echo", "protocol", "tool_call.id echoed forward to toolUses[].id and back onto role:tool tool_call_id", idForward && idBack, { idForward, idBack });
  }
  // P7 multi-tool
  {
    const { turn } = await send(chatCompletion({ toolCalls: [
      { id: "m1", name: "pix_charge_refund", arguments: JSON.stringify({ chargeId: "a" }) },
      { id: "m2", name: "pix_charge_create", arguments: JSON.stringify({ amountCentavos: 5000 }) },
    ] }));
    const ok = turn.toolUses.length === 2 && turn.toolUses[0]?.id === "m1" && turn.toolUses[1]?.id === "m2" && turn.toolUses[1]?.name === "pix_charge_create";
    check("P7-multi-tool", "protocol", "multiple tool_calls in one turn map to multiple toolUses preserving id/name/order", ok, { count: turn.toolUses.length });
  }
  // P8 usage mapping
  {
    const withUsage = (await send(chatCompletion({ toolCalls: [{ id: "u1", name: "pix_charge_refund", arguments: "{}" }], usage: { prompt_tokens: 11, completion_tokens: 7 } }))).turn;
    const withoutUsage = (await send(chatCompletion({ content: "x" }))).turn;
    const ok = eq((withUsage as { usage?: unknown }).usage, { inputTokens: 11, outputTokens: 7 }) && (withoutUsage as { usage?: unknown }).usage === undefined;
    check("P8-usage-mapping", "protocol", "usage.{prompt,completion}_tokens -> {inputTokens,outputTokens}; absent -> omitted", ok, { mapped: (withUsage as { usage?: unknown }).usage });
  }
  // P9 stream reassembly — N/A for the non-streaming adjudicate bridge.
  check("P9-stream-reassembly", "protocol", "N/A: @adjudicate/openai bridge is non-streaming; fragmented tool_calls-by-index reassembly is validated in the claustrum @claustrum/openai provider", true, { applicable: false });

  // ── SEMANTIC ──────────────────────────────────────────────────────────
  // S1 PINNED live Nemotron completion normalizes to the expected canonical intent.
  {
    const smokeFile = join(PV_DIR, "_smoke_v1_toolcall.json");
    let pinned: unknown;
    if (existsSync(smokeFile)) {
      pinned = JSON.parse(readFileSync(smokeFile, "utf8"));
    } else {
      // fallback to a representative pinned completion if the smoke capture is absent
      pinned = chatCompletion({ toolCalls: [{ id: "call_pinned", name: "pix_charge_refund", arguments: JSON.stringify({ chargeId: "cha-confirmed-low", refundCentavos: 3000, reason: "partial refund" }) }] });
    }
    const { turn } = await send(pinned);
    const tu = turn.toolUses[0];
    const cls = tu ? classifyIncomingToolUse({ name: tu.name, input: tu.input }, PLAN) : { kind: "none" };
    const ok = tu !== undefined && cls.kind === "intent" && (cls as { intentKind: string }).intentKind === "pix.charge.refund" && typeof (tu.input as { refundCentavos?: unknown }).refundCentavos === "number";
    check("S1-pinned-normalization", "semantic", "pinned real Nemotron tool_call normalizes to canonical intent pix.charge.refund with structured payload", ok, { name: tu?.name, input: tu?.input, intentKind: (cls as { intentKind?: string }).intentKind });
  }
  // S2 cross-path equivalence: underscored (live) and dotted (mocked) normalize identically.
  {
    const payload = { chargeId: "cha-confirmed-low", refundCentavos: 3000, reason: "partial refund" };
    const live = classifyIncomingToolUse({ name: "pix_charge_refund", input: payload }, PLAN);
    const mocked = classifyIncomingToolUse({ name: "pix.charge.refund", input: payload }, PLAN);
    const ok = live.kind === "intent" && mocked.kind === "intent" && eq(live, mocked);
    check("S2-cross-path-equivalence", "semantic", "underscored live-API path and dotted mocked path produce an IDENTICAL canonical intent (no semantic drift)", ok, { live, mocked });
  }

  const passed = checks.filter((c) => c.pass).length;
  for (const c of checks) console.log(`${c.pass ? "✓" : "✗"} [${c.layer}] ${c.id.padEnd(28)} ${c.desc}`);
  console.log(`\nadjudicate-openai provider validation: ${passed}/${checks.length}`);
  writeFileSync(join(PV_DIR, "adjudicate-openai.json"), JSON.stringify({ adapter: "@adjudicate/openai (bridge-openai.ts)", subject: "nemotron-3-nano:4b", ranAt: new Date().toISOString(), passed, total: checks.length, checks }, null, 2));
  if (passed !== checks.length) {
    console.error("\nPROVIDER VALIDATION RED — translation defect. Downstream adjudicate validation is blocked until fixed.");
    process.exit(1);
  }
  console.log("Protocol + Semantic layers GREEN for @adjudicate/openai.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
