import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type IntentEnvelope,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../src/kernel/adjudicate.js";
import { _resetKillSwitch } from "../../src/kernel/enforce-config.js";
import type { Guard, PolicyBundle } from "../../src/kernel/policy.js";

type Kind = "order.tool.propose";
interface Payload {
  readonly toolName: string;
}
type State = { readonly step: "pre_order" | "shipped" | "terminal" };

const taintPolicy: TaintPolicy = {
  minimumFor: (kind) => (kind === "payment.send" ? "SYSTEM" : "UNTRUSTED"),
};

function baseEnvelope(overrides: Partial<IntentEnvelope<Kind, Payload>> = {}): IntentEnvelope<Kind, Payload> {
  // Hash-relevant overrides (kind, payload, actor, taint, nonce) flow into
  // buildEnvelope's inputs so the resulting intentHash matches the canonical
  // content — the kernel now verifies it (schema:intent_hash_mismatch). Only
  // version/intentHash overrides are spread on top, for tests that
  // deliberately craft a malformed/forged envelope.
  const { version, intentHash, createdAt, ...hashRelevant } = overrides;
  const env = buildEnvelope<Kind, Payload>({
    kind: (hashRelevant.kind ?? "order.tool.propose") as Kind,
    payload: hashRelevant.payload ?? { toolName: "add_item" },
    actor: hashRelevant.actor ?? { principal: "llm", sessionId: "s-1" },
    taint: hashRelevant.taint ?? "UNTRUSTED",
    // 042 — thread origin so the contaminating-origin path can be exercised.
    // Defaults to "LLM" (non-contaminating) via buildEnvelope when omitted.
    ...(hashRelevant.origin !== undefined ? { origin: hashRelevant.origin } : {}),
    nonce: hashRelevant.nonce ?? "n-test",
    createdAt: createdAt ?? "2026-04-23T12:00:00.000Z",
  });
  return {
    ...env,
    ...(version !== undefined ? { version } : {}),
    ...(intentHash !== undefined ? { intentHash } : {}),
  } as IntentEnvelope<Kind, Payload>;
}

function bundle(
  overrides?: Partial<PolicyBundle<Kind, Payload, State>>,
): PolicyBundle<Kind, Payload, State> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business: [],
    default: "EXECUTE",
    ...overrides,
  };
}

