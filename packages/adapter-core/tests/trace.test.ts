/**
 * Adapter loop trace events — low-cardinality observability hooks.
 *
 * Tests that the loop emits the documented phases in the documented
 * sequence:
 *
 *   iteration_start → (decision_emitted | paused | completed | max_iterations_exceeded)
 *
 * High-cardinality data (payloads, intent hashes, history bytes) MUST
 * NOT be present in trace events — those belong on the AgentEvent stream.
 */

import { describe, expect, it } from "vitest";
import { type IntentEnvelope, type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createInMemoryTraceSink,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
  type ToolUseRequest,
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

/**
 * Hand-rolled Pack. We can't call `installPack` here without pulling in
 * the planner tool registry — for the loop unit test we only need
 * `pack.planner.plan()` and `pack.policy.bundleId` to exist.
 */
function buildPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "trace-test-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { systemKinds: [] },
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

function bridge(toolUses: ToolUseRequest[]): ProviderBridge<string[]> {
  let called = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [
      ...h,
      `tool_results:${results.length}`,
    ],
    async send(h, _req) {
      called++;
      if (called === 1 && toolUses.length > 0) {
        return {
          history: [...h, "assistant:turn-1"],
          turn: { textBlocks: [], toolUses } satisfies AssistantTurn,
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
    return {
      systemPrompt: "p",
      maxTokens: 100,
      toolSchemas: [],
    };
  },
};

const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

function makeAgent(toolUses: ToolUseRequest[], trace: ReturnType<typeof createInMemoryTraceSink>) {
  return createAdjudicatedAgent<
    "noun.make_pet",
    Payload,
    State,
    Context,
    string[]
  >({
    pack: buildPack(),
    renderer,
    bridge: bridge(toolUses),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    traceSink: trace,
  });
}

describe("adapter trace events", () => {
  it("emits iteration_start → decision_emitted → iteration_start → completed", async () => {
    const trace = createInMemoryTraceSink();
    const agent = makeAgent(
      [{ id: "tu-1", name: "noun.make_pet", input: { name: "rex" } }],
      trace,
    );
    await agent.send({
      sessionId: "s-1",
      userMessage: "do the thing",
      state: { count: 0 },
      context: { userId: "u" },
    });
    const phases = trace.events.map((e) => e.phase);
    expect(phases).toEqual([
      "iteration_start",
      "decision_emitted",
      "iteration_start",
      "completed",
    ]);
    const decisionEvt = trace.events.find((e) => e.phase === "decision_emitted")!;
    // The kernel returned a Decision — what kind is environmental
    // (depends on planner classification + first matching guard). The
    // trace contract is: decisionKind is one of the closed enum values.
    expect(["EXECUTE", "REFUSE", "DEFER", "ESCALATE", "REWRITE", "REQUEST_CONFIRMATION"]).toContain(
      decisionEvt.decisionKind,
    );
    expect(decisionEvt.sessionId).toBe("s-1");
    expect(decisionEvt.iteration).toBe(1);
  });

  it("trace events contain ONLY low-cardinality attributes (no payloads, no history)", async () => {
    const trace = createInMemoryTraceSink();
    const agent = makeAgent(
      [{ id: "tu-1", name: "noun.make_pet", input: { name: "PII-NAME" } }],
      trace,
    );
    await agent.send({
      sessionId: "s-pii",
      userMessage: "secret message",
      state: { count: 0 },
      context: { userId: "u" },
    });
    const json = JSON.stringify(trace.events);
    expect(json).not.toMatch(/PII-NAME/);
    expect(json).not.toMatch(/secret message/);
  });

  it("noopTraceSink is the default and adds zero state", async () => {
    const agent = createAdjudicatedAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildPack(),
      renderer,
      bridge: bridge([]),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor,
    });
    const result = await agent.send({
      sessionId: "s-noop",
      userMessage: "hi",
      state: { count: 0 },
      context: { userId: "u" },
    });
    expect(result.outcome.kind).toBe("completed");
  });

  it("trace events expose iteration counter (1-based, bounded by maxIterations)", async () => {
    const trace = createInMemoryTraceSink();
    const agent = makeAgent([], trace);
    await agent.send({
      sessionId: "s-iter",
      userMessage: "hi",
      state: { count: 0 },
      context: { userId: "u" },
    });
    expect(trace.events.length).toBeGreaterThan(0);
    expect(trace.events[0]!.iteration).toBe(1);
    expect(trace.events.every((e) => e.iteration >= 1)).toBe(true);
  });
});
