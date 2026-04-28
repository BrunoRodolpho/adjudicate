import { describe, expect, it, vi } from "vitest";
import {
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
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
interface State {
  // intentionally empty — kernel state is not exercised in these unit tests
}

const envelope: IntentEnvelope<"pix.charge.refund", Payload> = {
  version: 2,
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  createdAt: new Date().toISOString(),
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  intentHash: "f".repeat(64),
};

const rewrittenEnvelope: IntentEnvelope<"pix.charge.refund", Payload> = {
  ...envelope,
  payload: { amountCentavos: 3000 },
  intentHash: "e".repeat(64),
};

function buildContext(opts?: { executor?: AdopterExecutor<"pix.charge.refund", Payload, State> }) {
  const executor: AdopterExecutor<"pix.charge.refund", Payload, State> =
    opts?.executor ?? {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => ({ refundId: "r-1", refunded: 5000 })),
    };
  return {
    envelope,
    toolUseId: "tu-1",
    sessionId: "s-1",
    state: {} as State,
    executor,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore(),
    historySnapshot: [],
    rk: (raw: string) => raw,
    generateToken: () => "ct-fixed",
  };
}

describe("translateDecision", () => {
  it("EXECUTE → invokes executor, returns JSON tool_result, continues", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
    });
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.type).toBe("tool_result");
    expect(t.toolResult?.tool_use_id).toBe("tu-1");
    expect(t.toolResult?.is_error).toBeUndefined();
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
    const content = JSON.parse(t.toolResult?.content as string);
    expect(content).toMatchObject({
      ok: true,
      result: { refundId: "r-1" },
    });
  });

  it("REFUSE → tool_result with userFacing text, is_error=true, continues", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionRefuse(
        refuse(
          "BUSINESS_RULE",
          "pix.charge.amount_invalid",
          "That amount is not allowed.",
        ),
        [],
      ),
    });
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.is_error).toBe(true);
    expect(t.toolResult?.content).toBe("That amount is not allowed.");
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("REWRITE → invokes executor with rewritten envelope, surfaces note, continues", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionRewrite(rewrittenEnvelope, "amount clamped to original", []),
    });
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(
      rewrittenEnvelope,
      {},
    );
    const content = JSON.parse(t.toolResult?.content as string);
    expect(content).toMatchObject({
      ok: true,
      note: expect.stringContaining("amount clamped to original"),
    });
  });

  it("REQUEST_CONFIRMATION → persists pending entry, returns pause_for_user_confirmation", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionRequestConfirmation(
        "Confirm a refund of R$ 600?",
        [],
      ),
    });
    expect(t.loopAction).toEqual({
      kind: "pause_for_user_confirmation",
      prompt: "Confirm a refund of R$ 600?",
      token: "ct-fixed",
    });
    const taken = await ctx.confirmationStore.take("ct-fixed");
    expect(taken).not.toBeNull();
    expect(taken?.envelope).toEqual(envelope);
    expect(t.toolResult?.content).toContain("Confirm a refund of R$ 600?");
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("ESCALATE → returns complete_for_escalation; executor not called", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionEscalate(
        "supervisor",
        "Refund above threshold",
        [],
      ),
    });
    expect(t.loopAction).toEqual({
      kind: "complete_for_escalation",
      to: "supervisor",
      reason: "Refund above threshold",
    });
    expect(t.toolResult?.content).toContain("Escalated to supervisor");
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("DEFER → parks in deferStore, returns pause_for_defer", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionDefer("payment.confirmed", 15 * 60 * 1000, []),
    });
    expect(t.loopAction).toEqual({
      kind: "pause_for_defer",
      signal: "payment.confirmed",
      intentHash: envelope.intentHash,
    });
    // Parked envelope should be retrievable from the store.
    const parkedRaw = await ctx.deferStore.get("defer:pending:s-1");
    expect(parkedRaw).not.toBeNull();
    const parked = JSON.parse(parkedRaw as string);
    expect(parked.envelope.intentHash).toBe(envelope.intentHash);
    expect(parked.signal).toBe("payment.confirmed");
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("EXECUTE with throwing executor → is_error tool_result, loop continues", async () => {
    const executor: AdopterExecutor<"pix.charge.refund", Payload, State> = {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => {
        throw new Error("provider down");
      }),
    };
    const ctx = buildContext({ executor });
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
    });
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.is_error).toBe(true);
    expect(t.toolResult?.content).toContain("provider down");
  });
});
