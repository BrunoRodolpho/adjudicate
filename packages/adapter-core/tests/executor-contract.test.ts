import { describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  decisionExecute,
  decisionRewrite,
  noopAuditSink,
  type ExecutorContract,
  type IntentEnvelope,
  type TaintPolicy,
} from "@adjudicate/core";
import { createRuntimeContext } from "@adjudicate/core/kernel";
import { routeReadThroughKernel, translateDecision } from "../src/decisions.js";
import { createAdjudicatedAgent } from "../src/loop.js";
import { createMemoryLedger } from "@adjudicate/audit";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import type {
  AdjudicatedAgentOptions,
  AdopterExecutor,
  AssistantTurn,
  ProviderBridge,
  ToolClassification,
} from "../src/types.js";
import type { PackV0 } from "@adjudicate/core";

interface Payload {
  amountCentavos: number;
}
type State = Record<string, never>;

const envelope: IntentEnvelope<"pix.charge.refund", Payload> = buildEnvelope({
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  createdAt: "2026-04-29T12:00:00.000Z",
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
});

// 011/T4: a real content-addressed hash — runExecute re-verifies the rewritten
// hash before executing, so the fixture must derive cleanly from its content.
const rewritten: IntentEnvelope<"pix.charge.refund", Payload> = buildEnvelope({
  kind: "pix.charge.refund",
  payload: { amountCentavos: 3000 },
  createdAt: "2026-04-29T12:00:00.000Z",
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
});

// Executor must return { refundId: string, refunded: number }.
const contract: ExecutorContract = {
  outputShape: {
    kind: "object",
    fields: { refundId: { kind: "string" }, refunded: { kind: "number" } },
  },
};

function buildContext(opts?: { result?: unknown; executorContract?: ExecutorContract }) {
  const executor: AdopterExecutor<"pix.charge.refund", Payload, State> = {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => opts?.result ?? { refundId: "r-1", refunded: 5000 }),
  };
  return {
    envelope,
    toolUseId: "tu-1",
    sessionId: "s-1",
    state: {} as State,
    executor,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<unknown>(),
    historySnapshot: [] as unknown,
    rk: (raw: string) => raw,
    generateToken: () => "ct-fixed",
    ...(opts?.executorContract ? { executorContract: opts.executorContract } : {}),
  };
}

