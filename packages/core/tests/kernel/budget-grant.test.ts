/**
 * 025 — kernel-side `budgetGrant` substitution semantics (capabilities-as-budgets).
 *
 * A human-granted, BOUNDED, STANDING pre-authorization the impure shell asserts
 * so a CLASS of intents can satisfy the "ask first" threshold WITHOUT a per-intent
 * confirmation receipt — up to the grant's limit per window (the shell burns it
 * down atomically before asserting; the kernel only substitutes EXECUTE for the
 * threshold-style outcome, exactly as the confirmation-receipt override does).
 *
 * Pinned (mirrors confirmation-receipt.test.ts):
 *   1. matching grant (intentKind === envelope.kind) + REQUEST_CONFIRMATION →
 *      EXECUTE override with original basis preserved + budget:satisfied appended.
 *   2. grant for a DIFFERENT kind → no override (decision flows through). Prevents
 *      a budget for kind A satisfying an intent of kind B.
 *   3. Other Decisions (REFUSE, REWRITE, ESCALATE, DEFER, EXECUTE) flow through
 *      UNCHANGED even with a matching grant — monotonicity-preserving (§C), the
 *      kernel never weakens a state/taint/auth/business guard.
 *   4. supersedes is `budget_satisfied`, links back to the original intentHash,
 *      and carries the grant's budgetId as `token`.
 *   5. with override + EXECUTE: ledger is claimed (race-loss flip works
 *      identically to a natural EXECUTE) — budget burn is observable in the ledger.
 *   6. no grant supplied → REQUEST_CONFIRMATION stands (back-compat, default OFF).
 */

import { describe, expect, it } from "vitest";
import { adjudicateAndAudit, type Guard } from "../../src/kernel/index.js";
import {
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
} from "../../src/decision.js";
import { refuse } from "../../src/refusal.js";
import { buildEnvelope, type IntentEnvelope } from "../../src/envelope.js";
import type { AuditRecord, BudgetGrant, Ledger } from "../../src/index.js";
import type { AuditSink } from "../../src/sink.js";
import type { TaintPolicy } from "../../src/taint.js";

const permissive: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function envOf(kind: string, nonce: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-budget-test" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: "2026-06-19T12:00:00.000Z",
  });
}

function captureSink(): { sink: AuditSink; records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return { sink: { async emit(r) { records.push(r); } }, records };
}

function makeMemLedger(): Ledger {
  const map = new Map<
    string,
    { resourceVersion: string; at: string; sessionId: string; kind: string }
  >();
  return {
    async checkLedger(intentHash) {
      return map.get(intentHash) ?? null;
    },
    async recordExecution(entry) {
      if (map.has(entry.intentHash)) return "exists";
      map.set(entry.intentHash, {
        resourceVersion: entry.resourceVersion,
        at: new Date().toISOString(),
        sessionId: entry.sessionId,
        kind: entry.kind,
      });
      return "acquired";
    },
  };
}

const askConfirm: Guard<string, unknown, unknown> = () =>
  decisionRequestConfirmation("Confirm this transfer?", []);

const grantFor = (intentKind: string): BudgetGrant => ({
  budgetId: "bud-001",
  intentKind,
  limit: 10,
  windowSeconds: 3600,
});

