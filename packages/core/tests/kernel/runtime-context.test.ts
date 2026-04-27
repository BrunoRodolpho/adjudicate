/**
 * RuntimeContext — per-tenant container isolating kill switch + sinks +
 * enforce config from the process-wide default. Verifies #8 (multi-tenancy)
 * and #16 (env-seed reseed) from the assurance audit.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  type AuditSink,
  type DecisionEvent,
  type LearningEvent,
  type LearningSink,
  type MetricsSink,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";
import {
  adjudicateAndAudit,
  createRuntimeContext,
  getDefaultRuntimeContext,
  setLearningSink,
  setMetricsSink,
  _resetDefaultRuntimeContext,
  _resetLearningSink,
  _resetMetricsSink,
  _resetShadowTelemetrySink,
} from "../../src/kernel/index.js";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const passBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [() => decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])],
  default: "EXECUTE",
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

afterEach(() => {
  _resetMetricsSink();
  _resetLearningSink();
  _resetShadowTelemetrySink();
  _resetDefaultRuntimeContext();
});

describe("RuntimeContext — kill switch isolation", () => {
  it("two contexts have independent kill switches", () => {
    const ctxA = createRuntimeContext({ id: "tenant-a" });
    const ctxB = createRuntimeContext({ id: "tenant-b" });
    expect(ctxA.killSwitch.isKilled()).toBe(false);
    expect(ctxB.killSwitch.isKilled()).toBe(false);

    ctxA.killSwitch.set(true, "incident-A");
    expect(ctxA.killSwitch.isKilled()).toBe(true);
    expect(ctxB.killSwitch.isKilled()).toBe(false);
  });

  it("env-var seed is per-context (custom envVar override)", () => {
    const ctxA = createRuntimeContext({
      id: "a",
      killSwitchEnvVar: "KILL_A",
      envSeed: { KILL_A: "1" },
    });
    const ctxB = createRuntimeContext({
      id: "b",
      killSwitchEnvVar: "KILL_B",
      envSeed: { KILL_A: "1" },
    });
    expect(ctxA.killSwitch.isKilled()).toBe(true);
    expect(ctxB.killSwitch.isKilled()).toBe(false);
  });

  it("reseedFromEnv re-reads the env after a manual toggle (#16)", () => {
    const ctx = createRuntimeContext({
      id: "a",
      envSeed: { IBX_KILL_SWITCH: "0" },
    });
    expect(ctx.killSwitch.isKilled()).toBe(false);
    ctx.killSwitch.set(false, "manual off");
    // Without reseed: env change does not take effect after manual toggle.
    expect(ctx.killSwitch.isKilled()).toBe(false);
    // Reseed with new env — operator escalation pathway.
    ctx.killSwitch.reseedFromEnv({ IBX_KILL_SWITCH: "1" });
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("env: IBX_KILL_SWITCH");
  });
});

describe("RuntimeContext — sink slot isolation", () => {
  it("two contexts have independent metrics sinks", () => {
    const ctxA = createRuntimeContext({ id: "a" });
    const ctxB = createRuntimeContext({ id: "b" });
    const eventsA: DecisionEvent[] = [];
    const eventsB: DecisionEvent[] = [];
    const sinkA: MetricsSink = {
      recordLedgerOp() {},
      recordDecision: (e) => eventsA.push(e),
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    const sinkB: MetricsSink = {
      recordLedgerOp() {},
      recordDecision: (e) => eventsB.push(e),
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    ctxA.metrics.set(sinkA);
    ctxB.metrics.set(sinkB);

    ctxA.metrics.recordDecision({
      intentKind: "x.do",
      decision: "EXECUTE",
      latencyMs: 1,
      basisCount: 1,
      intentHash: "h",
    });
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });

  it("two contexts have independent learning sinks", () => {
    const ctxA = createRuntimeContext({ id: "a" });
    const ctxB = createRuntimeContext({ id: "b" });
    const eventsA: LearningEvent[] = [];
    const eventsB: LearningEvent[] = [];
    ctxA.learning.set({ recordOutcome: (e) => eventsA.push(e) });
    ctxB.learning.set({ recordOutcome: (e) => eventsB.push(e) });

    ctxA.learning.current().recordOutcome({
      intentKind: "x.do",
      decisionKind: "EXECUTE",
      basisCodes: [],
      taint: "SYSTEM",
      durationMs: 0,
      intentHash: "h",
      at: "2026-04-23T12:00:00.000Z",
    });
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });

  it("hasExplicit() distinguishes default no-op from user-installed sinks", () => {
    const ctx = createRuntimeContext();
    expect(ctx.metrics.hasExplicit()).toBe(false);
    expect(ctx.learning.hasExplicit()).toBe(false);
    ctx.metrics.set({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    expect(ctx.metrics.hasExplicit()).toBe(true);
    ctx.metrics.reset();
    expect(ctx.metrics.hasExplicit()).toBe(false);
  });
});

describe("RuntimeContext — enforce config isolation", () => {
  it("two contexts parse independent shadow lists", () => {
    const ctxA = createRuntimeContext({
      id: "a",
      envSeed: { IBX_KERNEL_SHADOW: "order.submit" },
    });
    const ctxB = createRuntimeContext({
      id: "b",
      envSeed: { IBX_KERNEL_SHADOW: "payment.confirm" },
    });
    expect(ctxA.enforceConfig.isShadowed("order.submit")).toBe(true);
    expect(ctxB.enforceConfig.isShadowed("order.submit")).toBe(false);
    expect(ctxB.enforceConfig.isShadowed("payment.confirm")).toBe(true);
  });
});

describe("RuntimeContext — adjudicateAndAudit routing", () => {
  it("metrics route to the tenant context, not the default", async () => {
    const tenant = createRuntimeContext({ id: "tenant-a" });
    const tenantEvents: DecisionEvent[] = [];
    tenant.metrics.set({
      recordLedgerOp() {},
      recordDecision: (e) => tenantEvents.push(e),
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });

    const defaultEvents: DecisionEvent[] = [];
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision: (e) => defaultEvents.push(e),
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });

    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      context: tenant,
    });
    expect(tenantEvents).toHaveLength(1);
    expect(defaultEvents).toHaveLength(0);
  });

  it("learning routes to the tenant context, not the default", async () => {
    const tenant = createRuntimeContext({ id: "tenant-a" });
    const tenantEvents: LearningEvent[] = [];
    tenant.learning.set({ recordOutcome: (e) => tenantEvents.push(e) });

    const defaultEvents: LearningEvent[] = [];
    setLearningSink({ recordOutcome: (e) => defaultEvents.push(e) });

    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      context: tenant,
    });
    expect(tenantEvents).toHaveLength(1);
    expect(defaultEvents).toHaveLength(0);
  });

  it("tenant kill switch short-circuits to SECURITY refusal", async () => {
    const tenant = createRuntimeContext({ id: "tenant-a" });
    tenant.killSwitch.set(true, "tenant incident");
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const result = await adjudicateAndAudit(envFixture(), {}, passBundle, {
      sink,
      context: tenant,
    });
    expect(result.decision.kind).toBe("REFUSE");
    if (result.decision.kind !== "REFUSE") throw new Error();
    expect(result.decision.refusal.code).toBe("kill_switch_active");
    expect(result.decision.basis[0]!.detail!.tenant).toBe("tenant-a");
  });

  it("default context kill switch is unaffected by tenant flips", async () => {
    const tenant = createRuntimeContext({ id: "tenant-a" });
    tenant.killSwitch.set(true, "tenant incident");
    expect(getDefaultRuntimeContext().killSwitch.isKilled()).toBe(false);
  });

  it("without context, telemetry routes to module-level singletons (back-compat)", async () => {
    const events: DecisionEvent[] = [];
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision: (e) => events.push(e),
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const sink: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    await adjudicateAndAudit(envFixture(), {}, passBundle, { sink });
    expect(events).toHaveLength(1);
  });
});

describe("getDefaultRuntimeContext", () => {
  it("returns the same instance across calls", () => {
    const a = getDefaultRuntimeContext();
    const b = getDefaultRuntimeContext();
    expect(a).toBe(b);
  });

  it("_resetDefaultRuntimeContext drops the cached default", () => {
    const a = getDefaultRuntimeContext();
    _resetDefaultRuntimeContext();
    const b = getDefaultRuntimeContext();
    expect(a).not.toBe(b);
  });
});
