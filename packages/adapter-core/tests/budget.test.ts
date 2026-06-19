/**
 * 025 — capabilities-as-budgets: atomic shell burn-down + loop substitution.
 *
 * The budget store METERS at-most-`limit` threshold substitutions per
 * `(budgetId, intentKind)` per window via the ATOMIC `evalIncrCheck` Lua
 * primitive (NOT the non-atomic GET+DEL the confirmation store documents). These
 * tests pin:
 *   - at-most-`limit` grants under CONCURRENT burn-downs (the headline race the
 *     non-atomic store cannot win) — the §6 atomicity gate.
 *   - over-limit ⇒ no grant (fail-closed to friction, §C / §D #6).
 *   - the window refills after TTL expiry.
 *   - a store without `evalIncrCheck` fails closed (no grant; no silent
 *     non-atomic fallback).
 *   - loop wiring: a REQUEST_CONFIRMATION for a budget-capable kind is
 *     substituted to a budget-satisfied EXECUTE up to the limit; over-limit it
 *     stays REQUEST_CONFIRMATION (no executor side effect).
 *   - default OFF: no `budget` option leaves REQUEST_CONFIRMATION standing.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  decisionRequestConfirmation,
  type BudgetGrant,
  type Guard,
  type IntentEnvelope,
  type PackV0,
} from "@adjudicate/core";
import {
  createBudgetStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import { runBudgetBurnDown } from "../src/decisions.js";

const grant: BudgetGrant = {
  budgetId: "bud-test",
  intentKind: "pix.charge.create",
  limit: 3,
  windowSeconds: 600,
};

describe("createBudgetStore — atomic burn-down (at-most-limit)", () => {
  it("at-most-limit under CONCURRENT burn-downs (the atomic race the non-atomic store cannot win)", async () => {
    const store = createBudgetStore({ client: createInMemoryDeferStore() });
    // Fire LIMIT+5 concurrent burn-downs against a limit-3 budget. At most 3 may
    // come back `true`; the rest MUST be `false` — atomic increment-and-check.
    const attempts = grant.limit + 5;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => store.tryBurnDown(grant)),
    );
    const granted = results.filter((r) => r === true).length;
    const denied = results.filter((r) => r === false).length;
    expect(granted).toBe(grant.limit); // exactly the ceiling, never more
    expect(denied).toBe(attempts - grant.limit);
  });

  it("sequential burn-downs: first `limit` succeed, the rest fail (fail-closed to friction)", async () => {
    const store = createBudgetStore({ client: createInMemoryDeferStore() });
    const outcomes: boolean[] = [];
    for (let i = 0; i < grant.limit + 2; i++) {
      outcomes.push(await store.tryBurnDown(grant));
    }
    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it("distinct (budgetId, intentKind) pairs do not share a counter", async () => {
    const store = createBudgetStore({ client: createInMemoryDeferStore() });
    // Exhaust grant A.
    for (let i = 0; i < grant.limit; i++) await store.tryBurnDown(grant);
    expect(await store.tryBurnDown(grant)).toBe(false);
    // A different intentKind under the same budgetId still has a fresh counter.
    const grantB: BudgetGrant = { ...grant, intentKind: "pix.charge.refund" };
    expect(await store.tryBurnDown(grantB)).toBe(true);
    // A different budgetId likewise.
    const grantC: BudgetGrant = { ...grant, budgetId: "bud-other" };
    expect(await store.tryBurnDown(grantC)).toBe(true);
  });

  it("window refills after TTL expiry", async () => {
    vi.useFakeTimers();
    try {
      const store = createBudgetStore({ client: createInMemoryDeferStore() });
      const short: BudgetGrant = { ...grant, limit: 1, windowSeconds: 10 };
      expect(await store.tryBurnDown(short)).toBe(true);
      expect(await store.tryBurnDown(short)).toBe(false); // exhausted this window
      vi.advanceTimersByTime(11_000); // past the TTL
      expect(await store.tryBurnDown(short)).toBe(true); // refilled
    } finally {
      vi.useRealTimers();
    }
  });

  it("a client WITHOUT evalIncrCheck throws at construction (no silent non-atomic fallback)", () => {
    expect(() =>
      createBudgetStore({
        // A bare counter client with no atomic Lua primitive.
        client: {} as Parameters<typeof createBudgetStore>[0]["client"],
      }),
    ).toThrow(/evalIncrCheck/);
  });

  it("keyFor namespaces the counter", async () => {
    const seen: string[] = [];
    const client = {
      async evalIncrCheck(counterKey: string, _ttl: number, _max: number) {
        seen.push(counterKey);
        return 1;
      },
    };
    const store = createBudgetStore({
      client,
      keyFor: (s) => `tenant-x:${s}`,
    });
    await store.tryBurnDown(grant);
    expect(seen[0]).toBe("tenant-x:budget:bud-test:pix.charge.create");
  });
});

describe("runBudgetBurnDown — decisions.ts shell helper (uses evalIncrCheck)", () => {
  it("returns true while in-budget, false once exhausted", async () => {
    const store = createInMemoryDeferStore();
    const rk = (raw: string) => raw;
    const small: BudgetGrant = { ...grant, limit: 2 };
    expect(await runBudgetBurnDown({ store, grant: small, rk })).toBe(true);
    expect(await runBudgetBurnDown({ store, grant: small, rk })).toBe(true);
    expect(await runBudgetBurnDown({ store, grant: small, rk })).toBe(false);
  });

  it("fail-closed when the store lacks evalIncrCheck (no grant)", async () => {
    const rk = (raw: string) => raw;
    const result = await runBudgetBurnDown({
      store: {} as Parameters<typeof runBudgetBurnDown>[0]["store"],
      grant,
      rk,
    });
    expect(result).toBe(false);
  });

  it("fail-closed when the store throws (no grant)", async () => {
    const rk = (raw: string) => raw;
    const result = await runBudgetBurnDown({
      store: {
        async evalIncrCheck() {
          throw new Error("redis down");
        },
      },
      grant,
      rk,
    });
    expect(result).toBe(false);
  });
});

// ── Loop-level wiring: REQUEST_CONFIRMATION → budget-satisfied EXECUTE ────────
//
// A minimal pack whose business guard always asks for confirmation, driven
// through the real `createAdjudicatedAgent` send loop with a budget configured.
// This exercises the decrement-then-assert-grant path end-to-end.

import { createAdjudicatedAgent } from "../src/loop.js";
import type {
  AdopterExecutor,
  AgentEvent,
  AssistantTurn,
  ProviderBridge,
  ToolUseRequest,
} from "../src/types.js";
import type { AuditSink } from "@adjudicate/core";

interface BState {
  readonly _b?: never;
}
interface BCtx {
  readonly _c?: never;
}
type BHist = string[];

const askGuard: Guard<string, unknown, unknown> = () =>
  decisionRequestConfirmation("Confirm this transfer?", []);

function makePack(): PackV0<"pix.charge.create", { amountCentavos: number }, BState, BCtx> {
  return {
    contract: "v0",
    id: "pack-budget-test",
    version: "0.1.0",
    intents: ["pix.charge.create"],
    basisCodes: [],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [askGuard],
      default: "REFUSE",
    },
    planner: {
      plan: () => ({
        visibleReadTools: [] as const,
        allowedIntents: ["pix.charge.create"] as const,
      }),
    },
  } as unknown as PackV0<"pix.charge.create", { amountCentavos: number }, BState, BCtx>;
}

const renderer = {
  render() {
    return { systemPrompt: "p", maxTokens: 100, toolSchemas: [] };
  },
};

/**
 * A bridge that, on its FIRST send, emits a single tool_use whose WIRE name is
 * `intentKindToApiName("pix.charge.create")` = `pix_charge_create` so the
 * classifier resolves it to the allowed intent; then ends the turn.
 */
