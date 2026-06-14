import { describe, expect, it, vi } from "vitest";
import {
  decisionExecute,
  decisionRewrite,
  type ExecutorContract,
  type IntentEnvelope,
} from "@adjudicate/core";
import { translateDecision } from "../src/decisions.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import type { AdopterExecutor } from "../src/types.js";

interface Payload {
  amountCentavos: number;
}
type State = Record<string, never>;

const envelope: IntentEnvelope<"pix.charge.refund", Payload> = {
  version: 2,
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  createdAt: "2026-04-29T12:00:00.000Z",
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  intentHash: "f".repeat(64),
};

const rewritten: IntentEnvelope<"pix.charge.refund", Payload> = {
  ...envelope,
  payload: { amountCentavos: 3000 },
  intentHash: "e".repeat(64),
};

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