describe("budgetGrant substitution (025 capabilities-as-budgets)", () => {
  it("REQUEST_CONFIRMATION + matching grant → EXECUTE with budget:satisfied basis", async () => {
    const env = envOf("pix.charge.create", "n-match");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    // Original guard's basis preserved + budget:satisfied appended.
    expect(codes).toContain("budget:satisfied");
    // The budget basis carries the grant's identity in detail.
    const budgetBasis = result.decision.basis.find(
      (b) => b.category === "budget",
    );
    expect(budgetBasis?.detail).toMatchObject({
      budgetId: "bud-001",
      intentKind: "pix.charge.create",
      limit: 10,
      windowSeconds: 3600,
    });
    // Exactly one audit record (no double-emission inside the kernel call).
    expect(records).toHaveLength(1);
    expect(records[0]!.decision.kind).toBe("EXECUTE");
  });

  it("supersedes is budget_satisfied, links the original hash, and carries budgetId as token", async () => {
    const env = envOf("pix.charge.create", "n-supersede");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    expect(records[0]!.supersedes?.reason).toBe("budget_satisfied");
    expect(records[0]!.supersedes?.predecessorIntentHash).toBe(env.intentHash);
    expect(records[0]!.supersedes?.token).toBe("bud-001");
  });

  it("grant for a DIFFERENT kind → no override (REQUEST_CONFIRMATION stands)", async () => {
    const env = envOf("pix.charge.create", "n-kind-mismatch");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      // Grant authorizes refund, but the intent is a create.
      { sink, budgetGrant: grantFor("pix.charge.refund") },
    );

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("no grant supplied → REQUEST_CONFIRMATION stands (back-compat, default OFF)", async () => {
    const env = envOf("pix.charge.create", "n-no-grant");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      { sink },
    );

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("REFUSE flows through unchanged even with a matching grant (state-change detection preserved)", async () => {
    const env = envOf("pix.charge.create", "n-refuse");
    const { sink } = captureSink();

    // A state change since the first pass: a state guard now REFUSEs (e.g. the
    // account was frozen). The budget MUST NOT silently turn a REFUSE into EXECUTE.
    const refuseGuard: Guard<string, unknown, unknown> = () =>
      decisionRefuse(refuse("STATE", "transition_illegal", "account frozen"), []);

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [refuseGuard], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("REFUSE");
  });

  it("ESCALATE flows through unchanged even with a matching grant", async () => {
    const env = envOf("pix.charge.create", "n-escalate");
    const { sink } = captureSink();
    const escalateGuard: Guard<string, unknown, unknown> = () =>
      decisionEscalate("human", "over the budget-capable risk band", []);

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [escalateGuard], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("ESCALATE");
  });

  it("DEFER flows through unchanged even with a matching grant", async () => {
    const env = envOf("pix.charge.create", "n-defer");
    const { sink } = captureSink();
    const deferGuard: Guard<string, unknown, unknown> = () =>
      decisionDefer("payment.webhook", 30_000, []);

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [deferGuard], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("DEFER");
  });

  it("REWRITE flows through unchanged even with a matching grant (no budget basis, no EXECUTE flip from the budget branch)", async () => {
    const env = envOf("pix.charge.create", "n-rewrite");
    const { sink } = captureSink();
    // A REWRITE that re-adjudicates to EXECUTE on the rewritten envelope (the
    // validated-REWRITE path). The sanitizing guard fires ONLY on the unsanitized
    // payload (x === 1), rewriting to x === 0 so the second pass does NOT
    // re-trigger and falls through to the EXECUTE default → outcome stays REWRITE.
    // The budget branch must NOT fire (it only gates on REQUEST_CONFIRMATION).
    const rewriteGuard: Guard<string, unknown, unknown> = (e) => {
      const p = e.payload as { x: number };
      if (p.x !== 1) return null;
      return decisionRewrite(
        buildEnvelope({
          kind: e.kind,
          payload: { x: 0 },
          actor: e.actor,
          taint: e.taint,
          nonce: e.nonce,
          createdAt: e.createdAt,
        }) as IntentEnvelope,
        "sanitized",
        [],
      );
    };

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [rewriteGuard], default: "EXECUTE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("REWRITE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    expect(codes).not.toContain("budget:satisfied");
  });

  it("EXECUTE + matching grant → still EXECUTE, no budget basis (no double-EXECUTE)", async () => {
    const env = envOf("pix.charge.create", "n-execute");
    const { sink } = captureSink();
    const exec: Guard<string, unknown, unknown> = () => decisionExecute([]);

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [exec], default: "REFUSE" },
      { sink, budgetGrant: grantFor("pix.charge.create") },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    expect(codes).not.toContain("budget:satisfied");
  });

  it("budget override + ledger: claims the ledger key on first call, REPLAY_SUPPRESSED on second (burn observable in ledger)", async () => {
    const env = envOf("pix.charge.create", "n-ledger");
    const ledger = makeMemLedger();
    const { sink } = captureSink();
    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissive,
      business: [askConfirm],
      default: "REFUSE" as const,
    };
    const deps = { sink, ledger, budgetGrant: grantFor("pix.charge.create") };

    const first = await adjudicateAndAudit(env, {}, policy, deps);
    expect(first.decision.kind).toBe("EXECUTE");

    const second = await adjudicateAndAudit(env, {}, policy, deps);
    expect(second.decision.kind).toBe("REFUSE");
    expect(
      second.decision.basis.some(
        (b) => `${b.category}:${b.code}` === "ledger:replay_suppressed",
      ),
    ).toBe(true);
  });

  it("confirmationReceipt wins over budgetGrant when BOTH match (no double-substitution)", async () => {
    const env = envOf("pix.charge.create", "n-both");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [askConfirm], default: "REFUSE" },
      {
        sink,
        confirmationReceipt: { intentHash: env.intentHash, at: "2026-06-19T12:00:01.000Z" },
        budgetGrant: grantFor("pix.charge.create"),
      },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    // The receipt branch (2a) runs first and substitutes EXECUTE, so the budget
    // branch's REQUEST_CONFIRMATION gate no longer holds: confirmation basis only.
    expect(codes).toContain("confirmation:received");
    expect(codes).not.toContain("budget:satisfied");
    expect(records[0]!.supersedes?.reason).toBe("confirmation_resolved");
  });
});
