/**
 * Invariant: a throwing guard never panics out of `adjudicate()`.
 *
 * Per ADR-106 — the kernel wraps every guard invocation in try/catch and
 * converts a thrown error into a SECURITY REFUSE with the `kernel.GUARD_PANIC`
 * basis. The error never propagates to the adopter.
 *
 * This file tests that property exhaustively across:
 *   - all four guard phases (state, taint, auth, business)
 *   - throws at different positions in each phase's guard array
 *   - synchronous throws of Error and non-Error values
 *   - identical inputs producing byte-identical REFUSE basis (determinism)
 */
import { describe, expect, it } from "vitest";
import { adjudicate, adjudicateWithTrace } from "../../../src/kernel/adjudicate.js";
import { adjudicateAndAudit } from "../../../src/kernel/adjudicate-and-audit.js";
import {
  createRuntimeContext,
  type RuntimeContext,
} from "../../../src/kernel/runtime-context.js";
import { buildEnvelope, type IntentEnvelope } from "../../../src/envelope.js";
import { decisionRewrite } from "../../../src/decision.js";
import { noopAuditSink } from "../../../src/sink.js";
import type { Guard, PolicyBundle } from "../../../src/kernel/policy.js";
import type { TaintPolicy } from "../../../src/taint.js";

type TestKind = "k1";
type TestPayload = { value: number };
type TestState = { foo: string };

const baseEnvelope = buildEnvelope<TestKind, TestPayload>({
  kind: "k1",
  payload: { value: 42 },
  actor: { principal: "llm", sessionId: "s1" },
  taint: "TRUSTED",
  nonce: "fixed-nonce-for-determinism",
});

const baseState: TestState = { foo: "bar" };

const permissiveTaint: TaintPolicy = {
  minimumFor: () => "UNTRUSTED",
};

function makeBundle(
  overrides: Partial<PolicyBundle<TestKind, TestPayload, TestState>> = {},
): PolicyBundle<TestKind, TestPayload, TestState> {
  return {
    stateGuards: [],
    authGuards: [],
    business: [],
    taint: permissiveTaint,
    default: "REFUSE",
    ...overrides,
  };
}

function throwingGuard(message: string): Guard<TestKind, TestPayload, TestState> {
  return () => {
    throw new Error(message);
  };
}

const passingGuard: Guard<TestKind, TestPayload, TestState> = () => null;

