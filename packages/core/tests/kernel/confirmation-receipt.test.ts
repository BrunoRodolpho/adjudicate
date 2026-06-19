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
  type ConfirmationBinding,
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
          at: "2026-05-13T12:00:01.000Z", // confirmation wall-clock
          originalAt: "2026-05-13T11:59:00.000Z", // predecessor row's at
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
    // REQUEST_CONFIRMATION via `supersedes`. LogicReviewer-004: predecessorAt
    // is the ORIGINAL audit row's `at` (originalAt), NOT the confirmation `at`.
    expect(records[0]!.supersedes).toEqual({
      predecessorIntentHash: env.intentHash,
      predecessorAt: "2026-05-13T11:59:00.000Z", // must be originalAt, not at
      reason: "confirmation_resolved",
    });
  });

  it("LogicReviewer-004: predecessorAt falls back to receipt.at when originalAt omitted (back-compat)", async () => {
    const env = envOf("test.confirm", "n-fallback");
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
          // originalAt intentionally omitted — pre-existing behaviour.
        },
      },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    // With no originalAt, predecessorAt falls back to the confirmation `at`,
    // byte-identical to the pre-fix derivation (no token key present).
    expect(records[0]!.supersedes).toEqual({
      predecessorIntentHash: env.intentHash,
      predecessorAt: "2026-05-13T12:00:01.000Z",
      reason: "confirmation_resolved",
    });
  });

  it("AuthReviewer-005: confirmationReceipt.token propagates to supersedes.token", async () => {
    const env = envOf("test.confirm", "n-token");
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
          token: "tok-abc",
        },
      },
    );

    expect(result.decision.kind).toBe("EXECUTE");
    expect(records[0]!.supersedes?.token).toBe("tok-abc");
    expect(records[0]!.supersedes?.reason).toBe("confirmation_resolved");
  });

  it("AuthReviewer-005: supersedes has no token key when receipt omits it (opt-in)", async () => {
    const env = envOf("test.confirm", "n-no-token");
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
    // Determinism fence: omitting token leaves the key off the object
    // entirely (not `token: undefined`), so the supersedes shape — and the
    // auditHash over it — is byte-identical to pre-AuthReviewer-005.
    expect(records[0]!.supersedes).not.toHaveProperty("token");
    expect(Object.keys(records[0]!.supersedes!).sort()).toEqual([
      "predecessorAt",
      "predecessorIntentHash",
      "reason",
    ]);
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

// ── 071 — (capability, approver, channel) binding ────────────────────────────
//
// The override stays keyed on `intentHash`; when the receipt carries a binding
// tuple, EVERY present field whose issued-against `requested` value is supplied
// MUST equal its resolved `confirmed` value, else the override falls through to
// the original REQUEST_CONFIRMATION (fail-closed, §D-6). The confirmed values
// are recorded on `supersedes.binding`. Omitting the binding is byte-identical
// to the pre-071 four-field receipt (determinism fence, §D-5).
const policy071 = {
  stateGuards: [],
  authGuards: [],
  taint: permissive,
  business: [askConfirm],
  default: "REFUSE" as const,
};

describe("071 confirmationReceipt binding (capability, approver, channel)", () => {
  it("override fires when all present binding fields match (requested === confirmed)", async () => {
    const env = envOf("test.confirm.bind", "n-bind-match");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding: {
          capability: { requested: "cap-deploy", confirmed: "cap-deploy" },
          approver: { requested: "alice", confirmed: "alice" },
          channel: { requested: "slack", confirmed: "slack" },
        },
      },
    });

    expect(result.decision.kind).toBe("EXECUTE");
    const codes = result.decision.basis.map((b) => `${b.category}:${b.code}`);
    expect(codes).toContain("confirmation:received");
    // The bound (confirmed) tuple is recorded forensically on supersedes.binding.
    expect(records[0]!.supersedes).toMatchObject({
      reason: "confirmation_resolved",
      binding: { capability: "cap-deploy", approver: "alice", channel: "slack" },
    });
  });

  it("a mismatched bound APPROVER falls through to the original REQUEST_CONFIRMATION", async () => {
    const env = envOf("test.confirm.bind", "n-bind-approver-mismatch");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding: {
          // The confirmation request was issued for approver "alice" but the
          // confirmation resolved with "mallory" — the override must NOT fire.
          approver: { requested: "alice", confirmed: "mallory" },
        },
      },
    });

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
    // No supersession (no override happened) — the record is the plain
    // REQUEST_CONFIRMATION verdict.
    expect(records[0]!.decision.kind).toBe("REQUEST_CONFIRMATION");
    expect(records[0]!.supersedes).toBeUndefined();
  });

  it("a mismatched bound CHANNEL falls through (fail-closed, §D-6)", async () => {
    const env = envOf("test.confirm.bind", "n-bind-channel-mismatch");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding: {
          approver: { requested: "alice", confirmed: "alice" },
          channel: { requested: "slack", confirmed: "email" },
        },
      },
    });

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("a mismatched bound CAPABILITY falls through", async () => {
    const env = envOf("test.confirm.bind", "n-bind-cap-mismatch");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding: {
          capability: { requested: "cap-deploy", confirmed: "cap-refund" },
        },
      },
    });

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("a field with no `requested` value is recorded but not gated (override still fires)", async () => {
    const env = envOf("test.confirm.bind", "n-bind-no-requested");
    const { sink, records } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding: {
          // Only the resolved approver is known (no issued-against value to
          // compare) — bind it forensically but do not gate on it.
          approver: { confirmed: "alice" },
        },
      },
    });

    expect(result.decision.kind).toBe("EXECUTE");
    expect(records[0]!.supersedes).toMatchObject({
      reason: "confirmation_resolved",
      binding: { approver: "alice" },
    });
    // Only the supplied field is recorded — capability/channel keys absent.
    expect(records[0]!.supersedes!.binding).not.toHaveProperty("capability");
    expect(records[0]!.supersedes!.binding).not.toHaveProperty("channel");
  });

  it("intentHash stays the load-bearing gate: a DIFFERENT hash falls through even with matching binding", async () => {
    const env = envOf("test.confirm.bind", "n-bind-hash-mismatch");
    const { sink } = captureSink();

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: "0".repeat(64), // wrong hash
        at: "2026-05-13T12:00:01.000Z",
        binding: { approver: { requested: "alice", confirmed: "alice" } },
      },
    });

    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  // ── 072 — separation-of-duty stays ENGINE-SIDE, never on the kernel receipt ──
  it("072: the SoD proposer identity is NOT carried on the kernel receipt/binding (enforced engine-side)", async () => {
    const env = envOf("test.confirm.bind", "n-sod-no-proposer");
    const { sink, records } = captureSink();

    // A receipt may bind {capability, approver, channel} — there is NO
    // proposer/requestedBy slot on ConfirmationBinding. The proposer surface that
    // would let SoD be enforced (approver != proposer) lives ONLY engine-side on
    // ApprovalRequest.requestedBy (plan 072); the kernel records/gates the
    // APPROVER, never the proposer. The explicit `ConfirmationBinding` annotation
    // is a TYPE-LEVEL assertion: this would not compile if `proposer`/
    // `requestedBy` were valid binding keys.
    const binding: ConfirmationBinding = {
      approver: { requested: "alice", confirmed: "alice" },
    };

    const result = await adjudicateAndAudit(env, {}, policy071, {
      sink,
      confirmationReceipt: {
        intentHash: env.intentHash,
        at: "2026-05-13T12:00:01.000Z",
        binding,
      },
    });

    expect(result.decision.kind).toBe("EXECUTE");
    const sup = records[0]!.supersedes!;
    // The recorded forensic binding carries ONLY the approver here — no proposer
    // key is, or can be, recorded on the kernel-side supersession.
    expect(sup.binding).toEqual({ approver: "alice" });
    expect(sup.binding).not.toHaveProperty("proposer");
    expect(sup.binding).not.toHaveProperty("requestedBy");
  });

  it("DETERMINISM FENCE: omitting binding is byte-identical to pre-071 (same auditHash + supersedes)", async () => {
    // Two confirmations of the SAME envelope+receipt, one with a binding key
    // entirely absent and one with `binding: undefined` — both must produce the
    // identical supersedes shape and identical auditHash to the four-field path.
    const env = envOf("test.confirm.bind", "n-bind-byte-identical");

    const baseReceipt = {
      intentHash: env.intentHash,
      at: "2026-05-13T12:00:01.000Z",
      originalAt: "2026-05-13T11:59:00.000Z",
      token: "tok-bcompat",
    };

    const a = captureSink();
    const noBinding = await adjudicateAndAudit(env, {}, policy071, {
      sink: a.sink,
      clock: { nowIso: () => "2026-05-13T12:00:02.000Z", nowMs: () => 0 },
      confirmationReceipt: { ...baseReceipt },
    });

    const b = captureSink();
    const undefinedBinding = await adjudicateAndAudit(env, {}, policy071, {
      sink: b.sink,
      clock: { nowIso: () => "2026-05-13T12:00:02.000Z", nowMs: () => 0 },
      confirmationReceipt: { ...baseReceipt, binding: undefined },
    });

    expect(noBinding.decision.kind).toBe("EXECUTE");
    expect(undefinedBinding.decision.kind).toBe("EXECUTE");
    // No `binding` key on either supersession (omitted, not `binding: undefined`).
    expect(a.records[0]!.supersedes).not.toHaveProperty("binding");
    expect(b.records[0]!.supersedes).not.toHaveProperty("binding");
    // Byte-identical supersedes shape.
    expect(b.records[0]!.supersedes).toEqual(a.records[0]!.supersedes);
    expect(a.records[0]!.supersedes).toEqual({
      predecessorIntentHash: env.intentHash,
      predecessorAt: "2026-05-13T11:59:00.000Z",
      reason: "confirmation_resolved",
      token: "tok-bcompat",
    });
    // And the tamper-evident auditHash is identical (the binding key is in the
    // pre-image, so omitting it must not perturb the hash).
    expect(a.records[0]!.auditHash).toBeDefined();
    expect(b.records[0]!.auditHash).toBe(a.records[0]!.auditHash);
  });
});

// Suppress unused import warning when noopAuditSink is unused
void noopAuditSink;
