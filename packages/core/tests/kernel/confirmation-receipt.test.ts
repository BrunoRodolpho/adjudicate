/**
 * Kernel-side `confirmationReceipt` override semantics.
 *
 * Pre-fix: the adapter's `confirm()` flow re-adjudicated the same envelope
 * with the same state. The threshold guard re-fired identically and
 * produced REQUEST_CONFIRMATION again, looping forever. The user's "yes"
 * never reached the kernel.
 *
 * Fix: callers that hold a single-use confirmation receipt pass it
 * through `AdjudicateAndAuditDeps.confirmationReceipt`. When the kernel
 * would have returned REQUEST_CONFIRMATION for that exact intentHash, it
 * substitutes EXECUTE with an appended `confirmation:received` basis.
 *
 * Pinned invariants:
 *   1. With matching receipt + REQUEST_CONFIRMATION → EXECUTE override
 *      with original basis preserved + confirmation:received appended.
 *   2. Receipt for a DIFFERENT intentHash → no override (decision flows
 *      through unchanged). Prevents replay-of-receipt against unrelated
 *      intents.
 *   3. Other Decisions (REFUSE, REWRITE, ESCALATE, DEFER, EXECUTE) flow
 *      through unchanged even with a matching receipt — state-change
 *      detection is preserved.
 *   4. With override + EXECUTE: ledger is claimed (race-loss flip works
 *      identically to a natural EXECUTE).
 */

import { describe, expect, it } from "vitest";
import {
  adjudicateAndAudit,
  type Guard,
} from "../../src/kernel/index.js";
import {
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
} from "../../src/decision.js";
import { refuse } from "../../src/refusal.js";
import {
  buildEnvelope,
  type IntentEnvelope,
} from "../../src/envelope.js";
import { noopAuditSink, type AuditSink } from "../../src/sink.js";
import type { TaintPolicy } from "../../src/taint.js";
import type { AuditRecord, Ledger } from "../../src/index.js";

const permissive: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function envOf(kind: string, nonce: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-confirm-test" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

function captureSink(): { sink: AuditSink; records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return {
    sink: { async emit(r) { records.push(r); } },
    records,
  };
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
  decisionRequestConfirmation("Confirm this?", []);

describe("confirmationReceipt override (fix for confirm() loop)", () => {
  it("REQUEST_CONFIRMATION + matching receipt → EXECUTE with confirmation basis", async () => {
    const env = envOf("test.confirm", "n-match");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [askConfirm],
        default: "REFUSE",
      },
      {
        sink,
        confirmationReceipt: {
          intentHash: env.intentHash,
          at: "2026-05-13T12:00:01.000Z",
        },
      },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    // Original guard's basis preserved + confirmation:received appended.
    expect(codes).toContain("confirmation:received");
    // Exactly one audit record (no double-emission).
    expect(records).toHaveLength(1);
    expect(records[0]!.decision.kind).toBe("EXECUTE");
    // v3 — the post-confirmation EXECUTE record links back to the original
    // REQUEST_CONFIRMATION via `supersedes`.
    expect(records[0]!.supersedes).toEqual({
      predecessorIntentHash: env.intentHash,
      predecessorAt: "2026-05-13T12:00:01.000Z",
      reason: "confirmation_resolved",
    });
  });

  it("REQUEST_CONFIRMATION + receipt for a DIFFERENT hash → no override", async () => {
    const env = envOf("test.confirm", "n-mismatch");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [askConfirm],
        default: "REFUSE",
      },
      {
        sink,
        confirmationReceipt: {
          intentHash: "0".repeat(64), // some other hash
          at: "2026-05-13T12:00:01.000Z",
        },
      },
    );

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("REFUSE flows through unchanged even with matching receipt (state-change detection preserved)", async () => {
    const env = envOf("test.confirm", "n-state-changed");
    const { sink } = captureSink();

    // Simulate a state change: the original adjudication produced
    // REQUEST_CONFIRMATION; by confirmation time, a state guard now
    // fires REFUSE (e.g., the charge was already refunded by another
    // path). The override MUST NOT silently turn a REFUSE into an
    // EXECUTE — the user sees the refusal.
    const refuseGuard: Guard<string, unknown, unknown> = () =>
      decisionRefuse(refuse("STATE", "transition_illegal", "already refunded"), []);

    const result = await adjudicateAndAudit(
      env,
      {},
      {
        stateGuards: [refuseGuard],
        authGuards: [],
        taint: permissive,
        business: [askConfirm],
        default: "REFUSE",
      },
      {
        sink,
        confirmationReceipt: {
          intentHash: env.intentHash,
          at: "2026-05-13T12:00:01.000Z",
        },
      },
    );

    expect(result.decision.kind).toBe("REFUSE");
  });

  it("EXECUTE + matching receipt → still EXECUTE (no double-EXECUTE basis)", async () => {
    const env = envOf("test.execute", "n-execute");
    const { sink } = captureSink();
    const exec: Guard<string, unknown, unknown> = () => decisionExecute([]);

    const result = await adjudicateAndAudit(
      env,
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [exec],
        default: "REFUSE",
      },
      {
        sink,
        confirmationReceipt: {
          intentHash: env.intentHash,
          at: "2026-05-13T12:00:01.000Z",
        },
      },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    expect(codes).not.toContain("confirmation:received");
  });

  it("override + ledger: claims the ledger key on first call, REPLAY_SUPPRESSED on second", async () => {
    const env = envOf("test.confirm.ledger", "n-ledger");
    const ledger = makeMemLedger();
    const { sink } = captureSink();

    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissive,
      business: [askConfirm],
      default: "REFUSE" as const,
    };
    const deps = {
      sink,
      ledger,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
      },
    };

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

  it("override does NOT trigger when no receipt is supplied (back-compat)", async () => {
    const env = envOf("test.confirm.nopreceipt", "n-no-receipt");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(
      env,
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [askConfirm],
        default: "REFUSE",
      },
      { sink: sink, ...{ /* no receipt */ } },
    );

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });
});

// Suppress unused import warning when noopAuditSink is unused
void noopAuditSink;
