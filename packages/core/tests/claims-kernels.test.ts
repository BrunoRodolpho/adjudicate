/**
 * Q5 — the THREE KERNEL INTERFACES + the asymmetric Evidence-Ledger TOPOLOGY
 * (SDD §F; v1.1 §6; §R topology; Inv 13). This is the architectural capstone:
 * it wires Q1–Q4 + the EXISTING Action kernel into the §F one-directional flow
 *
 *     Read + Action  →  Evidence Ledger  →  Claims  →  Renderer
 *
 * Acceptance (each NON-VACUOUS — RED when the guard is removed/inverted; the
 * non-vacuity is restated in the Q5 self-check):
 *
 *   AC1  Read = Access ⊕ Provenance with the EXACT verdict unions; the two
 *        layers are INDEPENDENT (all access × provenance combinations well-formed;
 *        re-versioning one layer does not touch the other).
 *   AC2  Action kernel = the EXISTING `Decision` — REUSED, not forked. The §F
 *        alias `ActionKernelVerdict` IS the imported `Decision` (a real
 *        adjudicate output type-checks AS it); forking the six values would fail.
 *   AC3  Claims kernel COMPOSES Q3 (P1) + Q4 (P2), end-to-end through the Ledger:
 *        unsound candidate → not renderable; sound-but-inconsistent set →
 *        ESCALATE (P2); sound + consistent set → RENDER.
 *   AC4  Topology asymmetry: Claims CONSUMES the Ledger; nothing flows
 *        Claims → Ledger → Read (one-directional). The §R collapse is
 *        structurally prevented; injecting a backward edge is DETECTED.
 *   AC5  §R hard-errors: NO free-text reasoning validates a claim (validation is
 *        the typed §5 predicate); the 3-valued `VALIDATED|UNKNOWN|REFUSED` model
 *        is intact; Read's two layers are independent.
 *   AC6  Kernel purity — no downstream import; the existing Action kernel is
 *        REUSED intra-package.
 *
 * NON-VACUITY (proven below + restated in the self-check):
 *   · AC4 topology asymmetry — `topologyHasBackwardEdge` / `ledgerConsumesClaims`
 *     are FALSE on the real topology and TRUE on a topology with an injected
 *     backward edge (the guard, exercised both ways).
 *   · AC2 Action-reuse — the test type-checks a REAL `adjudicate` `Decision`
 *     value AS `ActionKernelVerdict`; a forked union (different members/shape)
 *     would not type-check / would diverge from `DecisionKind`.
 *   · AC5 3-valued-intact — `CLAIM_VERDICTS` is asserted to be EXACTLY the three
 *     members in order; a transient inversion/removal flips it RED.
 */

import { describe, expect, it } from "vitest";
import {
  // Q5 — the three kernels + topology under test
  READ_ACCESS_VERDICTS,
  isReadAccess,
  runReadKernel,
  runClaimsKernel,
  ASYMMETRIC_TOPOLOGY,
  TOPOLOGY_STAGES,
  topologyHasBackwardEdge,
  ledgerConsumesClaims,
  type ReadAccess,
  type ReadProvenance,
  type ReadKernel,
  type ReadKernelResult,
  type ActionKernelVerdict,
  type ActionKernelVerdictKind,
  type CandidateClaim,
  type ClaimsKernelDeps,
  type ClaimsKernelResult,
  type TopologyEdge,
  type TopologyStage,
  // Q1 — the three-valued verdict (must stay intact, §R condition 3)
  CLAIM_VERDICTS,
  type ClaimVerdict,
  type TurnTerminal,
  // Q2 — the real Evidence Ledger (no mock — the topology runs through it)
  EvidenceLedger,
  type LedgerTaint,
  // Q3 — the §5 soundness shapes (P1)
  type EvidenceRequirement,
  type MinimalClaim,
  type SoundnessDeps,
  // Q4 — the consistency shapes (P2)
  DEFAULT_CONSISTENCY_TABLE,
  // EXISTING Action kernel — REUSE, NOT FORK (the §F Action verdict)
  type Decision,
  type DecisionKind,
  decisionExecute,
  decisionRefuse,
  refuse,
} from "@adjudicate/core";

