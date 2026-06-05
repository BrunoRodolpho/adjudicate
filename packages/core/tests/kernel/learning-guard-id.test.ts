/**
 * End-to-end test — `LearningEvent.guardId` flows from the matched guard
 * through `adjudicateAndAudit` to the LearningSink, applying the ADR-105
 * derivation rule `metadata.name ?? guard.name`.
 *
 * Also confirms `adjudicateAndLearn` (the simpler sibling) produces the
 * same identity field.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adjudicateAndAudit,
  adjudicateAndLearn,
  matchedGuardIdFromTrace,
  nameGuard,
  setLearningSink,
  withMetadata,
  _resetLearningSink,
  type Guard,
  type LearningEvent,
  type LearningSink,
} from "../../src/kernel/index.js";
import { decisionExecute, decisionRefuse } from "../../src/decision.js";
import { refuse } from "../../src/refusal.js";
import {
  buildEnvelope,
  type IntentEnvelope,
} from "../../src/envelope.js";
import type { TaintPolicy } from "../../src/taint.js";
import { noopAuditSink } from "../../src/sink.js";

const permissive: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function envOf(kind: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-learn" },
    taint: "UNTRUSTED",
    nonce: `n-${kind}`,
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

function captureLearningSink(): {
  sink: LearningSink;
  events: LearningEvent[];
} {
  const events: LearningEvent[] = [];
  const sink: LearningSink = { recordOutcome: (e) => void events.push(e) };
  return { sink, events };
}

describe("LearningEvent.guardId — end-to-end via adjudicateAndAudit (ADR-105)", () => {
  beforeEach(() => {
    _resetLearningSink();
  });
  afterEach(() => {
    _resetLearningSink();
  });

  it("populates guardId from metadata.name when nameGuard was used", async () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    const escalateLargeRefunds: Guard<string, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "test", "test"), []);
    nameGuard("escalateLargeRefunds", escalateLargeRefunds);

    await adjudicateAndAudit(
      envOf("refund.large"),
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [escalateLargeRefunds],
        default: "EXECUTE",
      },
      { sink: noopAuditSink() },
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.guardId).toBe("escalateLargeRefunds");
  });

  it("falls back to Function.name when no metadata is attached", async () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    function plainNamedGuard(): null {
      return decisionExecute([]);
    }

    await adjudicateAndAudit(
      envOf("plain.named"),
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [plainNamedGuard as unknown as Guard<string, unknown, unknown>],
        default: "REFUSE",
      },
      { sink: noopAuditSink() },
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.guardId).toBe("plainNamedGuard");
  });

  it("omits guardId when the policy default fires (no guard matched)", async () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    await adjudicateAndAudit(
      envOf("default.path"),
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [],
        default: "EXECUTE",
      },
      { sink: noopAuditSink() },
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.guardId).toBeUndefined();
  });

  it("omits guardId when an anonymous closure matches with no metadata", async () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    const anon: Guard<string, unknown, unknown> = () => decisionExecute([]);
    Object.defineProperty(anon, "name", { value: "", configurable: true });

    await adjudicateAndAudit(
      envOf("anon.kind"),
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [anon],
        default: "REFUSE",
      },
      { sink: noopAuditSink() },
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.guardId).toBeUndefined();
  });

  it("withMetadata({ name }) without nameGuard works the same way", async () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    const guard: Guard<string, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "x", "y"), []);
    withMetadata(guard, { name: "directWithMetadata" });

    await adjudicateAndAudit(
      envOf("any.kind"),
      {},
      {
        stateGuards: [],
        authGuards: [],
        taint: permissive,
        business: [guard],
        default: "EXECUTE",
      },
      { sink: noopAuditSink() },
    );

    expect(events[0]!.guardId).toBe("directWithMetadata");
  });
});

describe("adjudicateAndLearn parity — guardId flows the same way", () => {
  beforeEach(() => {
    _resetLearningSink();
  });
  afterEach(() => {
    _resetLearningSink();
  });

  it("populates guardId via the same derivation rule", () => {
    const { sink, events } = captureLearningSink();
    setLearningSink(sink);

    const guard: Guard<string, unknown, unknown> = () =>
      decisionExecute([]);
    nameGuard("learnTestGuard", guard);

    adjudicateAndLearn(envOf("learn.test"), {}, {
      stateGuards: [],
      authGuards: [],
      taint: permissive,
      business: [guard],
      default: "REFUSE",
    }, { now: () => 0, clockIso: () => "2026-04-23T12:00:00.000Z" });

    expect(events[0]!.guardId).toBe("learnTestGuard");
  });
});

describe("matchedGuardIdFromTrace — pure helper", () => {
  it("returns the first matched guard's name from a trace", () => {
    const id = matchedGuardIdFromTrace([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "state", index: 0, outcome: "pass" },
      { phase: "taint", outcome: "pass" },
      { phase: "auth", index: 0, outcome: "pass" },
      { phase: "business", index: 0, guardName: "foo", outcome: "match" },
    ]);
    expect(id).toBe("foo");
  });

  it("returns undefined when no guard matched (taint short-circuit)", () => {
    const id = matchedGuardIdFromTrace([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "state", index: 0, outcome: "pass" },
      { phase: "taint", outcome: "match" },
    ]);
    expect(id).toBeUndefined();
  });

  it("returns undefined when matched guard has no name", () => {
    const id = matchedGuardIdFromTrace([
      { phase: "business", index: 0, outcome: "match" },
    ]);
    expect(id).toBeUndefined();
  });
});
