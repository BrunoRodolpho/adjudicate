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
  aggregateSnapshotFromRecorded,
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  decisionRewrite,
  hashAggregateSnapshot,
  hashBindAuditSigner,
  recordAggregateSnapshot,
  refuse,
  verifyAuditRecord,
  type AggregateSnapshot,
  type AuditRecord,
  type AuditSigner,
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
  adjudicate,
  adjudicateAndAudit,
  createCumulativeVelocityGuard,
  createRuntimeContext,
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
    nonce: overrides?.nonce ?? "n-fixture",
    createdAt: "2026-04-23T12:00:00.000Z",
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
    expect(record.version).toBe(5);
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

  it("routes a swallowed learning-sink failure to recordSinkFailure (ErrorReviewer-005)", async () => {
    const failures: Array<{ sink: string; errorClass: string }> = [];
    setMetricsSink({
      ...noopMetricsSink(),
      recordSinkFailure(e) {
        failures.push({ sink: e.sink, errorClass: e.errorClass });
      },
    });
    setLearningSink({
      recordOutcome() {
        throw new TypeError("learning sink down");
      },
    });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    // Kernel still returns the Decision (telemetry never blocks) …
    expect(result.decision.kind).toBe("EXECUTE");
    // … AND the swallowed failure is now observable, with a stable errorClass.
    expect(failures).toContainEqual({ sink: "learning", errorClass: "TypeError" });
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
      }),
    });
    expect(result.record.plan).toBeDefined();
    expect(result.record.plan!.visibleReadTools).toContain("list_things");
    expect(result.record.plan!.planFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("adjudicateAndAudit — async-tail rate-limit rollback (consolidated-async-tail)", () => {
  it("fires rateLimitRollback for a non-EXECUTE decision even when sink.emit throws", async () => {
    const rollback = vi.fn(async () => {});
    const throwingSink: AuditSink = {
      async emit() {
        throw new Error("sink down");
      },
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, refuseBundle, {
        sink: throwingSink,
        rateLimitRollback: rollback,
      }),
    ).rejects.toThrow("sink down");
    // Pre-fix the rollback ran after a bare `await sink.emit`, so the throw
    // skipped it. try/finally now guarantees it for non-EXECUTE decisions.
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("does not roll back on an EXECUTE decision when the sink succeeds", async () => {
    const rollback = vi.fn(async () => {});
    const okSink: AuditSink = { async emit() {} };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink: okSink,
      rateLimitRollback: rollback,
    });
    expect(result.decision.kind).toBe("EXECUTE");
    expect(rollback).not.toHaveBeenCalled();
  });
});

