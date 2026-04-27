/**
 * replay() — re-adjudicate stored AuditRecords and classify drift.
 *
 * Comparison rule (T2):
 *   1. different decision.kind → DECISION_KIND
 *   2. same kind, different basis flat-set → BASIS_DRIFT (carries delta)
 *   3. both REFUSE, same kind+basis, different refusal.code → REFUSAL_CODE_DRIFT
 *   4. otherwise matched
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type AuditRecord,
  type Decision,
} from "@adjudicate/core";
import { classify, replay } from "../src/replay.js";

function record(kind: "EXECUTE" | "REFUSE", seed: string): AuditRecord {
  const env = buildEnvelope({
    kind: "order.tool.propose",
    payload: { toolName: seed },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
  const decision: Decision =
    kind === "EXECUTE"
      ? decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)])
      : decisionRefuse(refuse("STATE", "x", "nope"), [
          basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
        ]);
  return buildAuditRecord({ envelope: env, decision, durationMs: 1 });
}

describe("replay", () => {
  it("matches every record when adjudicator is deterministic", () => {
    const records = [record("EXECUTE", "a"), record("REFUSE", "b")];
    const report = replay(records, (r) => r.decision);
    expect(report.total).toBe(2);
    expect(report.matched).toBe(2);
    expect(report.mismatches).toEqual([]);
  });

  it("classifies a DECISION_KIND mismatch", () => {
    const records = [record("EXECUTE", "a"), record("REFUSE", "b")];
    const report = replay(records, () =>
      decisionRefuse(
        refuse("STATE", "x", "nope"),
        [basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL)],
      ),
    );
    expect(report.matched).toBe(1); // REFUSE record matches
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("DECISION_KIND");
    expect(report.mismatches[0]!.expected.kind).toBe("EXECUTE");
    expect(report.mismatches[0]!.actual.kind).toBe("REFUSE");
  });
});

describe("replay — basis drift", () => {
  it("classifies a BASIS_DRIFT mismatch with the symmetric delta", () => {
    const r = record("EXECUTE", "a");
    const report = replay([r], () =>
      decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
        basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
      ]),
    );
    expect(report.matched).toBe(0);
    expect(report.mismatches).toHaveLength(1);
    const m = report.mismatches[0]!;
    expect(m.kind).toBe("BASIS_DRIFT");
    expect(m.basisDelta).toBeDefined();
    expect(m.basisDelta!.missing).toEqual([]);
    expect(m.basisDelta!.extra).toEqual(["auth:scope_sufficient"]);
  });

  it("treats basis ORDER as irrelevant — same flat-set is matched", () => {
    const env = buildEnvelope({
      kind: "order.tool.propose",
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const stored = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
        basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
      ]),
      durationMs: 1,
    });
    const report = replay([stored], () =>
      decisionExecute([
        basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
      ]),
    );
    expect(report.matched).toBe(1);
    expect(report.mismatches).toEqual([]);
  });

  it("ignores basis.detail when flattening to category:code", () => {
    const env = buildEnvelope({
      kind: "order.tool.propose",
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const stored = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID, { reason: "old" }),
      ]),
      durationMs: 1,
    });
    const report = replay([stored], () =>
      decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID, { reason: "new" }),
      ]),
    );
    expect(report.matched).toBe(1);
  });

  it("classifies missing AND extra in basisDelta when both differ", () => {
    const env = buildEnvelope({
      kind: "order.tool.propose",
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const stored = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
        basis("business", BASIS_CODES.business.RULE_SATISFIED),
      ]),
      durationMs: 1,
    });
    const report = replay([stored], () =>
      decisionExecute([
        basis("state", BASIS_CODES.state.TRANSITION_VALID),
        basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
      ]),
    );
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("BASIS_DRIFT");
    expect(report.mismatches[0]!.basisDelta!.missing).toEqual([
      "business:rule_satisfied",
    ]);
    expect(report.mismatches[0]!.basisDelta!.extra).toEqual([
      "auth:scope_sufficient",
    ]);
  });
});

describe("replay — refusal code drift", () => {
  it("classifies REFUSAL_CODE_DRIFT when both REFUSE and basis matches", () => {
    const env = buildEnvelope({
      kind: "order.tool.propose",
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const stored = buildAuditRecord({
      envelope: env,
      decision: decisionRefuse(refuse("STATE", "old.code", "nope"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]),
      durationMs: 1,
    });
    const report = replay([stored], () =>
      decisionRefuse(refuse("STATE", "new.code", "nope"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]),
    );
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("REFUSAL_CODE_DRIFT");
  });

  it("BASIS_DRIFT takes precedence over REFUSAL_CODE_DRIFT", () => {
    // Both refusal code AND basis differ — should report BASIS_DRIFT, not
    // REFUSAL_CODE_DRIFT, because the basis change subsumes the code one
    // for runbook routing.
    const env = buildEnvelope({
      kind: "order.tool.propose",
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
    const stored = buildAuditRecord({
      envelope: env,
      decision: decisionRefuse(refuse("STATE", "old.code", "x"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]),
      durationMs: 1,
    });
    const report = replay([stored], () =>
      decisionRefuse(refuse("STATE", "new.code", "x"), [
        basis("business", BASIS_CODES.business.RULE_VIOLATED),
      ]),
    );
    expect(report.mismatches[0]!.kind).toBe("BASIS_DRIFT");
  });
});

describe("classify (pure helper)", () => {
  it("returns null for an exact match", () => {
    const dec = decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]);
    expect(classify("h", dec, dec)).toBeNull();
  });

  it("returns DECISION_KIND when kinds differ", () => {
    const result = classify(
      "h",
      decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]),
      decisionRefuse(refuse("STATE", "x", "y"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]),
    );
    expect(result?.kind).toBe("DECISION_KIND");
  });
});

describe("replay — acceptance test from T2 plan", () => {
  it("corpus with one swapped refusal code → mismatches.length === 1, kind === REFUSAL_CODE_DRIFT", () => {
    // Build 5 records, all matching kinds, but the third has its refusal
    // code rewritten in the replayed adjudicator.
    const env = (seed: string) =>
      buildEnvelope({
        kind: "order.tool.propose",
        payload: { seed },
        actor: { principal: "llm", sessionId: "s" },
        taint: "UNTRUSTED",
        nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
      });

    const refusedDecision = (code: string): Decision =>
      decisionRefuse(refuse("STATE", code, "nope"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]);

    const records: AuditRecord[] = [
      buildAuditRecord({
        envelope: env("1"),
        decision: decisionExecute([
          basis("state", BASIS_CODES.state.TRANSITION_VALID),
        ]),
        durationMs: 1,
      }),
      buildAuditRecord({
        envelope: env("2"),
        decision: refusedDecision("expected.code"),
        durationMs: 1,
      }),
      buildAuditRecord({
        envelope: env("3"),
        decision: refusedDecision("drift.target"), // adjudicator returns "drift.actual"
        durationMs: 1,
      }),
      buildAuditRecord({
        envelope: env("4"),
        decision: refusedDecision("expected.code"),
        durationMs: 1,
      }),
      buildAuditRecord({
        envelope: env("5"),
        decision: decisionExecute([
          basis("state", BASIS_CODES.state.TRANSITION_VALID),
        ]),
        durationMs: 1,
      }),
    ];

    const report = replay(records, (r) => {
      // Replayed adjudicator: identical to stored, EXCEPT the third record's
      // refusal code is rewritten — simulating a Pack patch that renamed
      // a refusal code without changing semantics.
      if (r.envelope.payload && (r.envelope.payload as { seed: string }).seed === "3") {
        return refusedDecision("drift.actual");
      }
      return r.decision;
    });

    expect(report.total).toBe(5);
    expect(report.matched).toBe(4);
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("REFUSAL_CODE_DRIFT");
    expect(report.mismatches[0]!.intentHash).toBe(records[2]!.intentHash);
  });
});