describe("executor output contract (item 1)", () => {
  it("no contract -> pass-through, no violation event", async () => {
    const ctx = buildContext();
    const t = await translateDecision({ ...ctx, decision: decisionExecute([]) });
    expect(t.extraEvents.some((e) => e.kind === "executor_contract_violation")).toBe(false);
    expect(t.loopAction).toEqual({ kind: "continue" });
  });

  it("contract match -> no violation event, normal handler_result", async () => {
    const ctx = buildContext({ executorContract: contract, result: { refundId: "r-1", refunded: 5000 } });
    const t = await translateDecision({ ...ctx, decision: decisionExecute([]) });
    expect(t.extraEvents.some((e) => e.kind === "executor_contract_violation")).toBe(false);
    expect(t.extraEvents.some((e) => e.kind === "handler_result")).toBe(true);
  });

  it("contract mismatch -> violation event PREPENDED; EXECUTE not flipped", async () => {
    // Baseline: identical executor output, NO contract.
    const noContract = buildContext({ result: { refundId: 123, refunded: 5000 } });
    const baseline = await translateDecision({ ...noContract, decision: decisionExecute([]) });

    const ctx = buildContext({ executorContract: contract, result: { refundId: 123, refunded: 5000 } });
    const t = await translateDecision({ ...ctx, decision: decisionExecute([]) });

    // Non-flip: tool result + loop action are byte-identical to the no-contract run.
    expect(t.toolResult).toEqual(baseline.toolResult);
    expect(t.loopAction).toEqual({ kind: "continue" });

    // The violation is the FIRST event (prepended), and rides extraEvents (no bus).
    const first = t.extraEvents[0];
    if (first?.kind !== "executor_contract_violation") {
      throw new Error("expected executor_contract_violation first");
    }
    expect(first.intentKind).toBe("pix.charge.refund");
    expect(first.intentHash).toBe(envelope.intentHash);
    expect(first.mismatch).toEqual({ path: "refundId", expected: "string", actual: "number" });

    // The side effect still happened: handler_result + tool_result are present.
    expect(t.extraEvents.some((e) => e.kind === "handler_result")).toBe(true);
    expect(t.extraEvents.some((e) => e.kind === "tool_result")).toBe(true);

    // EXECUTE actually ran the executor.
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
  });

  it("REWRITE path validates against the (same-kind) rewritten envelope", async () => {
    const ctx = buildContext({ executorContract: contract, result: { refundId: 999, refunded: 3000 } });
    const t = await translateDecision({ ...ctx, decision: decisionRewrite(rewritten, "clamped", []) });
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(rewritten, {});
    const first = t.extraEvents[0];
    if (first?.kind !== "executor_contract_violation") {
      throw new Error("expected executor_contract_violation first");
    }
    expect(first.intentHash).toBe(rewritten.intentHash);
    expect(first.mismatch.path).toBe("refundId");
  });

  it("REWRITE: executor receives ONLY the verified rewritten bytes, never the original (011/T2+T4)", async () => {
    const ctx = buildContext({ result: { refundId: "r-1", refunded: 3000 } });
    await translateDecision({ ...ctx, decision: decisionRewrite(rewritten, "clamped", []) });
    const calls = (ctx.executor.invokeIntent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const handed = calls[0]?.[0] as IntentEnvelope;
    // The executor sees the rewritten hash — the exact bytes the audited kernel
    // re-adjudicated to a second-pass EXECUTE — and never the original proposal.
    expect(handed.intentHash).toBe(rewritten.intentHash);
    expect(handed.intentHash).not.toBe(envelope.intentHash);
  });

  it("REWRITE: a rewritten envelope with a stale hash is fail-closed, executor never runs (011/T4)", async () => {
    // Stand-in for a Decision NOT produced by the audited kernel path: the
    // rewritten bytes were tampered after the kernel verified them.
    const tampered: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...rewritten,
      payload: { amountCentavos: 7777 },
    };
    const ctx = buildContext({ result: { refundId: "r-1", refunded: 3000 } });
    const t = await translateDecision({ ...ctx, decision: decisionRewrite(tampered, "clamped", []) });
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });

  it("is deterministic for a given (output, contract)", async () => {
    const a = await translateDecision({
      ...buildContext({ executorContract: contract, result: { refundId: 1 } }),
      decision: decisionExecute([]),
    });
    const b = await translateDecision({
      ...buildContext({ executorContract: contract, result: { refundId: 1 } }),
      decision: decisionExecute([]),
    });
    const va = a.extraEvents.find((e) => e.kind === "executor_contract_violation");
    const vb = b.extraEvents.find((e) => e.kind === "executor_contract_violation");
    expect(va).toEqual(vb);
  });
});

// ── 012: the executor contract honors the typed ToolClassification ──────────

describe("executor contract: typed ToolClassification (012)", () => {
  const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

  it("a { kind: 'read' } classification reaches ONLY invokeRead, never invokeIntent", async () => {
    // Read-only-ness is a STRUCTURAL claim: the loop routes on the typed
    // discriminant, so the mutating surface is provably never touched for a read.
    const invokeRead = vi.fn(async () => ({ rows: [] }));
    const invokeIntent = vi.fn(async () => ({ refundId: "r-1", refunded: 5000 }));
    const cls: Extract<ToolClassification, { kind: "read" }> = {
      kind: "read",
      name: "list_pix_charges",
      input: { limit: 10 },
    };

    const out = await routeReadThroughKernel({
      classification: cls,
      toolUseId: "tu-1",
      sessionId: "s-1",
      state: {} as State,
      executor: { invokeRead, invokeIntent } as AdopterExecutor<
        "pix.charge.refund",
        Payload,
        State
      >,
      taint: permissiveTaint,
      // 013/T1+T3: auditSink + runtimeContext are required on the READ path.
      auditSink: noopAuditSink(),
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["list_pix_charges"], allowedIntents: [] }),
      nonce: "tu-1",
      historySnapshot: [] as unknown,
    });

    expect(invokeRead).toHaveBeenCalledOnce();
    expect(invokeIntent).not.toHaveBeenCalled();
    expect(out.toolResult.isError).toBeUndefined();
  });

  it("the read executor surface is reached with (name, input, state) — not an envelope", async () => {
    // The READ surface contract is structurally distinct from the intent
    // surface: invokeRead takes the raw (name, input, state), invokeIntent
    // takes an envelope. The typed classification preserves that split.
    const invokeRead = vi.fn(async () => ({ ok: 1 }));
    await routeReadThroughKernel({
      classification: { kind: "read", name: "get_pix_charge", input: { id: "x" } },
      toolUseId: "tu-2",
      sessionId: "s-1",
      state: { marker: "S" } as unknown as State,
      executor: { invokeRead },
      taint: permissiveTaint,
      auditSink: noopAuditSink(),
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["get_pix_charge"], allowedIntents: [] }),
      nonce: "tu-2",
      historySnapshot: [] as unknown,
    });
    expect(invokeRead).toHaveBeenCalledWith("get_pix_charge", { id: "x" }, {
      marker: "S",
    });
  });
});