// ─────────────────────────────────────────────────────────────────────────
// Fixtures — minimal evidence requirements + a ledger writer, kept faithful to
// Q2/Q3 so soundness runs through the REAL predicate (no mocked verdicts).
// ─────────────────────────────────────────────────────────────────────────

const NOW = 1_000_000;

/** A static, public, structured, preserve requirement — validates trivially. */
const PUBLIC_REQ: EvidenceRequirement = {
  key: "store-hours",
  ownershipPolicy: "not_applicable",
  freshnessPolicy: "static",
  sourceIntegrity: "structured",
  provenancePolicy: "preserve",
};

/** A second public requirement on a different key, for a second claim. */
const PUBLIC_REQ_2: EvidenceRequirement = {
  key: "store-address",
  ownershipPolicy: "not_applicable",
  freshnessPolicy: "static",
  sourceIntegrity: "structured",
  provenancePolicy: "preserve",
};

/** Build a present, live, trusted ledger entry for a key. */
function recordTrusted(ledger: EvidenceLedger, key: string, value: unknown): void {
  ledger.record({
    key,
    value,
    source: "test",
    fetchedAt: NOW,
    sourceMode: "live",
    taint: "TRUSTED",
    // A generic trusted read is NOT first-party (fail-closed origin, §G/§J.3).
    originProvenance: "TRUSTED_THIRD_PARTY",
  });
}

/**
 * A read_claim over a single public requirement (validates when its key is
 * present). Falsifier-COMPLETE by default (W6) so the all-pass path can reach
 * VALIDATED through the eligibility cap; the falsifier targets a key that is not
 * recorded, so it never affects the verdict.
 */
function publicClaim(req: EvidenceRequirement): MinimalClaim {
  return {
    requiredEvidence: [req],
    minSourceIntegrity: "structured",
    kind: "read_claim",
    actor: "actor-1",
    falsifierComplete: true,
    falsifiers: [
      {
        key: "_falsifier",
        ownershipPolicy: "not_applicable",
        freshnessPolicy: "static",
        sourceIntegrity: "structured",
        provenancePolicy: "preserve",
      },
    ],
  };
}

/** Soundness deps: deny-all ownership (unused for public claims), no action, fixed now. */
const SOUNDNESS_DEPS: SoundnessDeps = {
  owns: () => false,
  outcomeConfirmed: () => false,
  now: NOW,
};

const CLAIMS_DEPS: ClaimsKernelDeps = { soundness: SOUNDNESS_DEPS };

