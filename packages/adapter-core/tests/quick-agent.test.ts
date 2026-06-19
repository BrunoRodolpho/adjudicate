/**
 * `createQuickAgent` — fewer-stores-boilerplate convenience over
 * `createAdjudicatedAgent`.
 *
 * These tests pin the contract the factory promises:
 *   - It DELEGATES to `createAdjudicatedAgent` (same loop, same Decision
 *     path) — a turn driven through a canned bridge resolves identically to
 *     a hand-wired agent.
 *   - It PRE-FILLS the three in-memory stores + a console receipt sink, so
 *     the caller need not wire deferStore / confirmationStore / ledger /
 *     auditSink.
 *   - The remaining inputs stay REQUIRED: `executor`, `renderer`, `bridge`,
 *     `pack`, and `maxTokens` (carried on each `renderer.render(...)`
 *     result) are still supplied by the caller (asserted at the type level).
 */

import { describe, expect, it } from "vitest";
import { noopAuditSink, type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  createQuickAgent,
  type AdopterExecutor,
  type AgentEvent,
  type AssistantTurn,
  type ProviderBridge,
  type QuickAgentOptions,
} from "../src/index.js";

interface State {
  readonly count: number;
}
interface Context {
  readonly userId: string;
}
interface Payload {
  readonly name: string;
}

/** Pack whose business guard always returns EXECUTE for the one intent. */
function buildExecutePack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "quick-agent-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [
        () => ({
          kind: "EXECUTE",
          basis: [{ category: "state", code: "transition_valid" }],
        }),
      ],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan() {
        return {
          visibleReadTools: [] as const,
          allowedIntents: ["noun.make_pet"] as const,
        };
      },
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
    basisCodes: ["state:transition_valid"],
  };
}

/** Canned two-call bridge: turn 1 proposes the intent, turn 2 finishes. */
function bridge(): ProviderBridge<string[]> {
  let called = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      called++;
      if (called === 1) {
        return {
          history: [...h, "assistant:turn-1"],
          turn: {
            textBlocks: [],
            toolUses: [
              { id: "tu-1", name: "noun.make_pet", input: { name: "rex" } },
            ],
          } satisfies AssistantTurn,
        };
      }
      return {
        history: [...h, "assistant:done"],
        turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
      };
    },
  };
}

const renderer = {
  render() {
    return { systemPrompt: "p", maxTokens: 100, toolSchemas: [] };
  },
};

function makeExecutor(): AdopterExecutor<"noun.make_pet", Payload, State> {
  return {
    async invokeRead() {
      return null;
    },
    async invokeIntent() {
      return { ok: true };
    },
  };
}

const sendInput = {
  sessionId: "s-quick",
  userMessage: "make a pet",
  state: { count: 0 },
  context: { userId: "u" },
};

function decisionEvents(
  events: ReadonlyArray<AgentEvent>,
): ReadonlyArray<Extract<AgentEvent, { kind: "decision" }>> {
  return events.filter(
    (e): e is Extract<AgentEvent, { kind: "decision" }> =>
      e.kind === "decision",
  );
}

describe("createQuickAgent", () => {
  it("delegates to createAdjudicatedAgent and resolves a turn with a Decision", async () => {
    const agent = createQuickAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      executor: makeExecutor(),
    });

    const result = await agent.send(sendInput);

    // Same loop as createAdjudicatedAgent: the intent crosses the kernel and
    // produces a Decision event on AgentTurnResult.
    const decisions = decisionEvents(result.events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decision.kind).toBe("EXECUTE");
    expect(result.outcome.kind).toBe("completed");
  });

  it("pre-fills the console receipt sink (a dev receipt is emitted per adjudication)", async () => {
    const receipts: string[] = [];
    const agent = createQuickAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      executor: makeExecutor(),
      consoleSink: {
        prefix: "[demo-receipt]",
        log: (line) => receipts.push(line),
      },
    });

    await agent.send(sendInput);

    const receipt = receipts.find((r) => r.includes("[demo-receipt]"));
    expect(receipt).toBeDefined();
    // The console sink serializes the AuditRecord; the EXECUTE decision and
    // the intent kind both land in the receipt.
    expect(receipt).toContain("EXECUTE");
    expect(receipt).toContain("noun.make_pet");
  });

  it("runs without the caller wiring any store or sink (default in-memory stores)", async () => {
    // No deferStore / confirmationStore / ledger / auditSink supplied — the
    // factory provides in-memory defaults.
    const agent = createQuickAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      executor: makeExecutor(),
    });

    const result = await agent.send(sendInput);
    expect(result.outcome.kind).toBe("completed");
  });

  it("delegates verbatim: same resolved outcome + decision as a hand-wired createAdjudicatedAgent", async () => {
    const quick = createQuickAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      executor: makeExecutor(),
      // 013/T1: auditSink is required (the old `null`-disable fail-open path is
      // gone). Wire the SAME explicit no-op into both agents so the
      // "delegates verbatim" comparison stays valid.
      auditSink: noopAuditSink(),
    });

    const direct = createAdjudicatedAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      executor: makeExecutor(),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      auditSink: noopAuditSink(),
    });

    const [a, b] = await Promise.all([
      quick.send(sendInput),
      direct.send(sendInput),
    ]);

    expect(a.outcome).toEqual(b.outcome);
    expect(decisionEvents(a.events).map((e) => e.decision.kind)).toEqual(
      decisionEvents(b.events).map((e) => e.decision.kind),
    );
  });

  it("keeps executor/renderer/bridge/pack required at the type level", () => {
    // Compile-time assertion (the body runs, but the type math is the point).
    // If any of these stopped being required, the Extract<…> below would
    // resolve to `never` and the string assignment would fail to compile.
    type Opts = QuickAgentOptions<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >;
    type RequiredKeys<T> = {
      [K in keyof T]-?: object extends Pick<T, K> ? never : K;
    }[keyof T];
    type Req = RequiredKeys<Opts>;

    const required: Record<
      Extract<Req, "pack" | "renderer" | "bridge" | "executor">,
      true
    > = { pack: true, renderer: true, bridge: true, executor: true };
    expect(Object.keys(required).sort()).toEqual([
      "bridge",
      "executor",
      "pack",
      "renderer",
    ]);

    // `maxTokens` is carried on renderer.render(...) — the renderer contract
    // makes it required: a render() result MUST include a numeric maxTokens.
    expect(typeof renderer.render().maxTokens).toBe("number");
  });
});