// ── 013/T1: agent construction REQUIRES a real auditSink (no fail-open default) ──
//
// The durable governance trail is no longer the adopter's optional step. A
// missing `auditSink` is a construction-time TYPE error, and — proving the
// `?? noopAuditSink()` fail-open default is genuinely gone — a sink-less agent
// that reaches a kernel crossing FAILS (TypeError on the required write path)
// rather than silently no-op'ing the audit emission (invariant #6, §C).
describe("013/T1: construction requires a non-optional auditSink", () => {
  type K = "noun.make_pet";
  interface P {
    readonly name: string;
  }
  interface S {
    readonly count: number;
  }
  interface C {
    readonly userId: string;
  }

  function buildExecutePack(): PackV0<K, P, S, C> {
    return {
      id: "exec-contract-013-pack",
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
      } as unknown as PackV0<K, P, S, C>["policy"],
      planner: {
        plan() {
          return {
            visibleReadTools: [] as const,
            allowedIntents: ["noun.make_pet"] as const,
          };
        },
      } as unknown as PackV0<K, P, S, C>["planner"],
      basisCodes: ["state:transition_valid"],
    };
  }

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
    render: () => ({ systemPrompt: "p", maxTokens: 100, toolSchemas: [] }),
  };

  function makeExecutor(): AdopterExecutor<K, P, S> {
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
    sessionId: "s-013",
    userMessage: "make a pet",
    state: { count: 0 },
    context: { userId: "u" },
  };

  it("a sink-less agent reaching a kernel crossing FAILS — there is no silent noopAuditSink() default", async () => {
    // Omit `auditSink` (cast past the now-required type to model an adopter who
    // skipped wiring it). The old code substituted `?? noopAuditSink()` and the
    // turn would silently succeed with NO durable emission. With the fail-open
    // default removed, the required write path (`deps.sink.emit`) is reached with
    // an absent sink and the turn rejects — friction, never bypass.
    const optsWithoutSink = {
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor: makeExecutor(),
    } as unknown as AdjudicatedAgentOptions<K, P, S, C, string[]>;

    const agent = createAdjudicatedAgent<K, P, S, C, string[]>(optsWithoutSink);
    await expect(agent.send(sendInput)).rejects.toThrow();
  });

  it("the SAME agent WITH an explicit auditSink completes — the sink is the only difference", async () => {
    const { noopAuditSink } = await import("@adjudicate/core");
    const agent = createAdjudicatedAgent<K, P, S, C, string[]>({
      pack: buildExecutePack(),
      renderer,
      bridge: bridge(),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor: makeExecutor(),
      auditSink: noopAuditSink(),
    });
    const result = await agent.send(sendInput);
    expect(result.outcome.kind).toBe("completed");
  });

  it("auditSink is a REQUIRED key of AdjudicatedAgentOptions (type-level contract)", () => {
    // If `auditSink` regressed to optional, `Extract<Req, "auditSink">` would be
    // `never` and this object literal would fail to typecheck.
    type Opts = AdjudicatedAgentOptions<K, P, S, C, string[]>;
    type RequiredKeys<T> = {
      [Key in keyof T]-?: object extends Pick<T, Key> ? never : Key;
    }[keyof T];
    type Req = RequiredKeys<Opts>;
    const required: Record<Extract<Req, "auditSink" | "ledger">, true> = {
      auditSink: true,
      ledger: true,
    };
    expect(Object.keys(required).sort()).toEqual(["auditSink", "ledger"]);
  });
});
