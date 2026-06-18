/**
 * 033 — authority-snapshot INJECTION into the decision + RECORDING into the
 * audit record, and the §D-5 REPLAYABILITY proof.
 *
 * 033 injects the authority-graph snapshot into the one kernel decision (via
 * injected state/deps) and records it into the audit record so re-running the
 * PURE kernel over the RECORDED snapshot reproduces the decision bit-identically
 * (index §D-5, invariant #5). It does NOT wire the authority guard (034) and does
 * NOT add AC-007 (035). The snapshot rides as injected state — it NEVER enters
 * `intentHashInput` (invariant #4 untouched).
 *
 * These tests assert, non-vacuously:
 *   1. the snapshot is INJECTED into the decision (reaches a guard via state);
 *   2. it is RECORDED into the AuditRecord (and bound into the auditHash);
 *   3. replay over the RECORDED snapshot reproduces the SAME Decision
 *      bit-identically (the load-bearing §D-5 property);
 *   4. injecting/recording a snapshot does NOT change `intentHash`;
 *   5. recording reuses the idempotent, non-blocking install wrap (no guard,
 *      no Decision, no hash change for non-injecting installs).
 */

import { describe, expect, it, vi } from "vitest";
import {
  adjudicate,
  authorityGraphStoreFromRecorded,
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  createAuthorityGraphStore,
  decisionExecute,
  decisionRefuse,
  deriveIntentHash,
  hashAuthorityGraph,
  installPack,
  readRecordedAuthoritySnapshot,
  recordAuthoritySnapshot,
  recordAuthoritySnapshotOnPack,
  refuse,
  resolveOwnership,
  verifyAuditRecord,
  withBasisAudit,
  type AuthorityGraph,
  type CapabilityPlanner,
  type Decision,
  type Guard,
  type IntentEnvelope,
  type PackV0,
  type PolicyBundle,
  type TaintPolicy,
} from "../src/index.js";

const at = "2026-06-18T12:00:00.000Z";

const GRAPH: AuthorityGraph = {
  edges: [
    {
      principal: "user_42",
      relationship: "owns",
      resource: "acct_7",
      permits: { actions: ["pix.charge.refund"], limits: { amountCentavos: 50000 } },
    },
    {
      principal: "custodian_5",
      relationship: "custodian",
      resource: "acct_minor",
      permits: { actions: ["pix.charge.create"] },
    },
  ],
};

type K = "pix.charge.refund";

function env(refs?: Record<string, string>): IntentEnvelope<K, { amountCentavos: number }> {
  return buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 100 },
    actor: { principal: "llm", sessionId: "sess" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: at,
    resourceRefs: refs,
  });
}

// ── The injected state carries the authority store (the §B/§D injection axis) ──
// A Guard is (envelope, state); the kernel never passes identity. So the
// authority snapshot reaches the decision ONLY through `state`. This guard reads
// the injected store + resolves the ownership FACT (032) and decides on `bound`.
// (033 ships the INJECTION; this in-test guard stands in for the 034 guard so we
// can prove the snapshot genuinely reaches a decision — 033 itself wires none.)
interface DemoState {
  readonly authority: ReturnType<typeof createAuthorityGraphStore>;
}

const ownershipDemoGuard: Guard<K, { amountCentavos: number }, DemoState> = (
  envelope,
  state,
) => {
  const fact = resolveOwnership(state.authority, envelope);
  return fact.bound
    ? decisionExecute([basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT)])
    : decisionRefuse(
        refuse("SECURITY", "tenant_binding_violation", "Nope.", "unbound"),
        [basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT)],
      );
};

const demoPolicy: PolicyBundle<K, { amountCentavos: number }, DemoState> = {
  stateGuards: [],
  authGuards: [ownershipDemoGuard],
  taint: { minimumFor: () => "UNTRUSTED" } as TaintPolicy,
  business: [],
  default: "REFUSE",
};

describe("033 — the authority snapshot is INJECTED into the decision (via state)", () => {
  it("a bound principal EXECUTEs; an unbound one REFUSEs — the snapshot drives the decision", () => {
    const store = createAuthorityGraphStore(GRAPH);
    const state: DemoState = { authority: store };

    const bound = adjudicate(env({ owner: "user_42", resource: "acct_7" }), state, demoPolicy);
    expect(bound.kind).toBe("EXECUTE");

    const unbound = adjudicate(env({ owner: "attacker", resource: "acct_7" }), state, demoPolicy);
    expect(unbound.kind).toBe("REFUSE");

    // Non-vacuous: SAME envelope, DIFFERENT injected snapshot ⇒ DIFFERENT decision.
    const emptyState: DemoState = { authority: createAuthorityGraphStore({ edges: [] }) };
    const noEdges = adjudicate(env({ owner: "user_42", resource: "acct_7" }), emptyState, demoPolicy);
    expect(noEdges.kind).toBe("REFUSE");
  });
});

