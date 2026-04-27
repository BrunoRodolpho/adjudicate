/**
 * installPack — pack-conformance + default sink wiring smoke tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasLearningSink,
  hasMetricsSink,
  installPack,
  PackConformanceError,
  setLearningSink,
  setMetricsSink,
  _resetLearningSink,
  _resetMetricsSink,
  type CapabilityPlanner,
  type Guard,
  type LearningSink,
  type MetricsSink,
  type PackV0,
  type PolicyBundle,
  type TaintPolicy,
} from "../src/index.js";

type K = "thing.do";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
const planner: CapabilityPlanner<unknown, unknown> = {
  plan() {
    return { visibleReadTools: [], allowedIntents: ["thing.do"], forbiddenConcepts: [] };
  },
};

function makePack(overrides: Partial<PackV0<K, unknown, unknown, unknown>> = {}) {
  const business: ReadonlyArray<Guard<K, unknown, unknown>> = [() => null];
  const policy: PolicyBundle<K, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business,
    default: "REFUSE",
  };
  return {
    id: "pack-test",
    version: "0.1.0-experimental",
    contract: "v0",
    intents: ["thing.do"] as const,
    policy,
    planner,
    basisCodes: ["thing.do.invalid"],
    ...overrides,
  } as const satisfies PackV0<K, unknown, unknown, unknown>;
}

describe("installPack", () => {
  beforeEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });
  afterEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });

  it("returns the pack wrapped with withBasisAudit by default", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(result.pack).not.toBe(makePack().policy);
    expect(result.pack.id).toBe("pack-test");
  });

  it("installs default metrics + learning sinks when none set and warns once each", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(hasMetricsSink()).toBe(true);
    expect(hasLearningSink()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/default console metrics sink/);
    expect(warn.mock.calls[1]![0]).toMatch(/default console learning sink/);
    expect(result.installedDefaults).toContain("metrics");
    expect(result.installedDefaults).toContain("learning");
  });

  it("does NOT install a default learning sink when one is already set", () => {
    const customLearning: LearningSink = { recordOutcome() {} };
    setLearningSink(customLearning);
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(result.installedDefaults).not.toContain("learning");
  });

  it("respects installDefaultLearning: false", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultLearning: false,
      installDefaultMetrics: false,
      warn,
    });
    expect(hasLearningSink()).toBe(false);
    expect(result.installedDefaults).not.toContain("learning");
  });

  it("does NOT install a default metrics sink when one is already set", () => {
    const customSink: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
    };
    setMetricsSink(customSink);
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultLearning: false,
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(result.installedDefaults).not.toContain("metrics");
  });

  it("respects installDefaultMetrics: false", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), {
      installDefaultMetrics: false,
      installDefaultLearning: false,
      warn,
    });
    expect(hasMetricsSink()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(result.installedDefaults).not.toContain("metrics");
  });

  it("respects auditBasisDrift: false (returns the pack unwrapped)", () => {
    const warn = vi.fn();
    const original = makePack();
    const result = installPack(original, {
      auditBasisDrift: false,
      installDefaultMetrics: false,
      warn,
    });
    expect(result.pack).toBe(original);
  });

  it("throws PackConformanceError when the pack fails conformance", () => {
    const warn = vi.fn();
    expect(() =>
      installPack(makePack({ basisCodes: [] }), {
        installDefaultMetrics: false,
        warn,
      }),
    ).toThrow(PackConformanceError);
  });

  it("does NOT install metrics if conformance fails (fails fast)", () => {
    const warn = vi.fn();
    expect(() =>
      installPack(makePack({ id: "" }), { warn }),
    ).toThrow(PackConformanceError);
    expect(hasMetricsSink()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  // ── T4 #20: default-EXECUTE rejection wired through installPack ─────
  it("throws PackConformanceError when policy.default = EXECUTE and allowDefaultExecute is not set", () => {
    const warn = vi.fn();
    const execPack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() =>
      installPack(execPack, {
        warn,
        installDefaultMetrics: false,
        installDefaultLearning: false,
      }),
    ).toThrow(PackConformanceError);
  });

  it("accepts policy.default = EXECUTE when allowDefaultExecute: true is passed", () => {
    const warn = vi.fn();
    const execPack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() =>
      installPack(execPack, {
        warn,
        installDefaultMetrics: false,
        installDefaultLearning: false,
        allowDefaultExecute: true,
      }),
    ).not.toThrow();
  });
});
