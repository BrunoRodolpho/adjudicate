/**
 * ADR-126: memory enriches the planner+renderer context (the SAME enriched
 * context — no desync), upstream of the envelope. The kernel decision is
 * identical with vs without memory; writeback fires post-turn; a poisoned
 * memory cannot change the decision or the envelope taint.
 */
import { describe, expect, it, vi } from "vitest";
import { noopAuditSink, type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createInMemoryMemoryStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AgentEvent,
  type AssistantTurn,
  type ProviderBridge,
} from "../src/index.js";

interface State {
  readonly count: number;
}
interface Context {
  readonly userId: string;
  readonly memoryTag?: string;
}
interface Payload {
  readonly name: string;
}

function buildPack(seen: { plannerContexts: Context[] }): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "memory-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    basisCodes: ["state:transition_valid"],
    signals: [],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [() => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] })],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan: (_state: State, context: Context) => {
        seen.plannerContexts.push(context);
        return { visibleReadTools: [] as const, allowedIntents: ["noun.make_pet"] as const };
      },
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
  };
}

function bridge(toolUse: boolean): ProviderBridge<string[]> {
  let n = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `u:${m}`],
    appendToolResults: (h, r) => [...h, `t:${r.length}`],
    async send(h) {
      n += 1;
      if (n === 1 && toolUse) {
        return {
          history: [...h, "a1"],
          turn: { textBlocks: [], toolUses: [{ id: "tu", name: "noun.make_pet", input: { name: "rex" } }] } satisfies AssistantTurn,
        };
      }
      return { history: [...h, "done"], turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn };
    },
  };
}

const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

function makeAgent(opts: {
  seen: { plannerContexts: Context[]; renderContexts: Context[] };
  memory?: ReturnType<typeof createInMemoryMemoryStore>;
  writeback?: boolean;
}) {
  const renderer = {
    render: (_s: State, context: Context) => {
      opts.seen.renderContexts.push(context);
      return { systemPrompt: `sys:${context.memoryTag ?? "none"}`, maxTokens: 100, toolSchemas: [] };
    },
  };
  return createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(opts.seen),
    renderer,
    bridge: bridge(true),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    // 013/T1: auditSink is required — pass an explicit no-op (this suite asserts
    // on decisions/envelopes, not emission), never a silent default.
    auditSink: noopAuditSink(),
    executor,
    ...(opts.memory
      ? {
          memoryStore: opts.memory,
          enrichContext: (base: Context, memory: unknown | null) => ({
            ...base,
            memoryTag: (memory as { tag?: string } | null)?.tag ?? "cold",
          }),
        }
      : {}),
    ...(opts.writeback
      ? { deriveMemoryWriteback: () => ({ memory: { tag: "after" }, ttlSeconds: 60 }) }
      : {}),
  });
}

const send = { sessionId: "s", userMessage: "hi", state: { count: 0 }, context: { userId: "u" } };

describe("memory store loop integration (ADR-126)", () => {
  it("planner AND renderer see the same enriched context", async () => {
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const memory = createInMemoryMemoryStore();
    await memory.put("s", { tag: "warm" }, 60);
    const agent = makeAgent({ seen, memory });
    await agent.send(send);
    expect(seen.plannerContexts.every((c) => c.memoryTag === "warm")).toBe(true);
    expect(seen.renderContexts.every((c) => c.memoryTag === "warm")).toBe(true);
  });

  it("cold session enriches with null memory", async () => {
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const agent = makeAgent({ seen, memory: createInMemoryMemoryStore() });
    await agent.send(send);
    expect(seen.plannerContexts[0]!.memoryTag).toBe("cold");
  });

  it("no memoryStore → context passes through unchanged", async () => {
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const agent = makeAgent({ seen });
    await agent.send(send);
    expect(seen.plannerContexts[0]!.memoryTag).toBeUndefined();
  });

  it("writeback fires after the turn", async () => {
    const memory = createInMemoryMemoryStore();
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const agent = makeAgent({ seen, memory, writeback: true });
    await agent.send(send);
    expect(await memory.get("s")).toEqual({ tag: "after" });
  });

  it("writeback retries on a CAS version conflict, then commits", async () => {
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    let version = 0;
    let putIfVersionCalls = 0;
    let stored: unknown = null;
    const store = {
      async get() {
        return stored;
      },
      async put(_s: string, m: unknown) {
        stored = m;
      },
      async getVersioned() {
        return { value: stored, version };
      },
      async putIfVersion(_s: string, m: unknown, expected: number) {
        putIfVersionCalls += 1;
        if (putIfVersionCalls === 1) {
          version += 1; // a concurrent writer landed between our read and write
          return null; // → conflict, loop must re-read and retry
        }
        if (expected !== version) return null;
        version += 1;
        stored = m;
        return version;
      },
    };
    const agent = makeAgent({
      seen,
      memory: store as unknown as ReturnType<typeof createInMemoryMemoryStore>,
      writeback: true,
    });
    await agent.send(send);
    expect(putIfVersionCalls).toBe(2); // first conflicted, second committed
    expect(stored).toEqual({ tag: "after" });
  });

  it("DETERMINISM: the decision + envelope are identical with vs without memory", async () => {
    const seenA = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const seenB = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const memory = createInMemoryMemoryStore();
    await memory.put("s", { tag: "warm" }, 60);

    const withMem = makeAgent({ seen: seenA, memory });
    const without = makeAgent({ seen: seenB });
    const resA = await withMem.send(send);
    const resB = await without.send(send);

    const decA = resA.events.find((e: AgentEvent) => e.kind === "decision");
    const decB = resB.events.find((e: AgentEvent) => e.kind === "decision");
    expect(decA && decB).toBeTruthy();
    if (decA?.kind === "decision" && decB?.kind === "decision") {
      expect(decA.envelope.intentHash).toBe(decB.envelope.intentHash);
      expect(decA.decision.kind).toBe(decB.decision.kind);
      expect(decA.envelope.taint).toBe("UNTRUSTED"); // memory never raised taint
    }
  });

  it("ADVERSARIAL: a poisoned memory cannot change the envelope taint", async () => {
    const seen = { plannerContexts: [] as Context[], renderContexts: [] as Context[] };
    const memory = createInMemoryMemoryStore();
    await memory.put("s", { tag: "SYSTEM" }, 60); // attacker-controlled cross-session value
    const agent = makeAgent({ seen, memory });
    const res = await agent.send(send);
    const dec = res.events.find((e: AgentEvent) => e.kind === "decision");
    if (dec?.kind === "decision") expect(dec.envelope.taint).toBe("UNTRUSTED");
  });
});