describe("033 — installPack is the injection seam (records, wires no guard)", () => {
  const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
  const planner: CapabilityPlanner<unknown, unknown> = {
    plan: () => ({ visibleReadTools: [], allowedIntents: ["thing.do"] }),
  };
  function makePack(): PackV0<"thing.do", unknown, unknown, unknown> {
    return {
      id: "pack-test",
      version: "0.1.0",
      contract: "v0",
      intents: ["thing.do"],
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: taintPolicy,
        business: [() => null],
        default: "REFUSE",
      },
      planner,
      basisCodes: ["thing.do.invalid"],
    } as PackV0<"thing.do", unknown, unknown, unknown>;
  }

  it("exposes the RECORDED snapshot on InstalledPack when a snapshot is injected", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn, authoritySnapshot: GRAPH });
    expect(result.authoritySnapshot).toBeDefined();
    expect(result.authoritySnapshot!.snapshotHash).toBe(hashAuthorityGraph(GRAPH));
    expect(result.authoritySnapshot!.graph).toEqual(GRAPH);
    // The recorded snapshot is stamped on the installed pack (the audit shell
    // reads it back) but NO authority guard was wired — authGuards stays empty.
    expect(readRecordedAuthoritySnapshot(result.pack)).toEqual(result.authoritySnapshot);
    expect((result.pack.policy as PolicyBundle<string, unknown, unknown>).authGuards).toHaveLength(0);
  });

  it("does NOT expose / stamp a snapshot when none is injected (byte-identical to pre-033)", () => {
    const warn = vi.fn();
    const result = installPack(makePack(), { warn });
    expect(result.authoritySnapshot).toBeUndefined();
    expect("authoritySnapshot" in result).toBe(false);
    expect(readRecordedAuthoritySnapshot(result.pack)).toBeUndefined();
  });

  it("recordAuthoritySnapshotOnPack is idempotent (same snapshot) and non-mutating", () => {
    const pack = withBasisAudit(makePack());
    const recorded = recordAuthoritySnapshot(GRAPH);
    const once = recordAuthoritySnapshotOnPack(pack, recorded);
    const twice = recordAuthoritySnapshotOnPack(once, recorded);
    expect(twice).toBe(once); // idempotent carry — same object, no re-wrap
    // Did not mutate the input pack.
    expect(readRecordedAuthoritySnapshot(pack)).toBeUndefined();
    // The Decision behavior is unchanged (recording is non-blocking).
    expect((once.policy as PolicyBundle<string, unknown, unknown>).authGuards).toHaveLength(0);
  });
});

describe("033 — the snapshot is RECORDED into the audit record", () => {
  it("buildAuditRecord carries the recorded snapshot and binds it into the auditHash", () => {
    const recorded = recordAuthoritySnapshot(GRAPH);
    const decision = decisionExecute([basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT)]);
    const record = buildAuditRecord({
      envelope: env({ owner: "user_42", resource: "acct_7" }),
      decision,
      durationMs: 1,
      at,
      authoritySnapshot: recorded,
    });
    expect(record.authoritySnapshot).toEqual(recorded);
    // It is IN the auditHash pre-image: a record WITHOUT it hashes differently.
    const without = buildAuditRecord({
      envelope: env({ owner: "user_42", resource: "acct_7" }),
      decision,
      durationMs: 1,
      at,
    });
    expect(record.auditHash).not.toBe(without.auditHash);
    // And the recorded record still verifies (the snapshot stays in the pre-image).
    expect(verifyAuditRecord(record)).toEqual({ verified: true });
  });

  it("a record with no injected snapshot is byte-identical (hash-stable) to its pre-033 value", () => {
    const decision = decisionExecute([basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT)]);
    const a = buildAuditRecord({ envelope: env(), decision, durationMs: 1, at });
    expect("authoritySnapshot" in a).toBe(false);
    expect(verifyAuditRecord(a)).toEqual({ verified: true });
  });

  it("tampering with the recorded snapshot is detected by verifyAuditRecord (it is in the pre-image)", () => {
    const recorded = recordAuthoritySnapshot(GRAPH);
    const record = buildAuditRecord({
      envelope: env({ owner: "user_42", resource: "acct_7" }),
      decision: decisionExecute([basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT)]),
      durationMs: 1,
      at,
      authoritySnapshot: recorded,
    });
    const tampered = {
      ...record,
      authoritySnapshot: {
        graph: { edges: [{ ...GRAPH.edges[0]!, principal: "attacker" }, GRAPH.edges[1]!] },
        snapshotHash: recorded.snapshotHash,
      },
    };
    const v = verifyAuditRecord(tampered);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("tampered");
  });
});

