/**
 * LearningSink + adjudicateAndLearn — telemetry surface for adaptation /
 * drift / governance dashboards.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type LearningEvent,
  type LearningSink,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";
import {
  adjudicateAndLearn,
  flattenBasis,
  hasLearningSink,
  recordOutcome,
  setLearningSink,
  _resetLearningSink,
} from "../../src/kernel/learning.js";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const passBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [
    () => decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]),
  ],
  default: "EXECUTE",
};

const refuseBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [
    () =>
      decisionRefuse(
        refuse("BUSINESS_RULE", "thing.do.invalid", "no"),
        [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
      ),
  ],
  default: "REFUSE",
};

function envFixture() {
  return buildEnvelope({
    kind: "thing.do",
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

describe("flattenBasis", () => {
  it("renders DecisionBasis as category:code strings", () => {
    const flat = flattenBasis([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
    ]);
    expect(flat).toEqual(["state:transition_valid", "auth:scope_sufficient"]);
  });

  it("returns [] for empty input", () => {
    expect(flattenBasis([])).toEqual([]);
  });
});

describe("LearningSink registry", () => {
  afterEach(() => {
    _resetLearningSink();
  });

  it("default has no installed sink", () => {
    _resetLearningSink();
    expect(hasLearningSink()).toBe(false);
  });

  it("setLearningSink marks the slot as explicitly set", () => {
    setLearningSink({ recordOutcome() {} });
    expect(hasLearningSink()).toBe(true);
  });

  it("recordOutcome dispatches to the installed sink", () => {
    const events: LearningEvent[] = [];
    setLearningSink({
      recordOutcome(event) {
        events.push(event);
      },
    });
    recordOutcome({
      intentKind: "x.do",
      decisionKind: "EXECUTE",
      basisCodes: ["state:transition_valid"],
      taint: "SYSTEM",
      durationMs: 1,
      intentHash: "deadbeef",
      at: "2026-04-23T12:00:00.000Z",
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.intentKind).toBe("x.do");
  });

  it("noop when no sink is installed", () => {
    _resetLearningSink();
    expect(() =>
      recordOutcome({
        intentKind: "x.do",
        decisionKind: "EXECUTE",
        basisCodes: [],
        taint: "SYSTEM",
        durationMs: 1,
        intentHash: "x",
        at: "2026-04-23T12:00:00.000Z",
      }),
    ).not.toThrow();
  });
});

describe("adjudicateAndLearn", () => {
  afterEach(() => {
    _resetLearningSink();
  });

  it("returns the same Decision adjudicate would have returned (EXECUTE)", () => {
    const decision = adjudicateAndLearn(envFixture(), {}, passBundle);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("returns the same Decision adjudicate would have returned (REFUSE)", () => {
    const decision = adjudicateAndLearn(envFixture(), {}, refuseBundle);
    expect(decision.kind).toBe("REFUSE");
  });

  it("emits one LearningEvent per adjudicate call", () => {
    const events: LearningEvent[] = [];
    const sink: LearningSink = {
      recordOutcome(event) {
        events.push(event);
      },
    };
    setLearningSink(sink);
    adjudicateAndLearn(envFixture(), {}, passBundle);
    adjudicateAndLearn(envFixture(), {}, passBundle);
    expect(events).toHaveLength(2);
  });

  it("populates intentKind, decisionKind, basisCodes, taint, intentHash, at", () => {
    const events: LearningEvent[] = [];
    setLearningSink({
      recordOutcome(event) {
        events.push(event);
      },
    });
    let now = 1_000;
    adjudicateAndLearn(envFixture(), {}, passBundle, {
      now: () => now++,
      clockIso: () => "2026-04-23T12:00:01.000Z",
    });
    expect(events[0]!.intentKind).toBe("thing.do");
    expect(events[0]!.decisionKind).toBe("EXECUTE");
    expect(events[0]!.basisCodes).toContain("business:rule_satisfied");
    expect(events[0]!.taint).toBe("UNTRUSTED");
    expect(events[0]!.intentHash).toBe(envFixture().intentHash);
    expect(events[0]!.at).toBe("2026-04-23T12:00:01.000Z");
    expect(events[0]!.durationMs).toBe(1);
  });

  it("forwards planFingerprint when provided", () => {
    const events: LearningEvent[] = [];
    setLearningSink({
      recordOutcome(event) {
        events.push(event);
      },
    });
    adjudicateAndLearn(envFixture(), {}, passBundle, {
      planFingerprint: "abc123",
    });
    expect(events[0]!.planFingerprint).toBe("abc123");
  });

  it("returns the Decision even when the sink throws (telemetry never blocks)", () => {
    setLearningSink({
      recordOutcome() {
        throw new Error("sink down");
      },
    });
    const decision = adjudicateAndLearn(envFixture(), {}, passBundle);
    expect(decision.kind).toBe("EXECUTE");
  });
});