describe("adjudicateAndAudit — ledger release on EXECUTE + sink failure (ConcurrencyReviewer-002)", () => {
  const throwingSink: AuditSink = {
    async emit() {
      throw new Error("sink down");
    },
  };

  it("calls ledger.release when recordExecution acquired and sink.emit throws", async () => {
    const release = vi.fn(async (_intentHash: string) => {});
    const ledger: Ledger = {
      async checkLedger() {
        return null;
      },
      async recordExecution(): Promise<LedgerRecordOutcome> {
        return "acquired";
      },
      release,
    };
    const env = envFixture();
    await expect(
      adjudicateAndAudit(env, {}, passBundle, { sink: throwingSink, ledger }),
    ).rejects.toThrow("sink down");
    // The orphaned claim is released with the envelope's intentHash …
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(env.intentHash);
  });

  it("emits recordSinkFailure(ledger_orphaned) when release is not implemented", async () => {
    const failures: Array<{ sink: string; errorClass: string }> = [];
    setMetricsSink({
      ...noopMetricsSink(),
      recordSinkFailure(e) {
        failures.push({ sink: e.sink, errorClass: e.errorClass });
      },
    });
    // Ledger WITHOUT a release method — kernel must surface the orphan.
    const ledger: Ledger = {
      async checkLedger() {
        return null;
      },
      async recordExecution(): Promise<LedgerRecordOutcome> {
        return "acquired";
      },
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, {
        sink: throwingSink,
        ledger,
      }),
    ).rejects.toThrow("sink down");
    expect(failures).toContainEqual({
      sink: "ledger",
      errorClass: "ledger_orphaned",
    });
  });

  it("does NOT call release when recordExecution returned 'exists' and sink throws", async () => {
    const release = vi.fn(async (_intentHash: string) => {});
    const ledger: Ledger = {
      async checkLedger() {
        return null;
      },
      // The racing-loser path: another writer already claimed the key. The
      // kernel flips to REPLAY_SUPPRESSED; releasing here would delete the
      // WINNER's live claim, so release must NOT fire.
      async recordExecution(): Promise<LedgerRecordOutcome> {
        return "exists";
      },
      release,
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, {
        sink: throwingSink,
        ledger,
      }),
    ).rejects.toThrow("sink down");
    expect(release).not.toHaveBeenCalled();
  });

  it("surfaces recordSinkFailure(ledger) when release itself throws", async () => {
    const failures: Array<{ sink: string; errorClass: string }> = [];
    setMetricsSink({
      ...noopMetricsSink(),
      recordSinkFailure(e) {
        failures.push({ sink: e.sink, errorClass: e.errorClass });
      },
    });
    const ledger: Ledger = {
      async checkLedger() {
        return null;
      },
      async recordExecution(): Promise<LedgerRecordOutcome> {
        return "acquired";
      },
      async release() {
        throw new TypeError("del failed");
      },
    };
    // The original sink error is still what propagates; the release failure
    // is best-effort telemetry, never replacing the primary throw.
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, {
        sink: throwingSink,
        ledger,
      }),
    ).rejects.toThrow("sink down");
    expect(failures).toContainEqual({ sink: "ledger", errorClass: "TypeError" });
  });
});