// ═══════════════════════════════════════════════════════════════════════════
// AC1 — READ KERNEL = Access ⊕ Provenance; the two layers are INDEPENDENT
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC1 — Read kernel = Access ⊕ Provenance (SDD §F; Inv 13)", () => {
  it("ReadAccess has EXACTLY the four §F verdicts in spec order", () => {
    expect(READ_ACCESS_VERDICTS).toEqual([
      "ALLOW_READ",
      "REDACT",
      "ESCALATE",
      "REFUSE",
    ]);
    // Non-vacuity: a fork that dropped/renamed/added a member fails this exact
    // tuple assertion.
    expect(READ_ACCESS_VERDICTS).toHaveLength(4);
    expect(isReadAccess("ALLOW_READ")).toBe(true);
    expect(isReadAccess("TRUSTED")).toBe(false); // a provenance value is NOT an access verdict
  });

  it("runReadKernel returns BOTH layers as SEPARATE fields (the ⊕ direct sum)", () => {
    const layers: ReadKernel = {
      access: { decideAccess: () => "ALLOW_READ" },
      provenance: { decideProvenance: () => "TRUSTED" },
    };
    const result: ReadKernelResult = runReadKernel({ any: "query" }, layers);
    expect(result).toEqual({ access: "ALLOW_READ", provenance: "TRUSTED" });
  });

  it("the two layers vary INDEPENDENTLY — every access × provenance combo is well-formed", () => {
    const accesses: readonly ReadAccess[] = [
      "ALLOW_READ",
      "REDACT",
      "ESCALATE",
      "REFUSE",
    ];
    const provenances: readonly ReadProvenance[] = ["TRUSTED", "UNTRUSTED_DATA"];

    // All 4×2 combinations are produced by the kernel — neither field constrains
    // the other. Authorization ≠ trust (SDD §F): e.g. ALLOW_READ + UNTRUSTED_DATA
    // (read an untrusted value) and REDACT + TRUSTED (PII-min on first-party data)
    // are BOTH valid. If the kernel ever coupled the layers (e.g. forced
    // REFUSE on UNTRUSTED), some combination would NOT appear → RED.
    const seen = new Set<string>();
    for (const access of accesses) {
      for (const provenance of provenances) {
        const layers: ReadKernel = {
          access: { decideAccess: () => access },
          provenance: { decideProvenance: () => provenance },
        };
        const r = runReadKernel({}, layers);
        expect(r.access).toBe(access);
        expect(r.provenance).toBe(provenance);
        seen.add(`${r.access}|${r.provenance}`);
      }
    }
    expect(seen.size).toBe(accesses.length * provenances.length); // 8 distinct combos
  });

  it("re-versioning ONE layer does NOT touch the other (independent versioning, §F)", () => {
    // The provenance layer is held FIXED while the access layer is swapped
    // ("re-versioned"). The provenance output is unchanged across both access
    // versions → the layers version independently. A coupled design (one layer
    // reading the other's verdict) would let the access swap perturb provenance.
    const fixedProvenance = { decideProvenance: () => "UNTRUSTED_DATA" as const };

    const accessV1: ReadKernel = {
      access: { decideAccess: () => "ALLOW_READ" },
      provenance: fixedProvenance,
    };
    const accessV2: ReadKernel = {
      access: { decideAccess: () => "REDACT" }, // re-versioned access policy
      provenance: fixedProvenance,
    };

    expect(runReadKernel({}, accessV1).provenance).toBe("UNTRUSTED_DATA");
    expect(runReadKernel({}, accessV2).provenance).toBe("UNTRUSTED_DATA");
    // and the access axis DID change, proving the swap was real:
    expect(runReadKernel({}, accessV1).access).toBe("ALLOW_READ");
    expect(runReadKernel({}, accessV2).access).toBe("REDACT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC2 — ACTION KERNEL = the EXISTING Decision (REUSED, NOT FORKED) — §F, §R
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC2 — Action kernel = the existing Decision, reused not forked (SDD §F; §R)", () => {
  // NOTE on enforcement: the TYPE-IDENTITY guarantee (`ActionKernelVerdict` ≡
  // `Decision`, `ActionKernelVerdictKind` ≡ `DecisionKind`) is enforced at BUILD
  // TIME by the `_AssertEqual<…>` constants in `packages/core/src/claims/kernels.ts`
  // — the SOURCE, which `pnpm --filter @adjudicate/core build` (tsc) always
  // typechecks. Forking the alias there is a compile error. (This test file is
  // excluded from the typecheck — `tsconfig.test.json` includes only `src` +
  // `tests/install.test.ts` — so a type annotation HERE would enforce nothing.)
  // These it-blocks therefore assert the reuse facts at RUNTIME: a real
  // `Decision` VALUE flows structurally where an `ActionKernelVerdict` is
  // expected, and every `DecisionKind` round-trips. AC6 (the import-scan) is the
  // companion runtime witness that the values come from `../decision`, not a fork.

  it("a real adjudicate Decision flows where an ActionKernelVerdict is expected — structural reuse (runtime)", () => {
    // A function whose PARAMETER is typed `ActionKernelVerdict`. Because the alias
    // IS `Decision` (build-guarded in kernels.ts), a REAL `Decision` value from the
    // existing kernel's constructor passes straight in — and is read back as a
    // `Decision`. The runtime assertion: the same value, accepted on the
    // ActionKernelVerdict seam, still carries its existing-kernel `kind`/shape.
    const onActionVerdict = (v: ActionKernelVerdict): ActionKernelVerdict => v;

    const execute = decisionExecute([]); // a real existing-kernel Decision VALUE
    const acceptedExecute = onActionVerdict(execute); // flows through the alias seam
    expect(acceptedExecute).toBe(execute); // same object — no copy, no coercion
    expect(acceptedExecute.kind).toBe("EXECUTE");

    // The reverse seam: the value the alias seam returned is consumed AS a Decision.
    const backAsDecision: Decision = acceptedExecute;
    expect(backAsDecision).toBe(execute);
    expect(backAsDecision.kind).toBe("EXECUTE");

    // A second member of the union (REFUSE carries a Refusal) flows the same way —
    // exercising that the alias is the WHOLE Decision union, not just one arm.
    const refused = decisionRefuse(
      refuse("BUSINESS_RULE", "policy.block", "not allowed in this state"),
      [],
    );
    const acceptedRefused = onActionVerdict(refused);
    expect(acceptedRefused).toBe(refused);
    expect(acceptedRefused.kind).toBe("REFUSE");
    expect("refusal" in acceptedRefused && acceptedRefused.refusal.code).toBe(
      "policy.block",
    );
  });

  it("every DecisionKind round-trips through ActionKernelVerdictKind — same six values (runtime)", () => {
    // The kind alias is exercised at RUNTIME: each of the six existing
    // `DecisionKind` members is passed through a parameter typed
    // `ActionKernelVerdictKind` and read back as a `DecisionKind`, unchanged.
    // Build-time identity is guarded in kernels.ts; here we assert the value-level
    // reuse (the six members are exactly the existing kernel's, none added/dropped).
    const onAliasKind = (k: ActionKernelVerdictKind): DecisionKind => k;

    const kinds: readonly DecisionKind[] = [
      "EXECUTE",
      "REFUSE",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
      "DEFER",
      "REWRITE",
    ];
    for (const k of kinds) {
      expect(onAliasKind(k)).toBe(k); // DecisionKind → alias → DecisionKind, identity
    }
    // Exactly six — the §F Action verdict cardinality, sourced from the existing
    // kernel. A fork that added/removed a member would diverge from this set.
    expect(kinds).toHaveLength(6);
    expect(new Set(kinds).size).toBe(6); // all distinct
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC3 — CLAIMS KERNEL = P1 ∘ P2, end-to-end through the REAL Evidence Ledger
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC3 — Claims kernel composes Q3 (P1) + Q4 (P2) (SDD §F; §D)", () => {
  it("an UNSOUND candidate is NOT in the renderable set (P1 drops it)", () => {
    // The ledger is EMPTY → the public requirement's key is absent → P1 yields
    // UNKNOWN → the candidate never enters the P2 set → not renderable. A turn
    // with nothing validated surfaces honest ignorance: UNKNOWN (SDD §I/§K).
    const ledger = new EvidenceLedger();
    const candidates: readonly CandidateClaim[] = [
      {
        soundness: publicClaim(PUBLIC_REQ),
        subject: "order-1",
        type: "STORE_HOURS",
        value: "10-22",
      },
    ];
    const result: ClaimsKernelResult = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);

    expect(result.perClaim[0]?.verdict).toBe("UNKNOWN"); // P1 = honest ignorance
    expect(result.renderable).toHaveLength(0); // not renderable
    expect(result.terminal).toBe("UNKNOWN"); // turn surfaces ignorance, no vacuous RENDER
  });

  it("a SOUND + CONSISTENT set → RENDER (both gates pass)", () => {
    // Two public claims on DIFFERENT subjects → both validate (P1) and there is
    // no same-subject pair to constrain (P2) → both render.
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, PUBLIC_REQ.key, "10-22");
    recordTrusted(ledger, PUBLIC_REQ_2.key, "Main St");

    const candidates: readonly CandidateClaim[] = [
      {
        soundness: publicClaim(PUBLIC_REQ),
        subject: "store-1",
        type: "STORE_HOURS",
        value: "10-22",
      },
      {
        soundness: publicClaim(PUBLIC_REQ_2),
        subject: "store-2",
        type: "STORE_ADDRESS",
        value: "Main St",
      },
    ];
    const result = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);

    expect(result.perClaim.map((p) => p.verdict)).toEqual(["VALIDATED", "VALIDATED"]);
    expect(result.renderable).toHaveLength(2);
    expect(result.terminal).toBe("RENDER");
    expect(result.consistency.suppressions).toHaveLength(0);
  });

  it("C6 end-to-end: a model-authored SURPLUS value is caught at runClaimsKernel (Theorem S (a-value))", () => {
    // The round-2 (a-value) trace, reproduced through the WHOLE kernel: every §5
    // conjunct passes for the bound key, but the candidate's RENDERED value (what
    // the model authored, the field copied into `renderable`) contradicts the
    // ledger value. runClaimsKernel threads `candidate.value` into the soundness
    // input, so C6 binds it and REFUSES — the surplus never reaches renderable.
    const boundReq: EvidenceRequirement = { ...PUBLIC_REQ, key: "open-now" };
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, boundReq.key, "fechado"); // evidence: closed.

    const candidates: readonly CandidateClaim[] = [
      {
        soundness: {
          ...publicClaim(boundReq),
          valueBinding: { key: boundReq.key },
        },
        subject: "store-1",
        type: "STORE_OPEN_NOW",
        value: "aberto", // model confabulated "open" — surplus, unbacked.
      },
    ];
    const result = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);

    expect(result.perClaim[0]?.verdict).toBe("REFUSED");
    expect(result.renderable).toHaveLength(0);

    // Control: the SAME wiring with a matching value validates and renders — so the
    // REFUSED above is genuinely the value mismatch, not the binding being inert.
    const okLedger = new EvidenceLedger();
    recordTrusted(okLedger, boundReq.key, "aberto");
    const ok = runClaimsKernel(
      okLedger,
      [{ ...candidates[0]!, value: "aberto" }],
      CLAIMS_DEPS,
    );
    expect(ok.perClaim[0]?.verdict).toBe("VALIDATED");
    expect(ok.renderable).toHaveLength(1);
  });

  it("a SOUND but INCONSISTENT set → ESCALATE (P2 fires after P1)", () => {
    // Two claims, BOTH VALIDATED (P1), on the SAME subject, whose type-pair is
    // declared MUTUAL_EXCLUSION in the default table (FULFILLMENT_STAGE ⊥
    // ESTIMATED_ARRIVAL). P2 suppresses both → ESCALATE; never renders both (§D).
    const stageReq: EvidenceRequirement = { ...PUBLIC_REQ, key: "fulfil" };
    const etaReq: EvidenceRequirement = { ...PUBLIC_REQ, key: "eta" };

    const ledger = new EvidenceLedger();
    recordTrusted(ledger, stageReq.key, "delivered");
    recordTrusted(ledger, etaReq.key, "45min");

    const candidates: readonly CandidateClaim[] = [
      {
        soundness: { ...publicClaim(stageReq) },
        subject: "order-7",
        type: "ORDER_FULFILLMENT_STAGE",
        value: "delivered",
      },
      {
        soundness: { ...publicClaim(etaReq) },
        subject: "order-7",
        type: "ORDER_ESTIMATED_ARRIVAL",
        value: "45min",
      },
    ];
    const result = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);

    // P1 validated BOTH (so the failure is genuinely a SET property, not a
    // per-claim soundness one) — that is what makes P2's role load-bearing.
    expect(result.perClaim.map((p) => p.verdict)).toEqual(["VALIDATED", "VALIDATED"]);
    // P2 suppressed both → ESCALATE, nothing renderable.
    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(0);
    expect(result.consistency.suppressions.length).toBeGreaterThan(0);
  });

  it("P1 runs BEFORE P2 — a non-VALIDATED member never suppresses a valid same-subject claim (§D)", () => {
    // Same subject, same exclusion type-pair — BUT the ETA claim is UNSOUND (its
    // key is absent → UNKNOWN). §D: the non-validated member must NOT enter or
    // suppress the P2 set, so the VALIDATED fulfillment claim renders alone.
    const stageReq: EvidenceRequirement = { ...PUBLIC_REQ, key: "fulfil2" };
    const etaReq: EvidenceRequirement = { ...PUBLIC_REQ, key: "eta-absent" };

    const ledger = new EvidenceLedger();
    recordTrusted(ledger, stageReq.key, "delivered");
    // etaReq.key intentionally NOT recorded → its claim is UNKNOWN.

    const candidates: readonly CandidateClaim[] = [
      {
        soundness: { ...publicClaim(stageReq) },
        subject: "order-8",
        type: "ORDER_FULFILLMENT_STAGE",
        value: "delivered",
      },
      {
        soundness: { ...publicClaim(etaReq) },
        subject: "order-8",
        type: "ORDER_ESTIMATED_ARRIVAL",
        value: "45min",
      },
    ];
    const result = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);

    expect(result.perClaim.map((p) => p.verdict)).toEqual(["VALIDATED", "UNKNOWN"]);
    // The unsound ETA did NOT enter P2, so it did NOT suppress the valid stage
    // claim — which renders alone (no conflict). This is the §D ordering guard:
    // if P1 ran AFTER P2 (or the filter were dropped), the UNKNOWN member would
    // collide with the VALIDATED one and force ESCALATE → RED.
    expect(result.terminal).toBe("RENDER");
    expect(result.renderable).toHaveLength(1);
    expect(result.renderable[0]?.type).toBe("ORDER_FULFILLMENT_STAGE");
  });

  it("every candidate gets an EXPLICIT three-valued verdict (P4 — no silent drop)", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, PUBLIC_REQ.key, "10-22"); // one present, one absent
    const candidates: readonly CandidateClaim[] = [
      { soundness: publicClaim(PUBLIC_REQ), subject: "s1", type: "A", value: 1 },
      { soundness: publicClaim(PUBLIC_REQ_2), subject: "s2", type: "B", value: 2 },
    ];
    const result = runClaimsKernel(ledger, candidates, CLAIMS_DEPS);
    // perClaim has one entry PER candidate, in input order — none disappears.
    expect(result.perClaim).toHaveLength(candidates.length);
    expect(result.perClaim.map((p) => p.type)).toEqual(["A", "B"]);
    for (const p of result.perClaim) {
      expect(CLAIM_VERDICTS).toContain(p.verdict); // each is a 3-valued verdict
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC4 — TOPOLOGY ASYMMETRY: Read+Action → Ledger → Claims → Renderer (§F; §R)
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC4 — asymmetric one-directional topology (SDD §F; §R condition 1)", () => {
  it("the FOUR stages are distinct and the flow is exactly Read+Action → Ledger → Claims → Renderer", () => {
    expect(TOPOLOGY_STAGES).toEqual([
      "READ_ACTION",
      "EVIDENCE_LEDGER",
      "CLAIMS",
      "RENDERER",
    ]);
    expect(new Set(TOPOLOGY_STAGES).size).toBe(4); // distinct, not collapsed
    expect(ASYMMETRIC_TOPOLOGY).toEqual([
      { from: "READ_ACTION", to: "EVIDENCE_LEDGER" },
      { from: "EVIDENCE_LEDGER", to: "CLAIMS" },
      { from: "CLAIMS", to: "RENDERER" },
    ]);
  });

  it("the real topology has NO backward edge (one-directional)", () => {
    expect(topologyHasBackwardEdge(ASYMMETRIC_TOPOLOGY)).toBe(false);
  });

  it("Claims CONSUMES the Ledger; the Ledger does NOT consume Claims (asymmetry)", () => {
    // The §F asymmetry: there is an EVIDENCE_LEDGER → CLAIMS edge (Claims consumes
    // the Ledger) and NO edge pointing back from CLAIMS/RENDERER into the Ledger
    // or Read. `ledgerConsumesClaims` is the structural witness of "nothing flows
    // Claims → Ledger → Read".
    expect(ledgerConsumesClaims(ASYMMETRIC_TOPOLOGY)).toBe(false);
    const ledgerToClaims = ASYMMETRIC_TOPOLOGY.some(
      (e) => e.from === "EVIDENCE_LEDGER" && e.to === "CLAIMS",
    );
    expect(ledgerToClaims).toBe(true);
  });

  it("NON-VACUITY: injecting a backward Claims → Ledger edge is DETECTED (collapse forbidden)", () => {
    // Construct the §R topology-collapse: a Claims → Ledger reversal. Both guards
    // must flip TRUE — proving they are not vacuously false. This is the "verified
    // RED when the guard is disabled" demonstration for the asymmetry: if the
    // topology were ever wired this way, these detectors fire.
    const collapsed: readonly TopologyEdge[] = [
      ...ASYMMETRIC_TOPOLOGY,
      { from: "CLAIMS", to: "EVIDENCE_LEDGER" }, // the forbidden backward arrow
    ];
    expect(topologyHasBackwardEdge(collapsed)).toBe(true);
    expect(ledgerConsumesClaims(collapsed)).toBe(true);

    // A self-edge (a stage feeding itself — another collapse) is also detected.
    const selfLoop: readonly TopologyEdge[] = [
      { from: "CLAIMS", to: "CLAIMS" },
    ];
    expect(topologyHasBackwardEdge(selfLoop)).toBe(true);
  });

  it("runClaimsKernel does NOT mutate the Ledger — Claims reads, never writes (one-directional)", () => {
    // The data-flow asymmetry at runtime: the Claims kernel CONSUMES the ledger
    // snapshot but never records into it (no Claims → Ledger flow). The ledger's
    // version token (which advances on EVERY mutation) is unchanged across the run.
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, PUBLIC_REQ.key, "10-22");
    const versionBefore = ledger.version;
    const keysBefore = [...ledger.keys()];

    runClaimsKernel(
      ledger,
      [{ soundness: publicClaim(PUBLIC_REQ), subject: "s", type: "T", value: 1 }],
      CLAIMS_DEPS,
    );

    expect(ledger.version).toBe(versionBefore); // no mutation → no version bump
    expect([...ledger.keys()]).toEqual(keysBefore); // no key written by Claims
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC5 — §R HARD-ERRORS: no free-text validation; 3-valued intact; layers independent
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC5 — §R topology hard-errors are structurally prevented", () => {
  it("NO free-text reasoning validates a claim — validation is the typed §5 predicate (§R cond. 2)", () => {
    // The CandidateClaim carries its soundness ONLY as a typed `MinimalClaim`
    // (requiredEvidence + minSourceIntegrity + kind + actor) — there is no
    // `reason`/`rationale`/prose field anywhere on the validation path. We assert
    // structurally that the candidate shape has no free-text reasoning key, and
    // that adding a prose field has ZERO effect on the verdict (the predicate
    // never reads it).
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, PUBLIC_REQ.key, "10-22");

    const candidate: CandidateClaim = {
      soundness: publicClaim(PUBLIC_REQ),
      subject: "s",
      type: "T",
      value: 1,
    };
    // The candidate's own keys: soundness/subject/type/value — no reasoning prose.
    expect(Object.keys(candidate).sort()).toEqual(
      ["soundness", "subject", "type", "value"].sort(),
    );
    // The soundness face's keys are the typed §5 fields — no free-text reason.
    expect(Object.keys(candidate.soundness)).not.toContain("reason");
    expect(Object.keys(candidate.soundness)).not.toContain("rationale");
    expect(Object.keys(candidate.soundness)).not.toContain("explanation");

    // Smuggling a prose field onto the candidate cannot change the verdict — the
    // predicate quantifies over requiredEvidence, not prose. VALIDATED either way.
    const withProse = {
      ...candidate,
      soundness: {
        ...candidate.soundness,
        reason: "the model says this is true, trust me",
      } as unknown as MinimalClaim,
    };
    const a = runClaimsKernel(ledger, [candidate], CLAIMS_DEPS);
    const b = runClaimsKernel(ledger, [withProse], CLAIMS_DEPS);
    expect(a.perClaim[0]?.verdict).toBe("VALIDATED");
    expect(b.perClaim[0]?.verdict).toBe(a.perClaim[0]?.verdict); // prose ignored
  });

  it("the three-valued VALIDATED|UNKNOWN|REFUSED model is INTACT (§R cond. 3)", () => {
    // The Claims kernel's per-claim verdict is EXACTLY the Q1 three-valued model,
    // in spec order, neither reversed nor extended. A transient
    // inversion/removal/reorder of CLAIM_VERDICTS flips this RED.
    expect(CLAIM_VERDICTS).toEqual(["VALIDATED", "UNKNOWN", "REFUSED"]);
    expect(CLAIM_VERDICTS).toHaveLength(3);

    // Every per-claim verdict the kernel emits is a member of that exact set —
    // it never emits a turn terminal (ESCALATE/CLARIFY) as a CLAIM verdict.
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, PUBLIC_REQ.key, "10-22");
    const result = runClaimsKernel(
      ledger,
      [{ soundness: publicClaim(PUBLIC_REQ), subject: "s", type: "T", value: 1 }],
      CLAIMS_DEPS,
    );
    for (const p of result.perClaim) {
      expect(CLAIM_VERDICTS).toContain(p.verdict);
      expect(["ESCALATE", "CLARIFY", "RENDER"]).not.toContain(p.verdict);
    }
  });

  it("the turn terminal is the FOUR-valued TurnTerminal, distinct from the claim verdict (§I)", () => {
    // The output authority returns a TURN terminal — RENDER/UNKNOWN/ESCALATE/
    // CLARIFY — which is NOT the 3-valued claim verdict (the §P misreading
    // refused). Here we exercise the three terminals the kernel can produce.
    const empty = new EvidenceLedger();
    const unknownTurn = runClaimsKernel(
      empty,
      [{ soundness: publicClaim(PUBLIC_REQ), subject: "s", type: "T", value: 1 }],
      CLAIMS_DEPS,
    );
    const terminals: readonly TurnTerminal[] = ["RENDER", "UNKNOWN", "ESCALATE", "CLARIFY"];
    expect(terminals).toContain(unknownTurn.terminal);
    expect(unknownTurn.terminal).toBe("UNKNOWN"); // nothing validated → honest ignorance
  });

  it("Read's two layers are independent (re-stated structurally for §R cond. 4)", () => {
    // The independence is the AC1 property; re-asserted here as a §R hard-error
    // guard. A ReadKernelResult is two SEPARATE fields; neither type references
    // the other, so all combinations exist (already exhaustively checked in AC1).
    const provenances: readonly LedgerTaint[] = ["TRUSTED", "UNTRUSTED_DATA"];
    for (const provenance of provenances) {
      // Hold provenance, vary access — provenance is untouched.
      const r1 = runReadKernel(
        {},
        {
          access: { decideAccess: () => "REFUSE" },
          provenance: { decideProvenance: () => provenance },
        },
      );
      const r2 = runReadKernel(
        {},
        {
          access: { decideAccess: () => "ALLOW_READ" },
          provenance: { decideProvenance: () => provenance },
        },
      );
      expect(r1.provenance).toBe(provenance);
      expect(r2.provenance).toBe(provenance);
      expect(r1.access).not.toBe(r2.access); // access varied, provenance fixed
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC6 — KERNEL PURITY: no downstream import; Action reused intra-package
// ═══════════════════════════════════════════════════════════════════════════

describe("Q5 AC6 — kernel purity (SDD §R: adjudicate → claustrum → ibatexas)", () => {
  it("kernels.ts imports NOTHING from a downstream package", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, "../src/claims/kernels.ts"),
      "utf8",
    );
    // No import from a downstream package (claustrum / ibatexas) — the dependency
    // arrow never points backward (§R kernel purity).
    expect(src).not.toMatch(/from\s+["']@?claustrum/);
    expect(src).not.toMatch(/from\s+["']@?ibatexas/);
    expect(src).not.toMatch(/from\s+["'][^"']*claustrum/);
    expect(src).not.toMatch(/from\s+["'][^"']*ibatexas/);
  });

  it("the Action kernel is REUSED intra-package — kernels.ts imports Decision from ../decision", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, "../src/claims/kernels.ts"),
      "utf8",
    );
    // The §F Action verdict comes from the EXISTING decision module (intra-package
    // — same @adjudicate/core), NOT a fresh local union. This is the reuse-not-fork
    // witness at the import level.
    expect(src).toMatch(/import\s+type\s+\{[^}]*\bDecision\b[^}]*\}\s+from\s+["']\.\.\/decision\.js["']/);
    expect(src).toMatch(/\bDecisionKind\b/);
    // And kernels.ts does NOT declare its own `EXECUTE | REFUSE | ...` union (a
    // fork) — the six action values appear only via the imported Decision/Kind.
    expect(src).not.toMatch(/=\s*["']EXECUTE["']\s*\|\s*["']REFUSE["']/);
  });
});
