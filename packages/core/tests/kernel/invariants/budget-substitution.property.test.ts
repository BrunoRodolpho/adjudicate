/**
 * Invariant (025 — capabilities-as-budgets): the budget substitution is an
 * ADDITIVE, REPLAYABLE §C carve-out that flips ONLY REQUEST_CONFIRMATION →
 * EXECUTE and NEVER weakens any other outcome (index §C / §D #2 / §D #5).
 *
 * Pins (non-vacuous — exercises real kernel adjudication over every other kind):
 *   1. Non-flip: with a matching grant, ONLY a REQUEST_CONFIRMATION decision is
 *      substituted to EXECUTE; REFUSE/REWRITE/ESCALATE/DEFER/EXECUTE are returned
 *      byte-identically (monotonicity-preserving — the kernel never weakens a
 *      state/taint/auth/business guard).
 *   2. Determinism fence — ADDITIVE: a kernel call with NO `budgetGrant` produces
 *      a byte-identical `auditHash` to the pre-025 path. The additive deps slot
 *      cannot perturb the recorded record when it is omitted.
 *   3. Determinism fence — REPLAYABLE (§D #5): the SAME grant + SAME clock yields
 *      a byte-identical decision AND `auditHash` on replay. Re-running the pure
 *      kernel over the recorded inputs reproduces the bit-identical record.
 *   4. Closed algebra: the substituted decision is still one of the SIX closed
 *      kinds — no 7th outcome, no `confidence`/free metadata on the Decision.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { adjudicateAndAudit, type Guard } from "../../../src/kernel/index.js";
import {
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  type DecisionKind,
} from "../../../src/decision.js";
import { refuse } from "../../../src/refusal.js";
import { buildEnvelope, type IntentEnvelope } from "../../../src/envelope.js";
import type { AuditRecord, BudgetGrant } from "../../../src/index.js";
import type { AuditSink } from "../../../src/sink.js";
import type { TaintPolicy } from "../../../src/taint.js";
import type { AdjudicateAndAuditClock } from "../../../src/kernel/adjudicate-and-audit.js";

const permissive: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const CLOSED_KINDS: readonly DecisionKind[] = [
  "EXECUTE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "ESCALATE",
  "REFUSE",
];

function envOf(kind: string, nonce: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-budget-inv" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: "2026-06-19T00:00:00.000Z",
  });
}

function captureSink(): { sink: AuditSink; records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return { sink: { async emit(r) { records.push(r); } }, records };
}

// A fixed clock so the auditHash pre-image (which binds `at`) is replay-stable.
const fixedClock: AdjudicateAndAuditClock = {
  nowIso: () => "2026-06-19T00:00:01.000Z",
  nowMs: () => 0,
};

// Guards that produce a non-EXECUTE, non-confirmation outcome on the FIRST pass.
// (REWRITE re-adjudicates the rewritten envelope; its second pass uses the same
// policy default = REFUSE so it stays a REWRITE only when the rewritten EXECUTEs;
// here we keep default REFUSE so the rewrite stays a REFUSE — still NOT EXECUTE.)
function guardFor(kind: Exclude<DecisionKind, "REQUEST_CONFIRMATION">): Guard<string, unknown, unknown> {
  switch (kind) {
    case "EXECUTE":
      return () => decisionExecute([]);
    case "REFUSE":
      return () => decisionRefuse(refuse("STATE", "transition_illegal", "no"), []);
    case "ESCALATE":
      return () => decisionEscalate("human", "review", []);
    case "DEFER":
      return () => decisionDefer("sig", 30_000, []);
    case "REWRITE":
      // Sanitizing rewrite: fires ONLY on the unsanitized payload (x === 1) and
      // rewrites to x === 0, so the second-pass re-adjudication of the rewritten
      // envelope does NOT re-trigger the rewrite — it falls through to the policy
      // default (EXECUTE), keeping the outcome a validated REWRITE.
      return (e) => {
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
  }
}

const grant: BudgetGrant = {
  budgetId: "bud-inv",
  intentKind: "test.budget.kind",
  limit: 5,
  windowSeconds: 600,
};

describe("025 invariant: budget substitution flips ONLY REQUEST_CONFIRMATION", () => {
  it("non-flip: a matching grant never weakens REFUSE/REWRITE/ESCALATE/DEFER/EXECUTE", async () => {
    // Each non-confirmation kind, with the policy default that lets that outcome
    // be the final one. (A REWRITE re-adjudicates the rewritten envelope; with
    // default EXECUTE the rewritten envelope EXECUTEs so the outcome STAYS
    // REWRITE — the real "validated REWRITE" path.)
    const cases: ReadonlyArray<{
      readonly k: Exclude<DecisionKind, "REQUEST_CONFIRMATION">;
      readonly def: "REFUSE" | "EXECUTE";
    }> = [
      { k: "EXECUTE", def: "REFUSE" },
      { k: "REFUSE", def: "REFUSE" },
      { k: "ESCALATE", def: "REFUSE" },
      { k: "DEFER", def: "REFUSE" },
      { k: "REWRITE", def: "EXECUTE" },
    ];
    let exercised = 0;
    for (const { k, def } of cases) {
      const env = envOf("test.budget.kind", `n-nonflip-${k}`);
      const { sink } = captureSink();
      const result = await adjudicateAndAudit(
        env,
        {},
        { stateGuards: [], authGuards: [], taint: permissive, business: [guardFor(k)], default: def },
        { sink, budgetGrant: grant, clock: fixedClock },
      );
      // The kind is returned unchanged (the budget branch only gates on
      // REQUEST_CONFIRMATION), and the budget basis NEVER appears — the kernel
      // never weakens a non-confirmation outcome via a budget.
      expect(result.decision.kind).toBe(k);
      expect(
        result.decision.basis.some((b) => b.category === "budget"),
      ).toBe(false);
      expect(CLOSED_KINDS).toContain(result.decision.kind);
      exercised++;
    }
    // Non-vacuity: every non-confirmation kind was actually sampled.
    expect(exercised).toBe(5);
  });

  it("flip: a matching grant substitutes REQUEST_CONFIRMATION → EXECUTE (closed algebra: EXECUTE, no extra Decision fields)", async () => {
    const env = envOf("test.budget.kind", "n-flip");
    const { sink } = captureSink();
    const ask: Guard<string, unknown, unknown> = () =>
      decisionRequestConfirmation("sure?", []);
    const result = await adjudicateAndAudit(
      env,
      {},
      { stateGuards: [], authGuards: [], taint: permissive, business: [ask], default: "REFUSE" },
      { sink, budgetGrant: grant, clock: fixedClock },
    );
    expect(result.decision.kind).toBe("EXECUTE");
    expect(CLOSED_KINDS).toContain(result.decision.kind);
    // Closed algebra: an EXECUTE decision has exactly { kind, basis } — no
    // `confidence`/free metadata leaked onto the Decision by the substitution.
    expect(Object.keys(result.decision).sort()).toEqual(["basis", "kind"]);
  });
});

describe("025 invariant: determinism fence", () => {
  const ask: Guard<string, unknown, unknown> = () =>
    decisionRequestConfirmation("sure?", []);
  const policy = {
    stateGuards: [],
    authGuards: [],
    taint: permissive,
    business: [ask],
    default: "REFUSE" as const,
  };

  it("ADDITIVE: omitting budgetGrant yields a byte-identical auditHash to the pre-025 path", async () => {
    // Same envelope, same fixed clock, but the budget branch must change NOTHING
    // when no grant is asserted. Two no-grant calls → identical auditHash; AND a
    // record built with a non-matching-kind grant (which never substitutes) is
    // also byte-identical, proving the slot is inert unless it actually fires.
    const env = envOf("test.budget.kind", "n-additive");
    const a = captureSink();
    const b = captureSink();
    const c = captureSink();
    await adjudicateAndAudit(env, {}, policy, { sink: a.sink, clock: fixedClock });
    await adjudicateAndAudit(env, {}, policy, { sink: b.sink, clock: fixedClock });
    await adjudicateAndAudit(env, {}, policy, {
      sink: c.sink,
      // A grant for a DIFFERENT kind never substitutes → record stays inert.
      budgetGrant: { ...grant, intentKind: "some.other.kind" },
      clock: fixedClock,
    });
    expect(a.records[0]!.decision.kind).toBe("REQUEST_CONFIRMATION");
    expect(a.records[0]!.auditHash).toBe(b.records[0]!.auditHash);
    expect(c.records[0]!.auditHash).toBe(a.records[0]!.auditHash);
    expect(c.records[0]!.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("REPLAYABLE (§D #5): same grant + same clock yields byte-identical decision and auditHash", async () => {
    const env = envOf("test.budget.kind", "n-replay");
    const first = captureSink();
    const second = captureSink();
    await adjudicateAndAudit(env, {}, policy, {
      sink: first.sink,
      budgetGrant: grant,
      clock: fixedClock,
    });
    await adjudicateAndAudit(env, {}, policy, {
      sink: second.sink,
      budgetGrant: grant,
      clock: fixedClock,
    });
    expect(first.records[0]!.decision).toEqual(second.records[0]!.decision);
    expect(first.records[0]!.auditHash).toBe(second.records[0]!.auditHash);
    // The replayable record carries the budget basis + supersession.
    expect(
      first.records[0]!.decision.basis.some((b) => b.category === "budget"),
    ).toBe(true);
    expect(first.records[0]!.supersedes?.reason).toBe("budget_satisfied");
  });

  it("property: over random budget-capable kinds, a matching grant flips confirmation and a mismatched grant does not", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 12 }).filter((s) => /^[a-z.]+$/.test(s)),
        fc.boolean(),
        async (kind, matches) => {
          const env = envOf(kind, `n-prop-${kind}-${matches}`);
          const { sink } = captureSink();
          const g: BudgetGrant = {
            budgetId: "bud-prop",
            intentKind: matches ? kind : `${kind}.other`,
            limit: 3,
            windowSeconds: 60,
          };
          const result = await adjudicateAndAudit(
            env,
            {},
            policy,
            { sink, budgetGrant: g, clock: fixedClock },
          );
          if (matches) {
            expect(result.decision.kind).toBe("EXECUTE");
          } else {
            expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