describe("adjudicateAndAudit — LedgerOpEvent includes intentHash (SecurityReviewer-015)", () => {
  it("emits intentHash on the ledger check event for correlation", async () => {
    const ledgerOpEvents: Array<{ op: string; intentHash: string }> = [];
    setMetricsSink({
      recordLedgerOp(e) { ledgerOpEvents.push({ op: e.op, intentHash: e.intentHash }); },
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const ledger = makeMemLedger();
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const env = envFixture();
    await adjudicateAndAudit(env, {}, passBundle, { sink, ledger: ledger.ledger });
    const checkOp = ledgerOpEvents.find((e) => e.op === "check");
    expect(checkOp).toBeDefined();
    expect(checkOp!.intentHash).toBe(env.intentHash);
  });

  it("emits intentHash on the ledger record event for EXECUTE correlation", async () => {
    const ledgerOpEvents: Array<{ op: string; intentHash: string }> = [];
    setMetricsSink({
      recordLedgerOp(e) { ledgerOpEvents.push({ op: e.op, intentHash: e.intentHash }); },
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const ledger = makeMemLedger();
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const env = envFixture();
    await adjudicateAndAudit(env, {}, passBundle, { sink, ledger: ledger.ledger });
    const recordOp = ledgerOpEvents.find((e) => e.op === "record");
    expect(recordOp).toBeDefined();
    expect(recordOp!.intentHash).toBe(env.intentHash);
  });
});

// ── 091: bind policyVersion + kernelVersion into the AuditRecord ──────────────
// The kernel decides; the impure shell supplies the policy/kernel version
// snapshots via deps. These tests assert BOTH buildAuditRecord call sites — the
// main/REWRITE-executed path AND the kill-switch early-return path — thread the
// injected versions onto the emitted record, that the versions are part of the
// tamper-evident auditHash pre-image (verifyAuditRecord round-trips true), and
// that absence of the deps leaves the fields OMITTED (not `undefined` keys) so
// non-injecting adopters keep byte-identical, hash-stable records.
describe("adjudicateAndAudit — 091 bind policyVersion/kernelVersion", () => {
  async function emitOne(
    bundle: PolicyBundle<string, unknown, unknown>,
    deps: Parameters<typeof adjudicateAndAudit>[3],
    env = envFixture(),
  ): Promise<AuditRecord> {
    const result = await adjudicateAndAudit(env, {}, bundle, deps);
    return result.record;
  }

  it("threads policyVersion + kernelVersion onto the MAIN path record", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, {
      sink,
      policyVersion: "pol-1.2.3",
      kernelVersion: "ker-0.4.0",
    });
    expect(record.policyVersion).toBe("pol-1.2.3");
    expect(record.kernelVersion).toBe("ker-0.4.0");
    // The bound versions are in the auditHash pre-image, so the record verifies.
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("the bound versions ARE part of the auditHash pre-image (tamper → tampered)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, {
      sink,
      policyVersion: "pol-1.2.3",
      kernelVersion: "ker-0.4.0",
    });
    const tamperedPolicy = { ...record, policyVersion: "pol-9.9.9" };
    const vp = verifyAuditRecord(tamperedPolicy);
    expect(vp.verified).toBe(false);
    if (vp.verified === false) expect(vp.reason).toBe("tampered");
    const tamperedKernel = { ...record, kernelVersion: "ker-9.9.9" };
    const vk = verifyAuditRecord(tamperedKernel);
    expect(vk.verified).toBe(false);
    if (vk.verified === false) expect(vk.reason).toBe("tampered");
  });

  it("OMITS both fields on the main path when the deps are absent (no undefined keys, hash-stable)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, { sink });
    expect("policyVersion" in record).toBe(false);
    expect("kernelVersion" in record).toBe(false);
    // The omitting record must still verify (the absent fields were never in
    // the pre-image), proving the conditional spread is hash-stable.
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("threads both versions onto the KILL-SWITCH path record", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const context = createRuntimeContext({ id: "tenant-091" });
    // Force the tenant kill switch ACTIVE so the early-return kill-switch
    // buildAuditRecord call site is exercised (a SECURITY kill_switch_active
    // REFUSE, before guard evaluation).
    context.killSwitch.set(true, "test-091-maintenance");
    const record = await emitOne(passBundle, {
      sink,
      context,
      policyVersion: "pol-kill-1.0.0",
      kernelVersion: "ker-kill-0.1.0",
    });
    // Sanity: this is the kill-switch path, not the main path.
    expect(record.decision.kind).toBe("REFUSE");
    expect(record.policyVersion).toBe("pol-kill-1.0.0");
    expect(record.kernelVersion).toBe("ker-kill-0.1.0");
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("OMITS both fields on the kill-switch path when deps are absent", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const context = createRuntimeContext({ id: "tenant-091-omit" });
    context.killSwitch.set(true, "test-091-maintenance");
    const record = await emitOne(passBundle, { sink, context });
    expect(record.decision.kind).toBe("REFUSE");
    expect("policyVersion" in record).toBe(false);
    expect("kernelVersion" in record).toBe(false);
  });

  it("threads both versions onto a REWRITE-executed (011) record, keyed by the rewritten envelope", async () => {
    // First-pass business guard REWRITEs the original payload to a sanitized
    // marker; the re-adjudication (011/T2) of the rewritten envelope then
    // EXECUTEs, so the durable row is the EXECUTED (rewritten) envelope and must
    // STILL carry the bound versions.
    const sanitizedNonce = "n-091-rewritten";
    const rewriteBundle: PolicyBundle<string, unknown, unknown> = {
      stateGuards: [],
      authGuards: [],
      taint: taintPolicy,
      business: [
        (env) => {
          // Re-adjudication pass sees the rewritten envelope (nonce marker) →
          // EXECUTE; the original (any other nonce) → REWRITE.
          if (env.nonce === sanitizedNonce) {
            return decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]);
          }
          const rewritten = buildEnvelope({
            kind: env.kind,
            payload: { x: 1, sanitized: true },
            actor: env.actor,
            taint: env.taint,
            nonce: sanitizedNonce,
            createdAt: env.createdAt,
          });
          return decisionRewrite(rewritten, "payload_sanitized", [
            basis("business", BASIS_CODES.business.RULE_SATISFIED),
          ]);
        },
      ],
      default: "REFUSE",
    };
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(rewriteBundle, {
      sink,
      policyVersion: "pol-rw-2.0.0",
      kernelVersion: "ker-rw-0.5.0",
    });
    // The REWRITE was validated + executed: the row is the rewritten envelope.
    expect(record.decision.kind).toBe("REWRITE");
    expect(record.envelope.nonce).toBe(sanitizedNonce);
    expect(record.supersedes?.reason).toBe("rewrite_executed");
    // ...and it carries the bound versions, verifying intact.
    expect(record.policyVersion).toBe("pol-rw-2.0.0");
    expect(record.kernelVersion).toBe("ker-rw-0.5.0");
    expect(verifyAuditRecord(record).verified).toBe(true);
  });
});

