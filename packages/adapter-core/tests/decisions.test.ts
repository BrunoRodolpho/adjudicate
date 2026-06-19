import { describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  deriveIntentHash,
  refuse,
  type AuditRecord,
  type AuditSink,
  type IntentEnvelope,
  type TaintPolicy,
} from "@adjudicate/core";
import {
  readAuthorizationPolicy,
  routeReadThroughKernel,
  translateDecision,
} from "../src/decisions.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import { createMemoryLedger } from "../src/index.js";
import { createRuntimeContext } from "@adjudicate/core/kernel";
import type { AdopterExecutor, ToolClassification } from "../src/types.js";

interface Payload {
  amountCentavos: number;
}
interface State {
  // intentionally empty — kernel state is not exercised in these unit tests
}

// 011/T4: rewritten envelopes carry a REAL content-addressed intentHash —
// `runExecute` re-derives and fail-closed-verifies the rewritten hash before
// executing it, so a fixture with a fake hash would (correctly) be refused.
const envelope: IntentEnvelope<"pix.charge.refund", Payload> = buildEnvelope({
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  createdAt: "2026-04-29T12:00:00.000Z",
});

const rewrittenEnvelope: IntentEnvelope<"pix.charge.refund", Payload> =
  buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 3000 },
    nonce: "n-1",
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

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
    confirmationStore: createInMemoryConfirmationStore<unknown>(),
    historySnapshot: [] as unknown,
    rk: (raw: string) => raw,
    generateToken: () => "ct-fixed",
  };
}

describe("translateDecision (adapter-core)", () => {
  it("EXECUTE → invokes executor, returns JSON tool_result, continues", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
    });
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.toolUseId).toBe("tu-1");
    expect(t.toolResult?.isError).toBeUndefined();
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
    const content = JSON.parse(t.toolResult?.content as string);
    expect(content).toMatchObject({
      ok: true,
      result: { refundId: "r-1" },
    });
  });

  it("REFUSE → tool_result with userFacing text, isError=true, continues", async () => {
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
    expect(t.toolResult?.isError).toBe(true);
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
    // 011/T4: the executor runs the REWRITTEN envelope (not the original) — the
    // executed bytes are the rewritten ones the kernel already re-adjudicated.
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(
      rewrittenEnvelope,
      {},
    );
    const calledWith = (ctx.executor.invokeIntent as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0] as IntentEnvelope;
    expect(calledWith.intentHash).toBe(rewrittenEnvelope.intentHash);
    expect(calledWith.intentHash).not.toBe(envelope.intentHash);
    const content = JSON.parse(t.toolResult?.content as string);
    expect(content).toMatchObject({
      ok: true,
      note: expect.stringContaining("amount clamped to original"),
    });
  });

  it("REWRITE with a forged rewritten intentHash → fail-closed, executor NOT called (011/T4)", async () => {
    // A Decision spliced in OUTSIDE the audited kernel path could carry a
    // rewritten envelope whose intentHash does not re-derive from its content.
    // runExecute re-derives and refuses to execute it.
    const forged: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...rewrittenEnvelope,
      payload: { amountCentavos: 999999 }, // content changed; hash now stale
    };
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionRewrite(forged, "forged rewrite", []),
    });
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.isError).toBe(true);
    expect(t.toolResult?.content).toContain("could not be verified");
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

  it("EXECUTE with throwing executor → isError tool_result, loop continues", async () => {
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
    expect(t.toolResult?.isError).toBe(true);
    expect(t.toolResult?.content).toContain("provider down");
  });
});