describe("adjudicate — default path (all guards pass)", () => {
  it("returns EXECUTE when default is EXECUTE and no guards fire", () => {
    const decision = adjudicate(baseEnvelope(), { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("EXECUTE");
  });

  it("returns REFUSE when default is REFUSE and no guards fire", () => {
    const decision = adjudicate(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({ default: "REFUSE" }),
    );
    expect(decision.kind).toBe("REFUSE");
  });

  it("accumulates one pass basis per category on EXECUTE", () => {
    const decision = adjudicate(baseEnvelope(), { step: "pre_order" }, bundle());
    if (decision.kind !== "EXECUTE") throw new Error("expected EXECUTE");
    // schema + state + taint + auth + business = 5 pass bases
    // T8 reorder: taint runs before auth so UNTRUSTED inputs short-circuit
    // before any auth side effect.
    expect(decision.basis).toHaveLength(5);
    expect(decision.basis.map((b) => b.category)).toEqual([
      "schema",
      "state",
      "taint",
      "auth",
      "business",
    ]);
  });
});

describe("adjudicate — short-circuit order is state → taint → auth → business (T8)", () => {
  const fail = (cat: "state" | "auth" | "business"): Guard<Kind, Payload, State> => () =>
    decisionRefuse(refuse("STATE", `${cat}_fail`, "nope"), [
      basis(cat, BASIS_CODES[cat].RULE_VIOLATED ?? BASIS_CODES.state.TRANSITION_ILLEGAL),
    ]);

  it("state failure short-circuits before taint and auth", () => {
    const decision = adjudicate(
      baseEnvelope(),
      { step: "terminal" },
      bundle({
        stateGuards: [fail("state")],
        authGuards: [fail("auth")],
      }),
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("state_fail");
  });

  it("taint failure short-circuits before auth (T8 reorder)", () => {
    // UNTRUSTED envelope on a SYSTEM-only kind — taint refuses before
    // the auth guard runs (fail("auth") would run pre-T8).
    const env = baseEnvelope({ kind: "payment.send" as Kind });
    const decision = adjudicate(
      env,
      { step: "pre_order" },
      bundle({ authGuards: [fail("auth")] }),
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("taint_level_insufficient");
  });

  it("auth failure short-circuits before business (when state and taint pass)", () => {
    const decision = adjudicate(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({
        authGuards: [fail("auth")],
      }),
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("auth_fail");
  });
});

describe("adjudicate — taint gate", () => {
  it("refuses UNTRUSTED envelopes that demand SYSTEM", () => {
    const env = baseEnvelope({ kind: "payment.send" as Kind });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("taint_level_insufficient");
  });

  it("passes SYSTEM envelopes that demand SYSTEM", () => {
    const env = baseEnvelope({
      kind: "payment.send" as Kind,
      taint: "SYSTEM",
    });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("EXECUTE");
  });

  // ── 042 — contamination-lowered refusals emit PROPAGATION_VIOLATION ───────

  it("a NON-contaminating origin (LLM default) keeps the bare LEVEL_INSUFFICIENT basis", () => {
    // Sub-minimum UNTRUSTED proposal with the default LLM origin — a bare
    // declared-untrusted refusal, NOT a propagation-caused one.
    const env = baseEnvelope({ kind: "payment.send" as Kind });
    expect(env.origin).toBe("LLM");
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    if (decision.kind !== "REFUSE") throw new Error("expected REFUSE");
    const taintBasis = decision.basis.find((b) => b.category === "taint");
    expect(taintBasis?.code).toBe(BASIS_CODES.taint.LEVEL_INSUFFICIENT);
  });

  it("a CONTAMINATING origin (Retrieved) on a sub-minimum refusal emits PROPAGATION_VIOLATION", () => {
    const env = baseEnvelope({
      kind: "payment.send" as Kind,
      origin: "Retrieved",
    });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    // Still the same refusal CODE (no new outcome / refusal vocabulary) ...
    expect(decision.refusal.code).toBe("taint_level_insufficient");
    // ... but the basis distinguishes the propagation cause for audit.
    const taintBasis = decision.basis.find((b) => b.category === "taint");
    expect(taintBasis?.code).toBe(BASIS_CODES.taint.PROPAGATION_VIOLATION);
    expect(taintBasis?.detail?.origin).toBe("Retrieved");
  });

  it("a CONTAMINATING origin (ExternalAPI) also emits PROPAGATION_VIOLATION", () => {
    const env = baseEnvelope({
      kind: "payment.send" as Kind,
      origin: "ExternalAPI",
    });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    if (decision.kind !== "REFUSE") throw new Error("expected REFUSE");
    const taintBasis = decision.basis.find((b) => b.category === "taint");
    expect(taintBasis?.code).toBe(BASIS_CODES.taint.PROPAGATION_VIOLATION);
  });

  it("a contaminating origin that PASSES the taint gate is NOT refused (still EXECUTE)", () => {
    // SYSTEM taint clears the SYSTEM minimum even with a Retrieved origin —
    // the basis-code split only applies to the REFUSE path, never to weaken it.
    const env = baseEnvelope({
      kind: "payment.send" as Kind,
      taint: "SYSTEM",
      origin: "Retrieved",
    });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("EXECUTE");
  });

  it("a contaminating origin does NOT manufacture a refusal for an UNTRUSTED-min kind", () => {
    // Default kind tolerates UNTRUSTED; a Retrieved origin must not invent
    // friction where the taint gate passes — PROPAGATION_VIOLATION is only a
    // basis on an already-failing taint check, never a new gate.
    const env = baseEnvelope({ origin: "Retrieved" });
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("EXECUTE");
  });

  // ── 043 — origin-aware policy branch (the REAL per-intent propagation gate) ──
  //
  // 042's PROPAGATION_VIOLATION at the LLM seam is ATTRIBUTION-ONLY: a
  // sub-minimum proposal that would fail the trust-rank floor anyway. 043 adds
  // the gate that actually FLIPS a decision: an UNTRUSTED-min mutating kind whose
  // `1 >= 1` rank check ALWAYS passes is REFUSEd when the pack declares the kind
  // origin-required AND the proposal traces to a contaminating origin.
  //
  // The branch is gated on the policy's optional `requiresUncontaminatedOrigin`.
  // A policy WITHOUT it (the default `taintPolicy` above) is byte-identical to
  // pre-043 — proven by the 042 tests above that still pass.
  describe("043 — origin-aware policy branch", () => {
    // `order.tool.propose` is UNTRUSTED-min under the base taintPolicy, but this
    // policy declares it origin-required: a contaminating origin must be refused.
    const originAwarePolicy: TaintPolicy = {
      minimumFor: (kind) => (kind === "payment.send" ? "SYSTEM" : "UNTRUSTED"),
      requiresUncontaminatedOrigin: (kind) => kind === "order.tool.propose",
    };

    it("FLIPS an UNTRUSTED-min mutating kind to REFUSE when origin is contaminating (the laundering catch)", () => {
      // Baseline: with the DEFAULT (non-origin-aware) policy this very envelope
      // cleanly EXECUTEs — proving the branch, not the rank floor, is what stops it.
      const env = baseEnvelope({ origin: "Retrieved" });
      expect(adjudicate(env, { step: "pre_order" }, bundle()).kind).toBe("EXECUTE");

      // With the origin-aware policy the same contaminated proposal is REFUSEd.
      const decision = adjudicate(
        env,
        { step: "pre_order" },
        bundle({ taint: originAwarePolicy }),
      );
      expect(decision.kind).toBe("REFUSE");
      if (decision.kind !== "REFUSE") return;
      expect(decision.refusal.kind).toBe("SECURITY");
      expect(decision.refusal.code).toBe("taint_level_insufficient");
      const taintBasis = decision.basis.find((b) => b.category === "taint");
      expect(taintBasis?.code).toBe(BASIS_CODES.taint.PROPAGATION_VIOLATION);
      // The origin-branch attribution distinguishes it from a 042 rank-floor
      // attribution: the kind CLEARED the rank gate but laundered its provenance.
      expect(taintBasis?.detail?.branch).toBe("origin_required");
      expect(taintBasis?.detail?.origin).toBe("Retrieved");
    });

    it("ExternalAPI also fires the origin branch", () => {
      const env = baseEnvelope({ origin: "ExternalAPI" });
      const decision = adjudicate(
        env,
        { step: "pre_order" },
        bundle({ taint: originAwarePolicy }),
      );
      expect(decision.kind).toBe("REFUSE");
      const taintBasis = decision.basis.find((b) => b.category === "taint");
      expect(taintBasis?.code).toBe(BASIS_CODES.taint.PROPAGATION_VIOLATION);
      expect(taintBasis?.detail?.branch).toBe("origin_required");
    });

    it("a NON-contaminating origin (Human / LLM / System) on an origin-required kind still EXECUTEs", () => {
      for (const origin of ["Human", "LLM", "System"] as const) {
        const env = baseEnvelope({ origin });
        const decision = adjudicate(
          env,
          { step: "pre_order" },
          bundle({ taint: originAwarePolicy }),
        );
        expect(decision.kind).toBe("EXECUTE");
      }
    });

    it("a kind NOT declared origin-required is unaffected even from a contaminating origin", () => {
      // The origin-aware policy marks ONLY `order.tool.propose`. A different
      // UNTRUSTED-min kind from a contaminating origin still EXECUTEs.
      const env = baseEnvelope({
        kind: "some.other.kind" as Kind,
        origin: "Retrieved",
      });
      const decision = adjudicate(
        env,
        { step: "pre_order" },
        bundle({ taint: originAwarePolicy }),
      );
      expect(decision.kind).toBe("EXECUTE");
    });

    it("MONOTONIC: the branch never RELAXES a rank-floor refusal (still REFUSE, with the 042 attribution)", () => {
      // A SYSTEM-min kind proposed at UNTRUSTED from a contaminating origin: the
      // rank floor already refuses it. The origin branch must NOT change that to
      // an EXECUTE, and the attribution stays the 042 contamination path (no
      // origin_required branch marker, since the rank gate — not 043 — refused).
      const sysOriginAware: TaintPolicy = {
        minimumFor: () => "SYSTEM",
        requiresUncontaminatedOrigin: () => true,
      };
      const env = baseEnvelope({
        kind: "payment.send" as Kind,
        origin: "Retrieved",
      });
      const decision = adjudicate(
        env,
        { step: "pre_order" },
        bundle({ taint: sysOriginAware }),
      );
      expect(decision.kind).toBe("REFUSE");
      const taintBasis = decision.basis.find((b) => b.category === "taint");
      // Still PROPAGATION_VIOLATION (contaminating origin), but via the 042
      // rank-floor attribution path — NOT the 043 origin_required branch.
      expect(taintBasis?.code).toBe(BASIS_CODES.taint.PROPAGATION_VIOLATION);
      expect(taintBasis?.detail?.branch).toBeUndefined();
    });

    it("a throwing requiresUncontaminatedOrigin fails CLOSED as a taint-phase GUARD_PANIC", () => {
      const throwingPolicy: TaintPolicy = {
        minimumFor: () => "UNTRUSTED",
        requiresUncontaminatedOrigin: () => {
          throw new Error("policy boom");
        },
      };
      const env = baseEnvelope({ origin: "Retrieved" });
      const decision = adjudicate(
        env,
        { step: "pre_order" },
        bundle({ taint: throwingPolicy }),
      );
      expect(decision.kind).toBe("REFUSE");
      if (decision.kind !== "REFUSE") return;
      expect(decision.refusal.code).toBe("guard_panic");
      expect(
        decision.basis.some(
          (b) => b.category === "kernel" && b.code === "guard_panic",
        ),
      ).toBe(true);
    });

    it("branch-disabled is byte-identical to today: same kind + same basis sequence as the non-origin-aware policy", () => {
      // A policy WITH requiresUncontaminatedOrigin that returns false for the
      // kind must produce the EXACT same decision as the plain policy (no extra
      // basis, no kind change) — the dark-ship default.
      const disabledPolicy: TaintPolicy = {
        minimumFor: (kind) => (kind === "payment.send" ? "SYSTEM" : "UNTRUSTED"),
        requiresUncontaminatedOrigin: () => false,
      };
      for (const origin of ["Human", "Retrieved", "ExternalAPI", "LLM", "System"] as const) {
        const env = baseEnvelope({ origin });
        const plain = adjudicate(env, { step: "pre_order" }, bundle());
        const disabled = adjudicate(
          env,
          { step: "pre_order" },
          bundle({ taint: disabledPolicy }),
        );
        expect(disabled.kind).toBe(plain.kind);
        expect(disabled.basis.map((b) => `${b.category}:${b.code}`)).toEqual(
          plain.basis.map((b) => `${b.category}:${b.code}`),
        );
      }
    });
  });
});

describe("adjudicate — schema gate", () => {
  it("refuses envelopes with an unknown version (last line of defense)", () => {
    const env = { ...baseEnvelope(), version: 999 as 2 };
    const decision = adjudicate(env, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("schema_version_unsupported");
  });
});

describe("adjudicate — content-addressing integrity (AuthReviewer-001)", () => {
  it("refuses an envelope whose intentHash does not match canonical content", () => {
    const forged = baseEnvelope({ intentHash: "0".repeat(64) });
    const decision = adjudicate(forged, { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("intent_hash_mismatch");
    expect(
      decision.basis.some(
        (b) => b.category === "schema" && b.code === "intent_hash_mismatch",
      ),
    ).toBe(true);
  });

  it("accepts an envelope whose intentHash matches (buildEnvelope output)", () => {
    const decision = adjudicate(baseEnvelope(), { step: "pre_order" }, bundle());
    expect(decision.kind).toBe("EXECUTE");
  });
});

describe("adjudicate — audit trail preservation", () => {
  it("includes passed bases before the short-circuit basis", () => {
    const decision = adjudicate(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({
        business: [
          () =>
            decisionRefuse(
              refuse("BUSINESS_RULE", "cap", "capped"),
              [basis("business", BASIS_CODES.business.QUANTITY_CAPPED)],
            ),
        ],
      }),
    );
    if (decision.kind !== "REFUSE") throw new Error("expected REFUSE");
    // schema, state, taint, auth all passed; then the business short-circuit basis (T8 order)
    const categories = decision.basis.map((b) => b.category);
    expect(categories).toEqual(["schema", "state", "taint", "auth", "business"]);
    // last basis is the failure signal
    expect(decision.basis[decision.basis.length - 1]!.code).toBe("quantity_capped");
  });
});

describe("adjudicate — direct decision pass-through", () => {
  it("propagates EXECUTE from a business guard", () => {
    const decision = adjudicate(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({
        default: "REFUSE",
        business: [
          () =>
            decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]),
        ],
      }),
    );
    expect(decision.kind).toBe("EXECUTE");
  });
});

describe("adjudicate — hot path reads no live process.env (ConfigReviewer-001/003)", () => {
  // Run adjudicate() with process.env replaced by a recording Proxy and assert
  // the enforce-config / kill-switch env keys are never read off LIVE env on
  // the decision hot path. Deterministic core: no env reads inside
  // adjudicate(). If a future commit wires per-intent enforce or re-reads the
  // kill switch from mutable process.env mid-decision, these traps fire.
  function recordEnvAccessDuringAdjudicate(): string[] {
    const accessed: string[] = [];
    const realEnv = process.env;
    const trap = new Proxy(realEnv, {
      get(target, prop, receiver) {
        if (typeof prop === "string") accessed.push(prop);
        return Reflect.get(target, prop, receiver);
      },
    });
    (process as { env: NodeJS.ProcessEnv }).env = trap;
    try {
      adjudicate(
        baseEnvelope(),
        { step: "pre_order" },
        bundle({
          business: [
            () =>
              decisionExecute([
                basis("business", BASIS_CODES.business.RULE_SATISFIED),
              ]),
          ],
        }),
      );
    } finally {
      (process as { env: NodeJS.ProcessEnv }).env = realEnv;
    }
    return accessed;
  }

  it("does not access IBX_KERNEL_SHADOW or IBX_KERNEL_ENFORCE during adjudicate()", () => {
    const accessed = recordEnvAccessDuringAdjudicate();
    expect(accessed).not.toContain("IBX_KERNEL_SHADOW");
    expect(accessed).not.toContain("IBX_KERNEL_ENFORCE");
  });

  it("does not access IBX_KILL_SWITCH off live process.env during adjudicate()", () => {
    // Force a fresh kill-switch seed so the first isKilled() inside
    // adjudicate() would actually consult an env source. The module snapshot
    // (captured at import) is what gets read — never the live, trapped env.
    _resetKillSwitch();
    const accessed = recordEnvAccessDuringAdjudicate();
    expect(accessed).not.toContain("IBX_KILL_SWITCH");
    _resetKillSwitch();
  });
});