// ── 052: inject (read-only) + record the aggregate snapshot into the AuditRecord ─
// The impure shell computes the aggregate/limit snapshot (from the counting
// substrate this plan owns) and injects it READ-ONLY via deps. These tests assert
// the snapshot is recorded VERBATIM onto BOTH buildAuditRecord call sites (main +
// kill-switch), is bound into the tamper-evident auditHash pre-image (mirroring
// 033/091), is OMITTED (hash-stable, no `undefined` key) when not injected, that
// the wrapper NEVER mutates/refetches/timestamps the injected snapshot, and that
// re-running the pure kernel over the RECORDED snapshot reproduces the SAME
// decision (§D-5 replay). intentHash is untouched (invariant #4).
describe("adjudicateAndAudit — 052 inject + record aggregate snapshot", () => {
  async function emitOne(
    bundle: PolicyBundle<string, unknown, unknown>,
    deps: Parameters<typeof adjudicateAndAudit>[3],
    env = envFixture(),
  ): Promise<AuditRecord> {
    const result = await adjudicateAndAudit(env, {}, bundle, deps);
    return result.record;
  }

  const snapshot: AggregateSnapshot = {
    windows: { "acct_7|daily": 1500, "acct_7|monthly": 42000 },
    at: "2026-04-23T11:59:00.000Z",
  };

  it("records the injected aggregate snapshot VERBATIM onto the MAIN path record", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const recorded = recordAggregateSnapshot(snapshot);
    const record = await emitOne(passBundle, {
      sink,
      aggregateSnapshot: recorded,
    });
    expect(record.aggregateSnapshot).toEqual(recorded);
    // Verbatim: the recorded windows/at are byte-equal to what was injected.
    expect(record.aggregateSnapshot?.snapshot).toEqual(snapshot);
    // The content-address is the canonical hash of the injected snapshot.
    expect(record.aggregateSnapshot?.snapshotHash).toBe(
      hashAggregateSnapshot(snapshot),
    );
    // The bound snapshot IS in the auditHash pre-image, so the record verifies.
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("the recorded snapshot IS part of the auditHash pre-image (tamper → tampered)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, {
      sink,
      aggregateSnapshot: recordAggregateSnapshot(snapshot),
    });
    // Tamper the recorded windows → the auditHash no longer matches.
    const tampered = {
      ...record,
      aggregateSnapshot: {
        snapshot: { ...snapshot, windows: { "acct_7|daily": 999_999 } },
        snapshotHash: record.aggregateSnapshot!.snapshotHash,
      },
    };
    const v = verifyAuditRecord(tampered);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("tampered");
  });

  it("OMITS the field on the main path when not injected (no undefined key, hash-stable)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, { sink });
    expect("aggregateSnapshot" in record).toBe(false);
    // The omitting record still verifies — the absent field was never in the
    // pre-image, proving the conditional spread is byte-identical to pre-052.
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("records the snapshot onto the KILL-SWITCH path record", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const context = createRuntimeContext({ id: "tenant-052" });
    context.killSwitch.set(true, "test-052-maintenance");
    const record = await emitOne(passBundle, {
      sink,
      context,
      aggregateSnapshot: recordAggregateSnapshot(snapshot),
    });
    expect(record.decision.kind).toBe("REFUSE"); // kill-switch path
    expect(record.aggregateSnapshot?.snapshot).toEqual(snapshot);
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("the wrapper does NOT mutate/refetch/timestamp the injected snapshot (read-only)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const recorded = recordAggregateSnapshot(snapshot);
    // Freeze the injected snapshot deeply: any mutation attempt by the wrapper
    // would throw in strict mode (vitest runs ESM strict).
    Object.freeze(recorded);
    Object.freeze(recorded.snapshot);
    Object.freeze(recorded.snapshot.windows);
    const before = JSON.stringify(recorded);
    const record = await emitOne(passBundle, {
      sink,
      aggregateSnapshot: recorded,
    });
    // The dep object is byte-identical after the call (no mutation/refetch).
    expect(JSON.stringify(recorded)).toBe(before);
    // The recorded `at` is the SHELL-sampled value, NOT re-timestamped by the
    // wrapper's clock (which would have been the record's own `at`).
    expect(record.aggregateSnapshot?.snapshot.at).toBe(snapshot.at);
    expect(record.aggregateSnapshot?.snapshot.at).not.toBe(record.at);
  });

  it("replay over the RECORDED snapshot reproduces the SAME decision (§D-5, non-vacuous)", async () => {
    // A business guard whose decision DEPENDS on the injected aggregate snapshot
    // (read read-only off injected state): over-limit → REFUSE, under-limit →
    // EXECUTE. This makes the replay assertion non-vacuous — the snapshot value
    // genuinely drives the outcome.
    const LIMIT = 2000;
    const snapshotBundle: PolicyBundle<
      string,
      unknown,
      { aggregate: AggregateSnapshot }
    > = {
      stateGuards: [],
      authGuards: [],
      taint: taintPolicy,
      business: [
        (_env, state) =>
          state.aggregate.windows["acct_7|daily"]! >= LIMIT
            ? decisionRefuse(
                refuse("BUSINESS_RULE", "aggregate.limit.exceeded", "over limit"),
                [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
              )
            : decisionExecute([
                basis("business", BASIS_CODES.business.RULE_SATISFIED),
              ]),
      ],
      default: "REFUSE",
    };
    // Inject an OVER-limit snapshot → the decision must be REFUSE.
    const overLimit: AggregateSnapshot = {
      windows: { "acct_7|daily": 2500 },
      at: "2026-04-23T11:59:00.000Z",
    };
    const recorded = recordAggregateSnapshot(overLimit);
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(
      envFixture(),
      { aggregate: overLimit },
      snapshotBundle,
      { sink, aggregateSnapshot: recorded },
    );
    expect(result.decision.kind).toBe("REFUSE");
    expect(result.record.aggregateSnapshot).toEqual(recorded);

    // REPLAY: re-derive the snapshot from the RECORDED audit field (fail-closed
    // integrity check) and re-run the PURE kernel over it. The decision must be
    // byte-identical to the one originally recorded.
    const replayedSnapshot = aggregateSnapshotFromRecorded(
      result.record.aggregateSnapshot!,
    );
    const replayed = adjudicate(
      envFixture(),
      { aggregate: replayedSnapshot },
      snapshotBundle,
    );
    expect(replayed.kind).toBe(result.decision.kind);
    expect(replayed.basis).toEqual(result.decision.basis);

    // Counter-proof the dependence is real: an UNDER-limit recorded snapshot
    // replays to EXECUTE, so the snapshot value genuinely drives the outcome.
    const underLimit = recordAggregateSnapshot({
      windows: { "acct_7|daily": 100 },
      at: overLimit.at,
    });
    const replayedUnder = adjudicate(
      envFixture(),
      { aggregate: aggregateSnapshotFromRecorded(underLimit) },
      snapshotBundle,
    );
    expect(replayedUnder.kind).toBe("EXECUTE");
  });

  it("a tampered/drifted recorded snapshot FAILS replay closed (invariant #6)", () => {
    const recorded = recordAggregateSnapshot(snapshot);
    const drifted = {
      ...recorded,
      snapshot: { ...snapshot, windows: { "acct_7|daily": 0 } }, // hash no longer matches
    };
    expect(() => aggregateSnapshotFromRecorded(drifted)).toThrow(
      /integrity failure/,
    );
  });

  it("injecting the aggregate snapshot does NOT change the intentHash (invariant #4)", async () => {
    // The intentHash is a function of the envelope only; the injected snapshot
    // rides as deps/state, never an envelope field. The recorded subject hash
    // equals the bare-envelope hash with or without the snapshot.
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const baseEnv = envFixture();
    const withSnap = await emitOne(passBundle, {
      sink,
      aggregateSnapshot: recordAggregateSnapshot(snapshot),
    });
    const withoutSnap = await emitOne(passBundle, { sink });
    expect(withSnap.intentHash).toBe(baseEnv.intentHash);
    expect(withoutSnap.intentHash).toBe(baseEnv.intentHash);
    expect(withSnap.envelope.intentHash).toBe(withoutSnap.envelope.intentHash);
  });
});

