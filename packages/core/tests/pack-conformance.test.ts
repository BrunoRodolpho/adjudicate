/**
 * Coverage for pack-conformance:
 *   - assertPackConformance — boot-time validator
 *   - withBasisAudit         — runtime decorator emitting basis_code_drift
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertPackConformance,
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  KERNEL_REFUSAL_CODES,
  PackConformanceError,
  refuse,
  setMetricsSink,
  withBasisAudit,
  _resetMetricsSink,
  type MetricsSink,
  type PackV0,
  type Plan,
  type CapabilityPlanner,
  type Guard,
  type PolicyBundle,
  type TaintPolicy,
} from "../src/index.js";
import { adjudicate } from "../src/kernel/adjudicate.js";

type K = "thing.do";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
const planner: CapabilityPlanner<unknown, unknown> = {
  plan(): Plan {
    return {
      visibleReadTools: [],
      allowedIntents: ["thing.do"],
      forbiddenConcepts: [],
    };
  },
};

function makePack(overrides: Partial<PackV0<K, unknown, unknown, unknown>> = {}) {
  const business: ReadonlyArray<Guard<K, unknown, unknown>> = [
    () => null,
  ];
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

describe("assertPackConformance", () => {
  it("accepts a well-formed Pack", () => {
    expect(() => assertPackConformance(makePack())).not.toThrow();
  });

  it("rejects an empty id", () => {
    expect(() =>
      assertPackConformance(makePack({ id: "" })),
    ).toThrow(PackConformanceError);
  });

  it("rejects an empty intents array", () => {
    expect(() =>
      assertPackConformance(
        makePack({
          intents: [] as unknown as readonly K[],
        }),
      ),
    ).toThrow(/non-empty array/);
  });

  it("rejects duplicate intent kinds", () => {
    expect(() =>
      assertPackConformance(
        makePack({
          intents: ["thing.do", "thing.do"] as unknown as readonly K[],
        }),
      ),
    ).toThrow(/duplicate intent kind/);
  });

  it("rejects an empty basisCodes array", () => {
    expect(() =>
      assertPackConformance(makePack({ basisCodes: [] })),
    ).toThrow(/basisCodes/);
  });

  it("rejects duplicate basis codes", () => {
    expect(() =>
      assertPackConformance(
        makePack({ basisCodes: ["a", "a"] }),
      ),
    ).toThrow(/duplicate basis code/);
  });

  it("aggregates multiple violations into a single error", () => {
    let caught: PackConformanceError | undefined;
    try {
      assertPackConformance(
        makePack({ id: "", basisCodes: [] }),
      );
    } catch (err) {
      caught = err as PackConformanceError;
    }
    expect(caught).toBeInstanceOf(PackConformanceError);
    expect(caught!.violations.length).toBe(2);
  });

  // ── T4 #20: default-EXECUTE rejection ────────────────────────────────
  it("rejects policy.default = EXECUTE by default", () => {
    const pack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() => assertPackConformance(pack)).toThrow(/allowDefaultExecute/);
  });

  it("accepts policy.default = EXECUTE when { allowDefaultExecute: true } is passed", () => {
    const pack = makePack({
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "EXECUTE",
      },
    });
    expect(() =>
      assertPackConformance(pack, { allowDefaultExecute: true }),
    ).not.toThrow();
  });

  // ── T4 #38: signals shape validation ─────────────────────────────────
  it("accepts a Pack with declared signals", () => {
    expect(() =>
      assertPackConformance(makePack({ signals: ["payment.confirmed"] })),
    ).not.toThrow();
  });

  it("rejects an empty-string signal", () => {
    expect(() =>
      assertPackConformance(
        makePack({ signals: [""] as unknown as readonly string[] }),
      ),
    ).toThrow(/signals/);
  });

  it("rejects duplicate signals", () => {
    expect(() =>
      assertPackConformance(
        makePack({ signals: ["x", "x"] }),
      ),
    ).toThrow(/duplicate signal/);
  });
});

describe("withBasisAudit — runtime drift detection", () => {
  let sink: MetricsSink;
  let recordedFailures: Array<{ subject: string; errorClass: string }>;

  beforeEach(() => {
    recordedFailures = [];
    sink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(event) {
        recordedFailures.push({
          subject: event.subject,
          errorClass: event.errorClass,
        });
      },
      recordShadowDivergence() {},
    };
    setMetricsSink(sink);
  });

  afterEach(() => {
    _resetMetricsSink();
  });

  function makeEnv() {
    return buildEnvelope({
      kind: "thing.do",
      payload: {},
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
  }

  it("does not record drift when refusal.code is in basisCodes", () => {
    const refusing: Guard<K, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "thing.do.invalid", "no"), [
        basis("business", BASIS_CODES.business.RULE_VIOLATED),
      ]);
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [refusing],
          default: "REFUSE",
        },
      }),
    );
    adjudicate(makeEnv(), {}, wrapped.policy);
    expect(recordedFailures).toHaveLength(0);
  });

  it("records drift when refusal.code is NOT in basisCodes and NOT a kernel code", () => {
    const driftingGuard: Guard<K, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "undeclared.code.here", "drift"), [
        basis("business", BASIS_CODES.business.RULE_VIOLATED),
      ]);
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [driftingGuard],
          default: "REFUSE",
        },
      }),
    );
    adjudicate(makeEnv(), {}, wrapped.policy);
    expect(recordedFailures).toHaveLength(1);
    expect(recordedFailures[0]!.errorClass).toBe("basis_code_drift");
    expect(recordedFailures[0]!.subject).toBe("pack:pack-test:undeclared.code.here");
  });

  it("does not record drift for kernel-vocabulary refusal codes", () => {
    // schema_version_unsupported is a kernel-emitted code; if a guard ever
    // returns it explicitly, the wrapper recognizes it as kernel vocabulary.
    const kernelMimicGuard: Guard<K, unknown, unknown> = () =>
      decisionRefuse(
        refuse("SECURITY", "schema_version_unsupported", "kernel msg"),
        [],
      );
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [kernelMimicGuard],
          default: "REFUSE",
        },
      }),
    );
    adjudicate(makeEnv(), {}, wrapped.policy);
    expect(recordedFailures).toHaveLength(0);
  });

  it("does not block the decision — drift is observed, not enforced", () => {
    const driftingGuard: Guard<K, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "undeclared.foo", "drift"), [
        basis("business", BASIS_CODES.business.RULE_VIOLATED),
      ]);
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [driftingGuard],
          default: "REFUSE",
        },
      }),
    );
    const decision = adjudicate(makeEnv(), {}, wrapped.policy);
    // The original REFUSE decision still flows back — wrapper is observe-only.
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("undeclared.foo");
  });

  it("does not record drift on EXECUTE when basis is in vocabulary", () => {
    const executingGuard: Guard<K, unknown, unknown> = () =>
      decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]);
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [executingGuard],
          default: "REFUSE",
        },
      }),
    );
    adjudicate(makeEnv(), {}, wrapped.policy);
    expect(recordedFailures).toHaveLength(0);
  });

  // ── T4: basis-vocabulary drift across all decision kinds ───────────
  it("records basis_vocabulary_drift on EXECUTE with an unknown basis category", () => {
    // Cast to bypass TS — adopters who erase types could land here.
    const fauxBasis = {
      category: "made_up_category",
      code: "made_up_code",
    } as unknown as ReturnType<typeof basis>;
    const executingGuard: Guard<K, unknown, unknown> = () =>
      decisionExecute([fauxBasis]);
    const wrapped = withBasisAudit(
      makePack({
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: taintPolicy,
          business: [executingGuard],
          default: "REFUSE",
        },
      }),
    );
    adjudicate(makeEnv(), {}, wrapped.policy);
    expect(recordedFailures.length).toBeGreaterThanOrEqual(1);
    expect(
      recordedFailures.some((f) => f.errorClass === "basis_vocabulary_drift"),
    ).toBe(true);
  });

  it("preserves the original Pack — does not mutate", () => {
    const original = makePack();
    const wrapped = withBasisAudit(original);
    expect(wrapped).not.toBe(original);
    expect(wrapped.policy).not.toBe(original.policy);
    expect(wrapped.id).toBe(original.id);
  });

  it("KERNEL_REFUSAL_CODES is stable", () => {
    expect(KERNEL_REFUSAL_CODES.has("schema_version_unsupported")).toBe(true);
    expect(KERNEL_REFUSAL_CODES.has("taint_level_insufficient")).toBe(true);
    expect(KERNEL_REFUSAL_CODES.has("default_deny")).toBe(true);
  });
});

// Suppress unused vi import warning by using it once.
void vi;
