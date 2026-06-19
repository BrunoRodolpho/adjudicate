/**
 * 071 — the loop's confirm() forwards the caller-supplied (capability, approver,
 * channel) binding tuple onto the kernel's `confirmationReceipt.binding`. The
 * pending envelope is taken (single-use) and hash-verified by confirm() before
 * the receipt is built; this suite drives the PUBLIC agent surface end-to-end
 * (send → awaiting_confirmation → confirm) and asserts:
 *   - a matching binding overrides REQUEST_CONFIRMATION → EXECUTE and records the
 *     confirmed tuple on the EXECUTE audit row's `supersedes.binding`;
 *   - a MISMATCHED bound field (requested !== confirmed) fails the override
 *     CLOSED — the confirm re-adjudication stays REQUEST_CONFIRMATION (friction,
 *     never bypass, §D-6);
 *   - omitting `binding` is byte-identical to pre-071 (no `binding` key).
 */

import { describe, expect, it } from "vitest";
import type { AuditRecord, AuditSink, PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
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

/** Pack whose business guard always returns REQUEST_CONFIRMATION. */
function buildConfirmPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "confirm-binding-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [
        () => ({
          kind: "REQUEST_CONFIRMATION",
          prompt: "Confirm?",
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
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
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
    return { systemPrompt: "p", maxTokens: 100, toolSchemas: [] };
  },
};

function capturingSink(): AuditSink & { records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return { records, async emit(r) { records.push(r); } };
}

function makeAgent(sink: AuditSink) {
  const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
    async invokeRead() {
      return null;
    },
    async invokeIntent() {
      return { ok: true };
    },
  };
  return createAdjudicatedAgent<
    "noun.make_pet",
    Payload,
    State,
    Context,
    string[]
  >({
    pack: buildConfirmPack(),
    renderer,
    bridge: bridge([
      { id: "tu-1", name: "noun.make_pet", input: { name: "rex" } },
    ]),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    auditSink: sink,
    executor,
  });
}

async function pause(agent: ReturnType<typeof makeAgent>) {
  const result = await agent.send({
    sessionId: "s-bind",
    userMessage: "do it",
    state: { count: 0 },
    context: { userId: "u" },
  });
  expect(result.outcome.kind).toBe("awaiting_confirmation");
  if (result.outcome.kind !== "awaiting_confirmation") throw new Error("no pause");
  return result.outcome.confirmationToken;
}

describe("071 confirm() forwards the binding tuple to the kernel receipt", () => {
  it("a matching binding overrides → EXECUTE and records confirmed tuple on supersedes.binding", async () => {
    const sink = capturingSink();
    const agent = makeAgent(sink);
    const token = await pause(agent);

    const result = await agent.confirm({
      confirmationToken: token,
      accepted: true,
      state: { count: 0 },
      context: { userId: "u" },
      binding: {
        approver: { requested: "alice", confirmed: "alice" },
        channel: { requested: "slack", confirmed: "slack" },
      },
    });

    expect(result.outcome.kind).toBe("completed");
    const exec = sink.records.find((r) => r.decision.kind === "EXECUTE");
    expect(exec).toBeDefined();
    expect(exec!.supersedes).toMatchObject({
      reason: "confirmation_resolved",
      binding: { approver: "alice", channel: "slack" },
    });
    // The token still rides the supersession (AuthReviewer-005 path intact).
    expect(exec!.supersedes!.token).toBe(token);
  });

  it("a MISMATCHED bound approver fails the override closed (stays REQUEST_CONFIRMATION)", async () => {
    const sink = capturingSink();
    const agent = makeAgent(sink);
    const token = await pause(agent);

    await agent.confirm({
      confirmationToken: token,
      accepted: true,
      state: { count: 0 },
      context: { userId: "u" },
      binding: {
        // issued-against approver "alice" but confirmed by "mallory" — fail closed.
        approver: { requested: "alice", confirmed: "mallory" },
      },
    });

    // No EXECUTE row was ever emitted — the override fell through. The confirm
    // re-adjudication recorded a REQUEST_CONFIRMATION verdict instead.
    expect(sink.records.some((r) => r.decision.kind === "EXECUTE")).toBe(false);
    const rc = sink.records.find(
      (r) => r.decision.kind === "REQUEST_CONFIRMATION",
    );
    expect(rc).toBeDefined();
    expect(rc!.supersedes).toBeUndefined();
  });

  it("omitting binding is byte-identical to pre-071 (no binding key on supersedes)", async () => {
    const sink = capturingSink();
    const agent = makeAgent(sink);
    const token = await pause(agent);

    const result = await agent.confirm({
      confirmationToken: token,
      accepted: true,
      state: { count: 0 },
      context: { userId: "u" },
      // no binding
    });

    expect(result.outcome.kind).toBe("completed");
    const exec = sink.records.find((r) => r.decision.kind === "EXECUTE");
    expect(exec!.supersedes).toMatchObject({ reason: "confirmation_resolved" });
    expect(exec!.supersedes).not.toHaveProperty("binding");
  });
});