// ── 051: the cumulative/velocity guard family wired through the full pipeline ──
// These exercise the REAL exported `createCumulativeVelocityGuard` (not an ad-hoc
// inline bundle) end-to-end through `adjudicateAndAudit`: an over-limit horizon
// deterministically RAISES friction (REFUSE) and triggers the rate-limit rollback;
// an under-limit horizon EXECUTEs and does NOT roll back; the boundary is exact;
// and on the over-limit (non-EXECUTE) decision the rollback FAILS CLOSED — it fires
// even when the audit sink throws (T2/#41, invariant #6: a transient sink failure
// must never leave a legitimate user's counter incremented for an unauthorized
// request). Replay over the recorded snapshot reproduces the same decision (§D-5).
describe("adjudicateAndAudit — 051 cumulative/velocity guard family", () => {
  type S051 = { aggregate?: AggregateSnapshot };

  const WINDOW = "acct_7|daily";
  const MAX = 5;

  // A policy whose ONLY business guard is the real 051 cumulative/velocity guard,
  // reading the injected snapshot off state. default REFUSE so an under-limit
  // path falls through to EXECUTE only via an explicit pass guard.
  const velocityBundle: PolicyBundle<string, unknown, S051> = {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business: [
      createCumulativeVelocityGuard<string, unknown, S051>({
        resolveSnapshot: (_e, s) => s.aggregate,
        horizons: [{ windowKey: WINDOW, max: MAX }],
      }),
      // Pass guard: when the velocity guard returns null (under limit) this
      // affirmatively EXECUTEs so the under-limit path is a clean EXECUTE.
      () => decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]),
    ],
    default: "REFUSE",
  };

  function snapAt(committed: number): AggregateSnapshot {
    return { windows: { [WINDOW]: committed }, at: "2026-04-23T11:59:00.000Z" };
  }

  it("over-limit horizon ⇒ deterministic REFUSE (friction raised, never bypass)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    // committed 5 + increment 1 = 6 > 5 → REFUSE.
    const over = snapAt(5);
    const result = await adjudicateAndAudit(
      envFixture(),
      { aggregate: over },
      velocityBundle,
      { sink, aggregateSnapshot: recordAggregateSnapshot(over) },
    );
    expect(result.decision.kind).toBe("REFUSE");
    if (result.decision.kind !== "REFUSE") return;
    expect(result.decision.refusal.code).toBe("cumulative_limit_exceeded");
  });

  it("under-limit horizon ⇒ EXECUTE (the guard does not block legitimate traffic)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    // committed 3 + 1 = 4 <= 5 → guard returns null → pass guard EXECUTEs.
    const under = snapAt(3);
    const result = await adjudicateAndAudit(
      envFixture(),
      { aggregate: under },
      velocityBundle,
      { sink, aggregateSnapshot: recordAggregateSnapshot(under) },
    );
    expect(result.decision.kind).toBe("EXECUTE");
  });

  it("boundary: projected exactly AT the cap EXECUTEs; one over REFUSEs", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    // committed 4 + 1 = 5 == max → allowed → EXECUTE.
    const atCap = await adjudicateAndAudit(
      envFixture(),
      { aggregate: snapAt(4) },
      velocityBundle,
      { sink },
    );
    expect(atCap.decision.kind).toBe("EXECUTE");
    // committed 5 + 1 = 6 > 5 → REFUSE.
    const overCap = await adjudicateAndAudit(
      envFixture(),
      { aggregate: snapAt(5) },
      velocityBundle,
      { sink },
    );
    expect(overCap.decision.kind).toBe("REFUSE");
  });

  it("over-limit (non-EXECUTE) decision rolls the rate-limit counter back", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const rollback = vi.fn(async () => {});
    await adjudicateAndAudit(envFixture(), { aggregate: snapAt(5) }, velocityBundle, {
      sink,
      rateLimitRollback: rollback,
    });
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("under-limit EXECUTE does NOT roll the counter back (the request was authorized)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const rollback = vi.fn(async () => {});
    const result = await adjudicateAndAudit(
      envFixture(),
      { aggregate: snapAt(3) },
      velocityBundle,
      { sink, rateLimitRollback: rollback },
    );
    expect(result.decision.kind).toBe("EXECUTE");
    expect(rollback).not.toHaveBeenCalled();
  });

  it("FAIL-CLOSED: a write-path (sink) error on an over-limit decision still rolls back, then rethrows", async () => {
    // The over-limit REFUSE is correct; the audit sink then throws. The rollback
    // MUST still fire (try/finally) — a transient sink failure must not leave a
    // legitimate user's counter incremented for an unauthorized request — and the
    // error must propagate (the caller never receives a clean result that hides a
    // failed audit write). This is the §C/#6 fail-closed contract on the write path.
    const throwingSink: AuditSink = {
      async emit() {
        throw new Error("audit store down");
      },
    };
    const rollback = vi.fn(async () => {});
    await expect(
      adjudicateAndAudit(envFixture(), { aggregate: snapAt(5) }, velocityBundle, {
        sink: throwingSink,
        rateLimitRollback: rollback,
      }),
    ).rejects.toThrow("audit store down");
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("FAIL-CLOSED: a write-path (sink) error on an under-limit EXECUTE aborts — error propagates, no clean result", async () => {
    // Under-limit the decision is EXECUTE, but the durable audit write fails. The
    // wrapper MUST NOT swallow it and hand back a clean EXECUTE result (that would
    // be fail-OPEN — an EXECUTE with no durable audit row). The error propagates
    // (#6: a store/IO error on the write path aborts the EXECUTE path).
    const throwingSink: AuditSink = {
      async emit() {
        throw new Error("audit store down");
      },
    };
    await expect(
      adjudicateAndAudit(envFixture(), { aggregate: snapAt(3) }, velocityBundle, {
        sink: throwingSink,
      }),
    ).rejects.toThrow("audit store down");
  });

  it("replay over the RECORDED snapshot reproduces the same decision (§D-5, non-vacuous)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const over = snapAt(5);
    const result = await adjudicateAndAudit(
      envFixture(),
      { aggregate: over },
      velocityBundle,
      { sink, aggregateSnapshot: recordAggregateSnapshot(over) },
    );
    expect(result.decision.kind).toBe("REFUSE");
    // Re-derive the snapshot from the recorded content-address (fail-closed
    // integrity), then re-run the PURE kernel over it through the SAME 051 guard.
    const replayedSnapshot = aggregateSnapshotFromRecorded(
      result.record.aggregateSnapshot!,
    );
    const replayed = adjudicate(
      envFixture(),
      { aggregate: replayedSnapshot },
      velocityBundle,
    );
    expect(replayed.kind).toBe(result.decision.kind);
    expect(replayed.basis).toEqual(result.decision.basis);

    // Counter-proof: an under-limit recorded snapshot replays to EXECUTE.
    const under = recordAggregateSnapshot(snapAt(3));
    const replayedUnder = adjudicate(
      envFixture(),
      { aggregate: aggregateSnapshotFromRecorded(under) },
      velocityBundle,
    );
    expect(replayedUnder.kind).toBe("EXECUTE");
  });
});