// ── 023: resource-binding at the executor seam (anti-IDOR) ───────────────────
//
// The executor must honor ONLY the kernel-bound (signed) payload. `runExecute`
// re-derives the envelope's intentHash and constant-time-compares it BEFORE
// invokeIntent: a payload / resourceRefs swapped AFTER the kernel decision
// fail-closes and the executor is NOT reached (invariants #1, #6). These tests
// integrate with the SAME seam shared by 011 (REWRITE re-verify) / 012 (read
// routing) / 013 (required sink) — none is weakened.
describe("023 resource-binding (executor honors the kernel-bound payload)", () => {
  it("EXECUTE on a correctly-bound envelope → invokeIntent reached, executes", async () => {
    const ctx = buildContext();
    const t = await translateDecision({ ...ctx, decision: decisionExecute([]) });
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });

  it("ANTI-IDOR: an EXECUTE whose payload was swapped after the decision → NOT reached, fail-closed", async () => {
    // The kernel decided EXECUTE over `envelope`. A swap substitutes a different
    // payload (a bigger refund) while keeping the stale, kernel-bound intentHash
    // — exactly the resource-swap an LLM would attempt between decision and
    // execution. The binding re-derives a different hash and refuses.
    const swapped: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...envelope,
      payload: { amountCentavos: 999_999 }, // intentHash now stale
    };
    expect(deriveIntentHash(swapped)).not.toBe(swapped.intentHash); // proof it's a swap
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
      envelope: swapped,
    });
    // Non-vacuous: the executor is NEVER invoked, and a binding-mismatch error
    // surfaces. (Without 023 the swapped payload would have been executed.)
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.loopAction).toEqual({ kind: "continue" });
    expect(t.toolResult?.isError).toBe(true);
    expect(t.toolResult?.content).toContain("resource binding mismatch");
  });

  it("ANTI-IDOR: a resourceRefs account swap → NOT reached (031 authorization target bound)", async () => {
    // The classic IDOR: keep the refund amount, repoint the `account` target at
    // a victim's account after the kernel decided.
    const bound = buildEnvelope<"pix.charge.refund", Payload>({
      kind: "pix.charge.refund",
      payload: { amountCentavos: 5000 },
      nonce: "n-refs",
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      resourceRefs: { account: "acct_OWNER" },
    });
    const swappedRefs: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...bound,
      resourceRefs: { account: "acct_VICTIM" }, // hash now stale
    };
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
      envelope: swappedRefs,
    });
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });

  it("REWRITE path still re-verifies (011 coexistence): a valid rewritten envelope binds and executes", async () => {
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionRewrite(rewrittenEnvelope, "amount clamped", []),
    });
    // 011 contract intact: the executor runs the REWRITTEN bytes (re-verified by
    // the same binding fence) — not the original.
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(rewrittenEnvelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });

  it("policy=off restores the pre-023 seam: a swapped payload executes (rollback dial)", async () => {
    // The documented rollback (§7): with the binding disabled the executor seam
    // behaves exactly as pre-023. This proves the gate is what blocks the swap.
    const swapped: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...envelope,
      payload: { amountCentavos: 999_999 },
    };
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
      envelope: swapped,
      resourceBindingPolicy: "off",
    });
    expect(ctx.executor.invokeIntent).toHaveBeenCalledWith(swapped, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });

  it("policy=warn still fail-closes a swap (friction never decreases, §C)", async () => {
    const swapped: IntentEnvelope<"pix.charge.refund", Payload> = {
      ...envelope,
      payload: { amountCentavos: 999_999 },
    };
    const ctx = buildContext();
    const t = await translateDecision({
      ...ctx,
      decision: decisionExecute([]),
      envelope: swapped,
      resourceBindingPolicy: "warn",
    });
    expect(ctx.executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });
});

// ── 012: READ through the kernel ────────────────────────────────────────────

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
// A taint policy that marks one READ tool name as TRUSTED-only — an UNTRUSTED
// read of it must NOT be served (taint gate fires).
const protectedReadTaint: TaintPolicy = {
  minimumFor: (kind) => (kind === "list_secret_charges" ? "TRUSTED" : "UNTRUSTED"),
};

function readClassification(
  name: string,
  input: unknown,
): Extract<ToolClassification, { kind: "read" }> {
  return { kind: "read", name, input };
}

/** Capturing sink so tests can assert the READ produced a durable AuditRecord. */
function capturingSink(): AuditSink & { records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return {
    records,
    async emit(r: AuditRecord) {
      records.push(r);
    },
  };
}