describe("invariant: throwing guards never panic out of adjudicate()", () => {
  it("state guard throwing → SECURITY REFUSE with kernel.GUARD_PANIC basis", () => {
    const bundle = makeBundle({
      stateGuards: [throwingGuard("boom-state")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("guard_panic");
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic).toBeDefined();
    expect(panic?.detail?.phase).toBe("state");
    expect(panic?.detail?.message).toBe("boom-state");
  });

  it("auth guard throwing → SECURITY REFUSE with phase=auth", () => {
    const bundle = makeBundle({
      stateGuards: [passingGuard],
      authGuards: [throwingGuard("boom-auth")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("auth");
  });

  it("business guard throwing → SECURITY REFUSE with phase=business", () => {
    const bundle = makeBundle({
      business: [throwingGuard("boom-business")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("business");
  });

  it("taint policy throwing → SECURITY REFUSE with phase=taint", () => {
    const bundle = makeBundle({
      taint: {
        minimumFor: () => {
          throw new Error("taint-policy-broke");
        },
      },
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("taint");
    expect(panic?.detail?.message).toBe("taint-policy-broke");
  });

  it("non-Error thrown value still produces structured REFUSE", () => {
    const bundle = makeBundle({
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      business: [
        () => {
          throw "string-thrown" as unknown as Error;
        },
      ],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("guard_panic");
  });

  it("throw at index N: only earlier guards' passes are accumulated", () => {
    const bundle = makeBundle({
      business: [passingGuard, passingGuard, throwingGuard("boom-at-2"), passingGuard],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("business");
    expect(panic?.detail?.index).toBe(2);
  });

  it("determinism: same throwing input → byte-identical refusal basis", () => {
    const bundle = makeBundle({
      business: [throwingGuard("deterministic-boom")],
    });
    const first = adjudicate(baseEnvelope, baseState, bundle);
    const second = adjudicate(baseEnvelope, baseState, bundle);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("adjudicateWithTrace: throwing guard appears as match in trace", () => {
    const bundle = makeBundle({
      business: [passingGuard, throwingGuard("traced-boom")],
    });
    const { decision, trace } = adjudicateWithTrace(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    const lastEntry = trace[trace.length - 1];
    expect(lastEntry?.phase).toBe("business");
    expect(lastEntry?.outcome).toBe("match");
    expect(lastEntry?.index).toBe(1);
  });

  it("no LLM mutation authority: throwing guard never produces EXECUTE", () => {
    // Even with policy.default = "EXECUTE", a guard panic must NOT yield
    // EXECUTE. Fail-closed posture is mandatory.
    const bundle = makeBundle({
      business: [throwingGuard("fail-closed-test")],
      default: "EXECUTE", // would normally execute on no-match
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
  });

  // ── 011/T1: hash derivation on the REWRITE path is inside the kernel's
  //    fail-closed totality. A guard that returns a REWRITE whose rewritten
  //    payload cannot be canonicalized (a non-finite number has no JCS form,
  //    so deriveIntentHash throws) must NOT throw out of the kernel — it must
  //    REFUSE with kernel.GUARD_PANIC, just like a throwing guard. ─────────
  it("non-canonicalizable decision.rewritten payload → GUARD_PANIC REFUSE (not a throw)", () => {
    // A rewritten envelope whose payload holds Infinity — `canonicalize`
    // throws RangeError on non-finite numbers, so deriveIntentHash(rewritten)
    // throws. Hand-built (buildEnvelope would throw at construction).
    const poisonRewritten = {
      version: 2,
      kind: "k1",
      payload: { value: Number.POSITIVE_INFINITY },
      createdAt: "2026-04-23T12:00:00.000Z",
      nonce: "n-poison",
      actor: { principal: "llm", sessionId: "s1" },
      taint: "TRUSTED",
      intentHash: "a".repeat(64),
    } as unknown as IntentEnvelope<TestKind, TestPayload>;

    const rewriteGuard: Guard<TestKind, TestPayload, TestState> = () =>
      decisionRewrite(poisonRewritten, "poison rewrite", []);

    const bundle = makeBundle({ business: [rewriteGuard] });

    // Must NOT throw.
    let decision!: ReturnType<typeof adjudicate>;
    expect(() => {
      decision = adjudicate(baseEnvelope, baseState, bundle);
    }).not.toThrow();

    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("guard_panic");
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic).toBeDefined();
    expect(panic?.detail?.phase).toBe("schema");
  });

  it("determinism: same non-canonicalizable rewrite → byte-identical refusal", () => {
    const poisonRewritten = {
      version: 2,
      kind: "k1",
      payload: { value: Number.NaN },
      createdAt: "2026-04-23T12:00:00.000Z",
      nonce: "n-poison-2",
      actor: { principal: "llm", sessionId: "s1" },
      taint: "TRUSTED",
      intentHash: "b".repeat(64),
    } as unknown as IntentEnvelope<TestKind, TestPayload>;
    const bundle = makeBundle({
      business: [() => decisionRewrite(poisonRewritten, "poison", [])],
    });
    const first = adjudicate(baseEnvelope, baseState, bundle);
    const second = adjudicate(baseEnvelope, baseState, bundle);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.kind).toBe("REFUSE");
  });
});

// ── 013/T3: the tenant kill-switch guard is FAIL-CLOSED (invariant #6, §C) ──
//
// `adjudicateAndAudit` consults a tenant kill switch in addition to the always-on
// process-wide one. Before 013, `ctx?.killSwitch.isKilled()` SKIPPED the check
// entirely when a RuntimeContext was supplied without a usable kill-switch control
// — a fail-open seam. Now an omitted/non-functional control no longer bypasses the
// emergency-halt gate: it produces a SECURITY REFUSE (friction, never bypass). A
// clean, non-killed context still authorizes (no over-restriction), and the raw
// kernel path with NO context leaves the closed 6-outcome algebra unchanged.
describe("invariant: 013/T3 tenant kill-switch is fail-closed under non-optional wiring", () => {
  const permissive: PolicyBundle<TestKind, TestPayload, TestState> = {
    stateGuards: [],
    authGuards: [],
    business: [],
    taint: permissiveTaint,
    default: "EXECUTE",
  };

  it("an ACTIVE tenant kill switch → SECURITY REFUSE with kill.active basis", async () => {
    const context = createRuntimeContext();
    context.killSwitch.set(true, "maintenance");
    const { decision } = await adjudicateAndAudit(
      baseEnvelope,
      baseState,
      permissive,
      { sink: noopAuditSink(), context },
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("kill_switch_active");
    expect(
      decision.basis.some((b) => b.category === "kill" && b.code === "active"),
    ).toBe(true);
  });

  it("a context supplied WITHOUT a usable kill-switch control → fail-closed REFUSE (no silent skip)", async () => {
    // Model a malformed/cast RuntimeContext whose kill-switch control is absent.
    // The pre-013 optional-chained guard would have SKIPPED the check and let an
    // EXECUTE through (default = EXECUTE, permissive taint). Fail-closed wiring
    // turns that into a REFUSE — the omitted control no longer bypasses the gate.
    const noKillSwitch = {
      ...createRuntimeContext(),
      killSwitch: undefined,
    } as unknown as RuntimeContext;
    const { decision } = await adjudicateAndAudit(
      baseEnvelope,
      baseState,
      permissive,
      { sink: noopAuditSink(), context: noKillSwitch },
    );
    expect(decision.kind).not.toBe("EXECUTE");
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    const killBasis = decision.basis.find((b) => b.category === "kill");
    expect(killBasis?.detail?.reason).toBe("kill_switch_control_absent");
  });

  it("a context whose kill-switch THROWS while read → fail-closed REFUSE (totality)", async () => {
    const throwingCtx = {
      ...createRuntimeContext(),
      killSwitch: {
        isKilled() {
          throw new Error("kill-switch backend down");
        },
        state() {
          throw new Error("unreachable");
        },
        set() {},
        reseedFromEnv() {
          return { active: false, reason: "", toggledAt: "" };
        },
      },
    } as unknown as RuntimeContext;
    const { decision } = await adjudicateAndAudit(
      baseEnvelope,
      baseState,
      permissive,
      { sink: noopAuditSink(), context: throwingCtx },
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const killBasis = decision.basis.find((b) => b.category === "kill");
    expect(killBasis?.detail?.reason).toBe("kill_switch_control_unreadable");
  });

  it("a clean, NON-killed tenant context still authorizes — no over-restriction", async () => {
    const context = createRuntimeContext();
    const { decision } = await adjudicateAndAudit(
      baseEnvelope,
      baseState,
      permissive,
      { sink: noopAuditSink(), context },
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("NO context (raw kernel path) leaves the closed 6-outcome algebra unchanged", async () => {
    // The fail-closed change is scoped to the TENANT guard reachable when a
    // context is supplied (the adapter always supplies one). A raw kernel caller
    // with no context relies on the always-on process-wide switch and must still
    // EXECUTE a clean intent — never a spurious kill REFUSE.
    const { decision } = await adjudicateAndAudit(
      baseEnvelope,
      baseState,
      permissive,
      { sink: noopAuditSink() },
    );
    expect(decision.kind).toBe("EXECUTE");
  });
});