function makeBridge(): ProviderBridge<BHist> {
  let called = 0;
  const toolUses: ToolUseRequest[] = [
    { id: "tu-1", name: "pix_charge_create", input: { amountCentavos: 5000 } },
  ];
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      called++;
      if (called === 1) {
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

function captureSink(): { sink: AuditSink; records: unknown[] } {
  const records: unknown[] = [];
  return { sink: { async emit(r) { records.push(r); } }, records };
}

function buildExecutor(): AdopterExecutor<"pix.charge.create", { amountCentavos: number }, BState> {
  return {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => ({ chargeId: "c-1" })),
  };
}

function decisionKinds(events: ReadonlyArray<AgentEvent>): string[] {
  return events
    .filter((e): e is Extract<AgentEvent, { kind: "decision" }> => e.kind === "decision")
    .map((e) => e.decision.kind);
}

function makeAgent(
  executor: AdopterExecutor<"pix.charge.create", { amountCentavos: number }, BState>,
  sink: AuditSink,
  budget?: {
    store: { evalIncrCheck?: (k: string, t: number, m: number) => Promise<number> };
    resolveGrant: (kind: string) => BudgetGrant | undefined;
  },
) {
  return createAdjudicatedAgent<
    "pix.charge.create",
    { amountCentavos: number },
    BState,
    BCtx,
    BHist
  >({
    pack: makePack(),
    renderer,
    bridge: makeBridge(),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: {
      put: vi.fn(async () => {}),
      take: vi.fn(async () => null),
    },
    auditSink: sink,
    executor,
    ...(budget !== undefined ? { budget } : {}),
  } as never);
}

describe("createAdjudicatedAgent — budget substitution in the send loop", () => {
  it("substitutes REQUEST_CONFIRMATION → EXECUTE while in-budget (executor IS invoked)", async () => {
    const executor = buildExecutor();
    const { sink } = captureSink();
    const agent = makeAgent(executor, sink, {
      store: createInMemoryDeferStore(),
      resolveGrant: (kind) =>
        kind === "pix.charge.create"
          ? { budgetId: "b1", intentKind: kind, limit: 5, windowSeconds: 600 }
          : undefined,
    });

    const result = await agent.send({
      sessionId: "s-1",
      userMessage: "do it",
      state: {},
      context: {},
    });
    expect(decisionKinds(result.events)).toContain("EXECUTE");
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
  });

  it("over-limit: leaves REQUEST_CONFIRMATION standing (executor NOT invoked, friction restored)", async () => {
    const executor = buildExecutor();
    const { sink } = captureSink();
    // A shared budget store, limit 1, pre-exhausted by a direct burn so the loop
    // sees an over-limit budget.
    const budgetStore = createInMemoryDeferStore();
    const exhaustGrant: BudgetGrant = {
      budgetId: "b1",
      intentKind: "pix.charge.create",
      limit: 1,
      windowSeconds: 600,
    };
    expect(
      await runBudgetBurnDown({ store: budgetStore, grant: exhaustGrant, rk: (r) => r }),
    ).toBe(true);

    const agent = makeAgent(executor, sink, {
      store: budgetStore,
      resolveGrant: () => exhaustGrant,
    });

    const result = await agent.send({
      sessionId: "s-2",
      userMessage: "do it",
      state: {},
      context: {},
    });
    expect(decisionKinds(result.events)).toContain("REQUEST_CONFIRMATION");
    expect(decisionKinds(result.events)).not.toContain("EXECUTE");
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("default OFF: no budget option leaves REQUEST_CONFIRMATION standing (byte-identical to pre-025)", async () => {
    const executor = buildExecutor();
    const { sink } = captureSink();
    const agent = makeAgent(executor, sink);

    const result = await agent.send({
      sessionId: "s-3",
      userMessage: "do it",
      state: {},
      context: {},
    });
    expect(decisionKinds(result.events)).toContain("REQUEST_CONFIRMATION");
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("no grant for the kind: REQUEST_CONFIRMATION stands (resolver returns undefined)", async () => {
    const executor = buildExecutor();
    const { sink } = captureSink();
    const agent = makeAgent(executor, sink, {
      store: createInMemoryDeferStore(),
      resolveGrant: () => undefined, // no standing budget covers this kind
    });

    const result = await agent.send({
      sessionId: "s-4",
      userMessage: "do it",
      state: {},
      context: {},
    });
    expect(decisionKinds(result.events)).toContain("REQUEST_CONFIRMATION");
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });
});