// ─── 092: AuditSigner wiring at BOTH buildAuditRecord call sites ─────────────
// Proves deps.signer populates a REAL signature on the main path AND the
// kill-switch early-return path, that signing does NOT change the auditHash
// (pre-image exclusion), and that a throwing signer FAILS CLOSED (no record
// emitted).
describe("adjudicateAndAudit — 092 AuditSigner injection", () => {
  async function emitOne(
    bundle: PolicyBundle<string, unknown, unknown>,
    deps: Parameters<typeof adjudicateAndAudit>[3],
    env = envFixture(),
  ): Promise<AuditRecord> {
    const result = await adjudicateAndAudit(env, {}, bundle, deps);
    return result.record;
  }

  it("MAIN path: deps.signer attaches a verifiable signature over the auditHash", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, {
      sink,
      signer: hashBindAuditSigner("kms://main-key"),
    });
    expect(record.decision.kind).toBe("EXECUTE");
    expect(record.signature).toBeDefined();
    expect(record.signature!.keyId).toBe("kms://main-key");
    expect(record.signature!.alg).toBe("sha256-hashbind");
    // The signed record verifies on BOTH the hash axis and the signature axis.
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("KILL-SWITCH path: deps.signer attaches a verifiable signature on the early-return REFUSE", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const context = createRuntimeContext({ id: "tenant-092" });
    context.killSwitch.set(true, "test-092-maintenance");
    const record = await emitOne(passBundle, {
      sink,
      context,
      signer: hashBindAuditSigner("kms://kill-key"),
    });
    // Sanity: this is the kill-switch early-return path, not the main path.
    expect(record.decision.kind).toBe("REFUSE");
    expect(record.signature).toBeDefined();
    expect(record.signature!.keyId).toBe("kms://kill-key");
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("signing does NOT change the auditHash (pre-image exclusion) on the emitted record", async () => {
    const signedSink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const unsignedSink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const signed = await emitOne(passBundle, {
      sink: signedSink,
      signer: hashBindAuditSigner("kms://k"),
      clock: { nowIso: () => "2026-04-23T12:00:05.000Z", nowMs: () => 0 },
    });
    const unsigned = await emitOne(passBundle, {
      sink: unsignedSink,
      clock: { nowIso: () => "2026-04-23T12:00:05.000Z", nowMs: () => 0 },
    });
    // Identical inputs (fixed clock) → identical auditHash whether or not signed.
    expect(signed.auditHash).toBe(unsigned.auditHash);
    expect(unsigned.signature).toBeUndefined();
  });

  it("OMITS the signature when no signer is supplied (OSS tamper-evident-only)", async () => {
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const record = await emitOne(passBundle, { sink });
    expect("signature" in record).toBe(false);
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("FAIL-CLOSED: a throwing signer aborts the call and emits NO record (main path)", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const sink: AuditSink = { emit };
    const throwingSigner: AuditSigner = {
      keyId: "kms://broken",
      sign() {
        throw new Error("KMS unavailable");
      },
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, {
        sink,
        signer: throwingSigner,
      }),
    ).rejects.toThrow("KMS unavailable");
    // No unsigned record was emitted — the signer error fails CLOSED before sink.emit.
    expect(emit).not.toHaveBeenCalled();
  });

  it("FAIL-CLOSED: a throwing signer aborts the kill-switch path and emits NO record", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const sink: AuditSink = { emit };
    const context = createRuntimeContext({ id: "tenant-092-fc" });
    context.killSwitch.set(true, "test-092-maintenance");
    const throwingSigner: AuditSigner = {
      keyId: "kms://broken",
      sign() {
        throw new Error("HSM offline");
      },
    };
    await expect(
      adjudicateAndAudit(envFixture(), {}, passBundle, {
        sink,
        context,
        signer: throwingSigner,
      }),
    ).rejects.toThrow("HSM offline");
    expect(emit).not.toHaveBeenCalled();
  });
});