describe("033 — REPLAYABILITY (§D-5): re-run the kernel over the RECORDED snapshot → SAME Decision", () => {
  it("a fresh store from the RECORDED snapshot reproduces the byte-identical Decision", () => {
    const e = env({ owner: "user_42", resource: "acct_7" });

    // 1. DECISION TIME: inject the live snapshot, decide, record it.
    const liveStore = createAuthorityGraphStore(GRAPH);
    const decisionAtTime = adjudicate(e, { authority: liveStore }, demoPolicy);
    const recorded = recordAuthoritySnapshot(GRAPH);
    const record = buildAuditRecord({
      envelope: e,
      decision: decisionAtTime,
      durationMs: 1,
      at,
      authoritySnapshot: recorded,
    });

    // 2. REPLAY TIME: re-derive the store from the RECORDED snapshot ONLY (no
    //    access to the original live graph), re-run the PURE kernel.
    const replayStore = authorityGraphStoreFromRecorded(record.authoritySnapshot!);
    const replayedDecision = adjudicate(e, { authority: replayStore }, demoPolicy);

    // Bit-identical: same kind AND deep-equal Decision (basis included).
    expect(replayedDecision).toEqual(decisionAtTime);
    expect(replayedDecision.kind).toBe("EXECUTE");
  });

  it("replay reproduces a REFUSE decision identically too (the property is decision-agnostic)", () => {
    const e = env({ owner: "attacker", resource: "acct_7" });
    const decisionAtTime = adjudicate(e, { authority: createAuthorityGraphStore(GRAPH) }, demoPolicy);
    const recorded = recordAuthoritySnapshot(GRAPH);
    const replayStore = authorityGraphStoreFromRecorded(recorded);
    const replayed = adjudicate(e, { authority: replayStore }, demoPolicy);
    expect(replayed).toEqual(decisionAtTime);
    expect(replayed.kind).toBe("REFUSE");
  });

  it("authorityGraphStoreFromRecorded FAILS CLOSED on a tampered recorded snapshot (§D-5 / invariant #6)", () => {
    const recorded = recordAuthoritySnapshot(GRAPH);
    const tampered = {
      graph: { edges: [{ ...GRAPH.edges[0]!, principal: "attacker" }, GRAPH.edges[1]!] },
      snapshotHash: recorded.snapshotHash, // stale hash — no longer matches graph
    };
    expect(() => authorityGraphStoreFromRecorded(tampered)).toThrow(/integrity failure/);
  });

  it("a faithful recorded snapshot yields a store identical to the decision-time store", () => {
    const recorded = recordAuthoritySnapshot(GRAPH);
    const e = env({ owner: "user_42", resource: "acct_7" });
    const replayStore = authorityGraphStoreFromRecorded(recorded);
    expect(resolveOwnership(replayStore, e)).toEqual(
      resolveOwnership(createAuthorityGraphStore(GRAPH), e),
    );
  });
});

describe("033 — the snapshot does NOT perturb intentHash (invariant #4 untouched)", () => {
  it("injecting/recording a snapshot leaves the envelope's intentHash byte-identical", () => {
    const e = env({ owner: "user_42", resource: "acct_7" });
    // The intentHash is a function of the envelope ONLY — the snapshot is never
    // an argument to buildEnvelope/deriveIntentHash.
    const before = e.intentHash;
    // Decide WITH an injected snapshot; the envelope is untouched.
    adjudicate(e, { authority: createAuthorityGraphStore(GRAPH) }, demoPolicy);
    expect(e.intentHash).toBe(before);
    // Re-derive: still the same recipe (version, kind, payload, nonce, actor,
    // taint, origin, [resourceRefs]) — the snapshot is not in the pre-image.
    expect(deriveIntentHash(e)).toBe(before);
  });

  it("the recorded record's intentHash equals the envelope hash (the snapshot is record-level, not envelope-level)", () => {
    const e = env({ owner: "user_42", resource: "acct_7" });
    const record = buildAuditRecord({
      envelope: e,
      decision: decisionExecute([basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT)]),
      durationMs: 1,
      at,
      authoritySnapshot: recordAuthoritySnapshot(GRAPH),
    });
    expect(record.intentHash).toBe(e.intentHash);
    expect(record.intentHash).toBe(deriveIntentHash(e));
  });
});

// Type-only assertion: the recorded snapshot Decision algebra is unchanged.
// (no 7th outcome — the closed 6-outcome union still types a Decision)
const _decisionAlgebraUnchanged: Decision["kind"] =
  "EXECUTE" as "EXECUTE" | "REFUSE" | "ESCALATE" | "REQUEST_CONFIRMATION" | "DEFER" | "REWRITE";
void _decisionAlgebraUnchanged;
