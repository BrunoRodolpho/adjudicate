/**
 * adjudicateAndAudit — kernel-side audit emission, ledger consult, metrics
 * + learning, and EXECUTE-race fix.
 *
 * Pattern follows the existing learning.test.ts and metrics.test.ts tests:
 * vi.fn() sinks, _resetX in afterEach, an in-memory ledger fixture, and a
 * minimal PolicyBundle that exercises the relevant decision paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type AuditRecord,
  type AuditSink,
  type Ledger,
  type LedgerHit,
  type LedgerRecordOutcome,
  type LearningEvent,
  type MetricsSink,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";
import {
  adjudicateAndAudit,
  setLearningSink,
  setMetricsSink,
  _resetLearningSink,
  _resetMetricsSink,
  _resetShadowTelemetrySink,
} from "../../src/kernel/index.js";

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

function envFixture(overrides?: { nonce?: string }) {
  return buildEnvelope({
    kind: "thing.do",
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    createdAt: overrides?.nonce ?? "2026-04-23T12:00:00.000Z",
  });
}

interface MemLedgerHandle {
  readonly ledger: Ledger;
  readonly checkLedger: ReturnType<typeof vi.fn>;
  readonly recordExecution: ReturnType<typeof vi.fn>;
  readonly seed: (intentHash: string, hit: LedgerHit) => void;
}

function makeMemLedger(): MemLedgerHandle {
  const store = new Map<string, LedgerHit>();
  const checkLedger = vi.fn(async (intentHash: string) => store.get(intentHash) ?? null);
  const recordExecution = vi.fn(async (entry): Promise<LedgerRecordOutcome> => {
    if (store.has(entry.intentHash)) return "exists";
    store.set(entry.intentHash, {
      resourceVersion: entry.resourceVersion,
      at: new Date().toISOString(),
      sessionId: entry.sessionId,
      kind: entry.kind,
    });
    return "acquired";
  });
  return {
    ledger: { checkLedger, recordExecution },
    checkLedger,
    recordExecution,
    seed: (intentHash, hit) => store.set(intentHash, hit),
  };
}

function noopMetricsSink(): MetricsSink {
  return {
    recordLedgerOp() {},
    recordDecision() {},
    recordRefusal() {},
    recordSinkFailure() {},
    recordShadowDivergence() {},
    recordResourceLimit() {},
  };
}

afterEach(() => {
  _resetMetricsSink();
  _resetLearningSink();
  _resetShadowTelemetrySink();
});

describe("adjudicateAndAudit", () => {
  it("returns the same Decision adjudicate would have returned (EXECUTE)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(result.decision.kind).toBe("EXECUTE");
    expect(result.ledgerHit).toBeNull();
  });

  it("emits exactly one AuditRecord per non-cached call", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const sink: AuditSink = { emit };
    await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(emit).toHaveBeenCalledTimes(1);
    const record = emit.mock.calls[0]![0] as AuditRecord;
    expect(record.intentHash).toBe(envFixture().intentHash);
    expect(record.decision.kind).toBe("EXECUTE");
    expect(record.version).toBe(2);
  });

  it("propagates a sink failure (strict by design)", async () => {
    const sink: AuditSink = {
      emit: vi.fn().mockRejectedValue(new Error("postgres down")),
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, { sink }),
    ).rejects.toThrow("postgres down");
  });

  it("calls MetricsSink.recordDecision once per call", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const metrics = noopMetricsSink();
    const recordDecisionSpy = vi.spyOn(metrics, "recordDecision");
    setMetricsSink(metrics);
    await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(recordDecisionSpy).toHaveBeenCalledTimes(1);
    expect(recordDecisionSpy.mock.calls[0]![0]!.decision).toBe("EXECUTE");
  });

  it("calls MetricsSink.recordRefusal on REFUSE decisions", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const metrics = noopMetricsSink();
    const recordRefusalSpy = vi.spyOn(metrics, "recordRefusal");
    setMetricsSink(metrics);
    await adjudicateAndAudit(envFixture(), {}, refuseBundle, { sink });
    expect(recordRefusalSpy).toHaveBeenCalledTimes(1);
    expect(recordRefusalSpy.mock.calls[0]![0]!.refusal.code).toBe(
      "thing.do.invalid",
    );
  });

  it("emits a LearningEvent per call", async () => {
    const events: LearningEvent[] = [];
    setLearningSink({ recordOutcome: (e) => events.push(e) });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(events).toHaveLength(1);
    expect(events[0]!.decisionKind).toBe("EXECUTE");
    expect(events[0]!.basisCodes).toContain("business:rule_satisfied");
  });

  it("does NOT propagate a learning sink failure (telemetry never blocks)", async () => {
    setLearningSink({
      recordOutcome() {
        throw new Error("learning sink down");
      },
    });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(result.decision.kind).toBe("EXECUTE");
  });
});

describe("adjudicateAndAudit — Ledger consult", () => {
  it("flips EXECUTE to REPLAY_SUPPRESSED when checkLedger returns a hit", async () => {
    const ledger = makeMemLedger();
    ledger.seed(envFixture().intentHash, {
      resourceVersion: "v-7",
      at: "2026-04-23T11:50:00.000Z",
      sessionId: "s-1",
      kind: "thing.do",
    });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      ledger: ledger.ledger,
    });
    expect(result.decision.kind).toBe("REFUSE");
    if (result.decision.kind !== "REFUSE") throw new Error();
    expect(result.decision.refusal.code).toBe("ledger_replay_suppressed");
    expect(result.ledgerHit).not.toBeNull();
    expect(result.decision.basis[0]!.category).toBe("ledger");
    expect(result.decision.basis[0]!.code).toBe(BASIS_CODES.ledger.REPLAY_SUPPRESSED);
  });

  it("does not call recordExecution when the ledger hit short-circuits", async () => {
    const ledger = makeMemLedger();
    ledger.seed(envFixture().intentHash, {
      resourceVersion: "v-7",
      at: "2026-04-23T11:50:00.000Z",
      sessionId: "s-1",
      kind: "thing.do",
    });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      ledger: ledger.ledger,
    });
    expect(ledger.recordExecution).not.toHaveBeenCalled();
  });

  it("calls recordExecution exactly once on EXECUTE without a hit", async () => {
    const ledger = makeMemLedger();
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      ledger: ledger.ledger,
      resolveResourceVersion: () => "v-8",
    });
    expect(ledger.recordExecution).toHaveBeenCalledTimes(1);
    expect(ledger.recordExecution.mock.calls[0]![0]!.resourceVersion).toBe("v-8");
  });

  it("does NOT call recordExecution on REFUSE", async () => {
    const ledger = makeMemLedger();
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, refuseBundle, {
      sink,
      ledger: ledger.ledger,
    });
    expect(ledger.recordExecution).not.toHaveBeenCalled();
  });

  it("flips a racing EXECUTE to REPLAY_SUPPRESSED when recordExecution returns 'exists'", async () => {
    const ledger = makeMemLedger();
    // First caller acquires the slot.
    await ledger.ledger.recordExecution({
      intentHash: envFixture().intentHash,
      resourceVersion: "v-9",
      sessionId: "s-1",
      kind: "thing.do",
    });
    // checkLedger seed is empty — but we want to simulate the race window
    // where a second caller passed checkLedger before the first completed
    // recordExecution. Force checkLedger to return null via a one-off override.
    ledger.checkLedger.mockResolvedValueOnce(null);

    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      ledger: ledger.ledger,
    });
    expect(result.decision.kind).toBe("REFUSE");
    if (result.decision.kind !== "REFUSE") throw new Error();
    expect(result.decision.refusal.code).toBe("ledger_replay_suppressed");
  });
});

describe("adjudicateAndAudit — clock and resource version", () => {
  it("populates AuditRecord.at and durationMs from the supplied clock", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    let nowMs = 1_000;
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      clock: {
        nowMs: () => nowMs++,
        nowIso: () => "2026-04-23T12:00:01.000Z",
      },
    });
    expect(result.record.at).toBe("2026-04-23T12:00:01.000Z");
    expect(result.record.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("populates AuditRecord.plan when deps.plan returns a snapshot", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      plan: () => ({
        visibleReadTools: ["list_things"],
        allowedIntents: ["thing.do"],
        forbiddenConcepts: [],
      }),
    });
    expect(result.record.plan).toBeDefined();
    expect(result.record.plan!.visibleReadTools).toContain("list_things");
    expect(result.record.plan!.planFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