describe("routeReadThroughKernel (012 — READ crosses the kernel)", () => {
  it("builds a real content-addressed read envelope and emits an AuditRecord", async () => {
    const sink = capturingSink();
    const invokeRead = vi.fn(async () => ({ charges: [{ id: "c-1" }] }));
    const decisionEvents: unknown[] = [];

    const out = await routeReadThroughKernel({
      classification: readClassification("list_charges", { limit: 5 }),
      toolUseId: "tu-read-1",
      sessionId: "s-1",
      state: {} as State,
      executor: { invokeRead },
      taint: permissiveTaint,
      auditSink: sink,
      ledger: createMemoryLedger(),
      // 013/T3: runtimeContext is required — the kill-switch is always consulted
      // on the READ path. A fresh non-killed context isolates this test.
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["list_charges"], allowedIntents: [] }),
      nonce: "tu-read-1",
      historySnapshot: [] as unknown,
    });

    // The READ crossed adjudicateAndAudit: a durable AuditRecord exists and the
    // intent_proposed/decision events were emitted (the kernel decided).
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.envelope.kind).toBe("list_charges");
    const proposed = out.extraEvents.find((e) => e.kind === "intent_proposed");
    if (proposed?.kind !== "intent_proposed") throw new Error("no intent_proposed");
    // The envelope hash re-derives from its own content (no fake fast-path hash).
    expect(deriveIntentHash(proposed.envelope)).toBe(proposed.envelope.intentHash);
    expect(proposed.envelope.taint).toBe("UNTRUSTED");
    const decision = out.extraEvents.find((e) => e.kind === "decision");
    if (decision?.kind === "decision") decisionEvents.push(decision.decision.kind);
    expect(decisionEvents).toEqual(["EXECUTE"]);

    // Served only AFTER the kernel authorized it.
    expect(invokeRead).toHaveBeenCalledWith("list_charges", { limit: 5 }, {});
    const body = JSON.parse(out.toolResult.content);
    expect(body).toEqual({ ok: true, result: { charges: [{ id: "c-1" }] } });
    expect(out.toolResult.isError).toBeUndefined();
  });

  it("a taint-protected READ under UNTRUSTED is REFUSED — invokeRead NEVER runs", async () => {
    const sink = capturingSink();
    const invokeRead = vi.fn(async () => ({ secret: true }));

    const out = await routeReadThroughKernel({
      classification: readClassification("list_secret_charges", {}),
      toolUseId: "tu-read-2",
      sessionId: "s-1",
      state: {} as State,
      executor: { invokeRead },
      taint: protectedReadTaint,
      auditSink: sink,
      runtimeContext: createRuntimeContext(),
      plan: () => ({
        visibleReadTools: ["list_secret_charges"],
        allowedIntents: [],
      }),
      nonce: "tu-read-2",
      historySnapshot: [] as unknown,
    });

    // No direct unadjudicated dispatch: the kernel REFUSED on taint, so the
    // read-only executor surface was never touched.
    expect(invokeRead).not.toHaveBeenCalled();
    expect(out.toolResult.isError).toBe(true);
    // The refusal was still audited (sink applies uniformly to reads).
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.decision.kind).toBe("REFUSE");
    const decision = out.extraEvents.find((e) => e.kind === "decision");
    if (decision?.kind !== "decision") throw new Error("no decision event");
    expect(decision.decision.kind).toBe("REFUSE");
  });

  it("a throwing read executor surfaces an isError result AFTER kernel EXECUTE", async () => {
    const invokeRead = vi.fn(async () => {
      throw new Error("read backend down");
    });
    const out = await routeReadThroughKernel({
      classification: readClassification("get_charge", { id: "c-9" }),
      toolUseId: "tu-read-3",
      sessionId: "s-1",
      state: {} as State,
      executor: { invokeRead },
      taint: permissiveTaint,
      auditSink: capturingSink(),
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["get_charge"], allowedIntents: [] }),
      nonce: "tu-read-3",
      historySnapshot: [] as unknown,
    });
    expect(invokeRead).toHaveBeenCalledOnce();
    expect(out.toolResult.isError).toBe(true);
    expect(out.toolResult.content).toContain("read backend down");
  });

  it("readAuthorizationPolicy runs taint and defaults EXECUTE for reads only", () => {
    const policy = readAuthorizationPolicy(permissiveTaint);
    // No mutation guards leak in — reads are authorized via taint + default.
    expect(policy.stateGuards).toEqual([]);
    expect(policy.authGuards).toEqual([]);
    expect(policy.business).toEqual([]);
    expect(policy.default).toBe("EXECUTE");
    expect(policy.taint).toBe(permissiveTaint);
  });

  // ── 013/T1+T6: the REQUIRED auditSink is threaded verbatim — no noop sub ──
  //
  // The 012 read path used to fall back to `ctx.auditSink ?? noopAuditSink()`.
  // With the fail-open default removed, the EXACT supplied sink must receive the
  // AuditRecord on BOTH an EXECUTE (served read) and a non-EXECUTE (REFUSE). A
  // silent `noopAuditSink()` substitution would leave the supplied sink empty.
  it("013: the supplied (required) auditSink — not a noop substitute — receives the record on EXECUTE", async () => {
    const sink = capturingSink();
    const invokeRead = vi.fn(async () => ({ ok: true }));
    const out = await routeReadThroughKernel({
      classification: readClassification("list_charges", { limit: 1 }),
      toolUseId: "tu-013-exec",
      sessionId: "s-013",
      state: {} as State,
      executor: { invokeRead },
      taint: permissiveTaint,
      auditSink: sink,
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["list_charges"], allowedIntents: [] }),
      nonce: "tu-013-exec",
      historySnapshot: [] as unknown,
    });
    // The EXACT supplied sink instance captured the EXECUTE record (no noop sub).
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.decision.kind).toBe("EXECUTE");
    expect(out.toolResult.isError).toBeUndefined();
    expect(invokeRead).toHaveBeenCalledOnce();
  });

  it("013: a fresh non-killed runtimeContext does NOT refuse — fail-closed wiring still authorizes a clean read", async () => {
    // T3 fail-closes only when the kill-switch control is absent/active; a real,
    // non-killed context still authorizes (no over-restriction of clean traffic).
    const sink = capturingSink();
    const invokeRead = vi.fn(async () => ({ ok: true }));
    const out = await routeReadThroughKernel({
      classification: readClassification("list_charges", {}),
      toolUseId: "tu-013-ctx",
      sessionId: "s-013",
      state: {} as State,
      executor: { invokeRead },
      taint: permissiveTaint,
      auditSink: sink,
      runtimeContext: createRuntimeContext(),
      plan: () => ({ visibleReadTools: ["list_charges"], allowedIntents: [] }),
      nonce: "tu-013-ctx",
      historySnapshot: [] as unknown,
    });
    expect(sink.records[0]?.decision.kind).toBe("EXECUTE");
    expect(out.toolResult.isError).toBeUndefined();
  });
});
