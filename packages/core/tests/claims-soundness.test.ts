/**
 * Q3 — the §5 soundness validator `claimAllowed` (SDD §E; v1.1 §5; §J.1).
 *
 * Proves EACH §5 conjunct is enforced NON-vacuously (every test fails — RED —
 * if its conjunct's guard is removed/inverted; that non-vacuity is restated in
 * the Q3 self-check) and the three-valued mapping (registry §5 / §K) holds:
 *   · C0 empty requiredEvidence            → REFUSED (no vacuous ∀-over-∅)
 *   · all-pass read_claim                  → VALIDATED
 *   · must_read_this_turn from cache        → UNKNOWN (cache masquerade, §G/§R)
 *   · C1 ownership required ∧ ¬owns / no-owner → REFUSED (Inv 2)
 *   · C3 UNTRUSTED_DATA                     → REFUSED (never validates, Inv 3)
 *   · C2 below integrity floor             → UNKNOWN
 *   · stale cacheable                      → UNKNOWN
 *   · C4 action outcome                    → REFUSED / VALIDATED / (money) REFUSED
 *   · §P misreading refused (Owner==Verified AND age<=TruthBudget)
 *   · kernel purity (no downstream import)
 *
 * Uses the REAL Q2 `EvidenceLedger` (not a mock) so present/fresh/provenance run
 * through the actual resolution; only the repo-abstract `owns`/`outcomeConfirmed`
 * capabilities are injected.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EvidenceLedger,
  claimAllowed,
  meetsSourceIntegrityFloor,
  type EvidenceEntryInput,
  type EvidenceRequirement,
  type MinimalClaim,
  type SoundnessDeps,
  type SourceIntegrity,
} from "@adjudicate/core";

// ─────────────────────────────────────────────────────────────────────────
// Builders — minimal, explicit; every field set so no test relies on a default.
// ─────────────────────────────────────────────────────────────────────────

const NOW = 1_000_000; // fixed injected clock; deterministic, no Date.now().

/** A fully-passing read requirement, overridable per field. */
function req(over: Partial<EvidenceRequirement> = {}): EvidenceRequirement {
  return {
    key: "k",
    ownershipPolicy: "not_applicable",
    freshnessPolicy: "static",
    sourceIntegrity: "structured",
    provenancePolicy: "preserve",
    ...over,
  };
}

/**
 * A fully-trusted, present, live ledger entry for a key, overridable. NOTE: the
 * §G ledger entry carries NO source-integrity axis — C2 integrity is the
 * REQUIREMENT's declared channel (`req({ sourceIntegrity })`), not a ledger
 * field — so this builder takes no `sourceIntegrity`.
 */
function entry(over: Partial<EvidenceEntryInput> = {}): EvidenceEntryInput {
  return {
    key: "k",
    value: "v",
    source: "test",
    fetchedAt: NOW,
    sourceMode: "live",
    taint: "TRUSTED",
    // Fail-closed origin default: a generic trusted read is NOT first-party
    // (SDD §G / §J.3). Passes `preserve`; REFUSED under `first_party_only`.
    originProvenance: "TRUSTED_THIRD_PARTY",
    ...over,
  };
}

/** A read_claim with a structured floor by default, overridable. */
function readClaim(over: Partial<MinimalClaim> = {}): MinimalClaim {
  return {
    requiredEvidence: [req()],
    minSourceIntegrity: "structured",
    kind: "read_claim",
    actor: { id: "actor-1" },
    ...over,
  };
}

/** A ledger seeded with the given entries. */
function ledgerWith(...entries: EvidenceEntryInput[]): EvidenceLedger {
  const l = new EvidenceLedger("turn-1");
  for (const e of entries) l.record(e);
  return l;
}

/** Default deps: owns=true, outcome=true, fixed clock. Overridable per test. */
function deps(over: Partial<SoundnessDeps> = {}): SoundnessDeps {
  return {
    owns: () => true,
    outcomeConfirmed: () => true,
    now: NOW,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// AC2 — the all-pass baseline (the reference VALIDATED, every guard satisfied)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — all-pass baseline (§E; AC2)", () => {
  it("present+fresh+owned+integrity+provenance on a read_claim → VALIDATED", () => {
    // Every conjunct satisfied; this is the ONLY path to VALIDATED. Every later
    // test perturbs exactly one conjunct off this baseline, so a guard removal
    // would make these negatives leak back to VALIDATED (the non-vacuity proof).
    const verdict = claimAllowed(readClaim(), ledgerWith(entry()), deps());
    expect(verdict).toBe("VALIDATED");
  });

  it("a required+owned evidence with a resource binding → VALIDATED", () => {
    // The C1 happy path, so the C1 negatives below are non-vacuous.
    const claim = readClaim({
      requiredEvidence: [req({ ownershipPolicy: "required" })],
      resources: { k: { orderId: "o-1" } },
    });
    const verdict = claimAllowed(claim, ledgerWith(entry()), deps({ owns: () => true }));
    expect(verdict).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC1 — C0: empty requiredEvidence never auto-VALIDATES (§E C0; §R hard error)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C0 no vacuous validation (§E C0; §R; AC1)", () => {
  it("empty requiredEvidence → REFUSED, NOT VALIDATED (∀-over-∅ vacuous-true bug)", () => {
    // The headline §R hard error: a claim with no backing must never validate.
    // If C0 were removed, the ∀ over ∅ is vacuously true and this would VALIDATE.
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [] }),
      ledgerWith(),
      deps(),
    );
    expect(verdict).toBe("REFUSED");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("empty requiredEvidence on an action_claim → REFUSED too (no backing)", () => {
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [], kind: "action_claim" }),
      ledgerWith(),
      deps({ outcomeConfirmed: () => true }),
    );
    expect(verdict).toBe("REFUSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC3 — must_read_this_turn: cache masquerade (§G/§R hard error)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — must_read_this_turn cache masquerade (§G/§R; AC3)", () => {
  it("must_read_this_turn from sourceMode 'cache' → UNKNOWN (not VALIDATED)", () => {
    // §R hard rule: a must_read_this_turn validated from a cache row is forbidden.
    // We cannot prove it is live this turn → UNKNOWN, never a concrete value.
    const claim = readClaim({
      requiredEvidence: [req({ freshnessPolicy: "must_read_this_turn" })],
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry({ sourceMode: "cache" })),
      deps(),
    );
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("must_read_this_turn from sourceMode 'live' → VALIDATED", () => {
    // The contrast: the SAME requirement validates when actually read live. This
    // pairing proves the cache→UNKNOWN result is the sourceMode guard, not noise.
    const claim = readClaim({
      requiredEvidence: [req({ freshnessPolicy: "must_read_this_turn" })],
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry({ sourceMode: "live" })),
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC4 — C1: ownership is a validation predicate (§E C1; Inv 2)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C1 ownership (§E C1; Inv 2; AC4)", () => {
  it("ownershipPolicy required ∧ owns=false → REFUSED", () => {
    // Ownership DENIED → never asserted → REFUSED (not UNKNOWN).
    const claim = readClaim({
      requiredEvidence: [req({ ownershipPolicy: "required" })],
      resources: { k: { orderId: "o-1" } },
    });
    const verdict = claimAllowed(claim, ledgerWith(entry()), deps({ owns: () => false }));
    expect(verdict).toBe("REFUSED");
  });

  it("ownershipPolicy required ∧ NO resource binding → REFUSED ('no owner' ≠ 'any owner', Inv 2)", () => {
    // The Inv 2 no-owner-attribution case: a required key with no resource. Even
    // with a permissive owns()=true, "no owner" must REFUSE — and owns() must NOT
    // be consulted (a missing owner is not "any owner").
    let ownsCalled = false;
    const claim = readClaim({
      requiredEvidence: [req({ ownershipPolicy: "required" })],
      // no `resources` map at all.
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({
        owns: () => {
          ownsCalled = true;
          return true;
        },
      }),
    );
    expect(verdict).toBe("REFUSED");
    expect(ownsCalled).toBe(false); // owns() never consulted for a no-owner key.
  });

  it("ownershipPolicy required with an explicit undefined binding → REFUSED (no owner)", () => {
    // A binding present but undefined is still "no owner attribution".
    const claim = readClaim({
      requiredEvidence: [req({ ownershipPolicy: "required" })],
      resources: { k: undefined },
    });
    const verdict = claimAllowed(claim, ledgerWith(entry()), deps({ owns: () => true }));
    expect(verdict).toBe("REFUSED");
  });

  it("ownershipPolicy not_applicable → owns() is irrelevant, still VALIDATED with owns=false", () => {
    // C1 only gates `required` evidence; a public (not_applicable) claim must NOT
    // be blocked by a false owns(). Proves C1's guard is scoped to `required`.
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [req({ ownershipPolicy: "not_applicable" })] }),
      ledgerWith(entry()),
      deps({ owns: () => false }),
    );
    expect(verdict).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC5 — C3: UNTRUSTED_DATA may never be the validating value (§E C3; Inv 3)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C3 provenance / UNTRUSTED never validates (§E C3; Inv 3; AC5)", () => {
  it("entry taint UNTRUSTED_DATA → REFUSED (never the validating value)", () => {
    const verdict = claimAllowed(
      readClaim(),
      ledgerWith(entry({ taint: "UNTRUSTED_DATA" })),
      deps(),
    );
    expect(verdict).toBe("REFUSED");
  });

  it("originProvenance UNTRUSTED_DATA (survives persistence) → REFUSED even if taint TRUSTED", () => {
    // §G: originProvenance survives persistence — a row written from UNTRUSTED
    // ingress stays UNTRUSTED and never washes to TRUSTED, even when the current
    // read-layer taint is TRUSTED.
    const verdict = claimAllowed(
      readClaim(),
      ledgerWith(entry({ taint: "TRUSTED", originProvenance: "UNTRUSTED_DATA" })),
      deps(),
    );
    expect(verdict).toBe("REFUSED");
  });

  // A first_party_only requirement at a first-party-verified floor; only the
  // origin axis varies across the three cases below.
  function firstPartyClaim(): MinimalClaim {
    return readClaim({
      requiredEvidence: [
        req({ provenancePolicy: "first_party_only", sourceIntegrity: "first_party_verified" }),
      ],
      minSourceIntegrity: "first_party_verified",
    });
  }

  it("first_party_only with a FIRST_PARTY origin → VALIDATED (the ONLY origin that satisfies it)", () => {
    // The positive case — proves the gate is not blanket-REFUSE (non-vacuous).
    const verdict = claimAllowed(
      firstPartyClaim(),
      ledgerWith(entry({ originProvenance: "FIRST_PARTY" })),
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
  });

  it("first_party_only with a TRUSTED_THIRD_PARTY origin → REFUSED (a trusted third party is NOT first-party; §J.3/Inv 3)", () => {
    // THE de-vacuuming guard. Under the OLD 2-value origin this case was
    // indistinguishable from first-party and wrongly VALIDATED, leaving
    // first_party_only ≡ preserve (vacuous). The 3-value axis makes it strictly
    // stronger: a TRUSTED_THIRD_PARTY origin (what a generic trusted read maps to,
    // fail-closed) does NOT satisfy first_party_only. Invert the gate in
    // soundness.ts (=== "FIRST_PARTY" → !== / back to "TRUSTED") and this leaks to
    // VALIDATED → RED. Directly protects the PAYMENT_STATUS first-party money read.
    const verdict = claimAllowed(
      firstPartyClaim(),
      ledgerWith(entry({ taint: "TRUSTED", originProvenance: "TRUSTED_THIRD_PARTY" })),
      deps(),
    );
    expect(verdict).toBe("REFUSED");
  });

  it("preserve (NOT first_party_only) ACCEPTS that SAME TRUSTED_THIRD_PARTY origin → VALIDATED (strictly weaker)", () => {
    // Proves the new gate is a strict tightening of first_party_only only, not of
    // preserve: the identical TRUSTED_THIRD_PARTY origin REFUSED above validates
    // here, because preserve requires only a non-UNTRUSTED origin.
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [req({ provenancePolicy: "preserve" })] }),
      ledgerWith(entry({ originProvenance: "TRUSTED_THIRD_PARTY" })),
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC6 — C2: source-integrity floor (§E C2)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C2 source-integrity floor (§E C2; AC6)", () => {
  it("free_text evidence below a structured floor → UNKNOWN (e.g. 'sem alérgenos')", () => {
    // registry §6 MENU_ITEM_ALLERGENS: a free-text "sem alérgenos" fails the
    // structured floor → UNKNOWN (we lack adequate evidence), never VALIDATED.
    // C2 integrity is the REQUIREMENT's declared channel (req sourceIntegrity)
    // vs the claim floor — not a ledger field. A free_text requirement under a
    // structured floor fails C2.
    const claim = readClaim({
      requiredEvidence: [req({ sourceIntegrity: "free_text" })],
      minSourceIntegrity: "structured",
    });
    const verdict = claimAllowed(claim, ledgerWith(entry()), deps());
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("structured evidence meeting a structured floor → VALIDATED (floor is non-vacuous)", () => {
    const verdict = claimAllowed(
      readClaim({
        requiredEvidence: [req({ sourceIntegrity: "structured" })],
        minSourceIntegrity: "structured",
      }),
      ledgerWith(entry()),
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
    // Sanity: the comparator the predicate reuses agrees with the verdict.
    expect(meetsSourceIntegrityFloor("free_text", "structured")).toBe(false);
    expect(meetsSourceIntegrityFloor("structured", "structured")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC7 — freshness: stale cacheable (§E fresh(e))
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — stale cacheable freshness (§E fresh(e); AC7)", () => {
  const cacheableReq = (ttl: number): EvidenceRequirement =>
    req({ freshnessPolicy: { kind: "cacheable", ttl } });

  it("cacheable fetchedAt beyond ttl → UNKNOWN (stale)", () => {
    // fetchedAt is ttl+1 ms in the past relative to the injected now → stale.
    const ttl = 30_000;
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
      ledgerWith(entry({ fetchedAt: NOW - ttl - 1 })),
      deps(),
    );
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("cacheable within ttl (and at the ttl boundary) → VALIDATED (non-vacuous)", () => {
    const ttl = 30_000;
    // Strictly within window.
    expect(
      claimAllowed(
        readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
        ledgerWith(entry({ fetchedAt: NOW - ttl + 1 })),
        deps(),
      ),
    ).toBe("VALIDATED");
    // Exactly at the boundary (age == ttl) is fresh (age <= ttl).
    expect(
      claimAllowed(
        readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
        ledgerWith(entry({ fetchedAt: NOW - ttl })),
        deps(),
      ),
    ).toBe("VALIDATED");
  });

  it("cacheable reindex_bound is not staled on the wall clock → VALIDATED", () => {
    // reindex_bound is floored by reindex lag, not a TTL clock (registry §6); a
    // §5 clock comparison must not stale it (a tighter check is later §O work).
    const verdict = claimAllowed(
      readClaim({
        requiredEvidence: [req({ freshnessPolicy: { kind: "cacheable", ttl: "reindex_bound" } })],
      }),
      ledgerWith(entry({ fetchedAt: NOW - 10_000_000 })),
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC8 — C4: action-claim outcomeConfirmed (§E C4; Inv 4)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C4 action outcomeConfirmed (§E C4; Inv 4; AC8)", () => {
  const actionReq = req({ freshnessPolicy: "action_outcome" });

  it("action_claim without outcomeConfirmed → REFUSED (the confabulation guard)", () => {
    // PURCHASE_COMPLETED refused-no-EXECUTE (registry §6): asserting a
    // non-happening is a contradiction → REFUSED, not UNKNOWN.
    const claim = readClaim({ requiredEvidence: [actionReq], kind: "action_claim" });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({ outcomeConfirmed: () => false }),
    );
    expect(verdict).toBe("REFUSED");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("action_claim with EXECUTE+dispatched+success (outcomeConfirmed) → VALIDATED", () => {
    const claim = readClaim({ requiredEvidence: [actionReq], kind: "action_claim" });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({ outcomeConfirmed: () => true }),
    );
    expect(verdict).toBe("VALIDATED");
  });

  it("money action without settlement (outcomeConfirmed=false) → NOT VALIDATED (REFUSED)", () => {
    // Inv 4: success ≠ session; settlement is part of outcomeConfirmed for money.
    // The kernel models "settled" via the injected outcomeConfirmed: a money
    // action whose settlement has not cleared yields outcomeConfirmed=false here.
    let inspected: MinimalClaim | undefined;
    const claim = readClaim({ requiredEvidence: [actionReq], kind: "action_claim" });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({
        outcomeConfirmed: (c) => {
          inspected = c; // outcome accessor receives the claim (Inv 4 wiring).
          return false; // dispatched=ok but settlement not cleared → not confirmed.
        },
      }),
    );
    expect(verdict).toBe("REFUSED");
    expect(inspected).toBe(claim);
  });

  it("a read_claim never consults outcomeConfirmed (C4 is action-only)", () => {
    // Proves C4 is scoped to action_claim: a read_claim validates even when
    // outcomeConfirmed would return false, and the accessor is never called.
    let called = false;
    const verdict = claimAllowed(
      readClaim({ kind: "read_claim" }),
      ledgerWith(entry()),
      deps({
        outcomeConfirmed: () => {
          called = true;
          return false;
        },
      }),
    );
    expect(verdict).toBe("VALIDATED");
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC presence/error/conflict — the ledger's non-present states → UNKNOWN (Inv 7)
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — present(e) over the ledger states (§E; Inv 7/H3)", () => {
  it("absent key → UNKNOWN (missing, not a failure)", () => {
    // The ledger has no entry for the key.
    const verdict = claimAllowed(readClaim(), ledgerWith(), deps());
    expect(verdict).toBe("UNKNOWN");
  });

  it("read error → UNKNOWN (fail-closed, distinct from absence)", () => {
    const l = new EvidenceLedger("turn-err");
    l.recordError("k", "upstream 500");
    expect(claimAllowed(readClaim(), l, deps())).toBe("UNKNOWN");
  });

  it("conflicting writes → UNKNOWN (H3, never last-write-as-validated)", () => {
    const l = ledgerWith(entry({ value: "a" }), entry({ value: "b" }));
    expect(claimAllowed(readClaim(), l, deps())).toBe("UNKNOWN");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC9 — refuse the §P misreading: NOT `Owner==Verified AND age<=TruthBudget`
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — refuse §P 'Owner==Verified AND age<=TruthBudget' (§E; §P)", () => {
  it("an OWNED but STALE claim is still UNKNOWN (freshness is its own per-evidence conjunct)", () => {
    // §P misreading would VALIDATE this: owner is verified. The real predicate
    // staleness conjunct (per e.freshnessPolicy) makes it UNKNOWN — proving
    // freshness is NOT folded into ownership, and is per-evidence not turn-level.
    const ttl = 30_000;
    const claim = readClaim({
      requiredEvidence: [
        req({ ownershipPolicy: "required", freshnessPolicy: { kind: "cacheable", ttl } }),
      ],
      resources: { k: { orderId: "o-1" } },
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry({ fetchedAt: NOW - ttl - 1 })), // stale.
      deps({ owns: () => true }), // owner IS verified.
    );
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("a FRESH but UNOWNED required claim is REFUSED (ownership is ONE conjunct, not the whole predicate)", () => {
    // §P misreading would also mis-handle this. Fresh (static) but ownership
    // denied → REFUSED. Ownership is one conjunct AND its failure maps to REFUSED
    // (denial), distinct from the UNKNOWN a staleness failure yields above.
    const claim = readClaim({
      requiredEvidence: [req({ ownershipPolicy: "required", freshnessPolicy: "static" })],
      resources: { k: { orderId: "o-1" } },
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()), // fresh.
      deps({ owns: () => false }), // unowned.
    );
    expect(verdict).toBe("REFUSED");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("integrity/provenance fail INDEPENDENTLY of ownership+age (multi-conjunct, not 2-clause)", () => {
    // A claim that is owned AND fresh but fails C2 integrity → UNKNOWN; and one
    // owned+fresh+integrity-OK but UNTRUSTED → REFUSED. Proves the predicate has
    // independent integrity & provenance conjuncts the §P 2-clause reading lacks.
    const owned = { k: { orderId: "o-1" } };
    const integrityFail = claimAllowed(
      readClaim({
        requiredEvidence: [
          req({ ownershipPolicy: "required", sourceIntegrity: "free_text" }),
        ],
        minSourceIntegrity: "structured",
        resources: owned,
      }),
      ledgerWith(entry()),
      deps({ owns: () => true }),
    );
    expect(integrityFail).toBe("UNKNOWN");

    const provenanceFail = claimAllowed(
      readClaim({
        requiredEvidence: [req({ ownershipPolicy: "required" })],
        resources: owned,
      }),
      ledgerWith(entry({ taint: "UNTRUSTED_DATA" })),
      deps({ owns: () => true }),
    );
    expect(provenanceFail).toBe("REFUSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Verdict-mapping completeness — REFUSED dominates UNKNOWN within a claim
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — verdict mapping precedence (registry §5)", () => {
  it("one evidence UNKNOWN + one REFUSED → REFUSED (denial dominates ignorance)", () => {
    // Two evidences: k1 absent (UNKNOWN-class), k2 UNTRUSTED (REFUSED-class). The
    // claim verdict is the SAFEST → REFUSED.
    const claim = readClaim({
      requiredEvidence: [req({ key: "k1" }), req({ key: "k2" })],
    });
    const l = ledgerWith(entry({ key: "k2", taint: "UNTRUSTED_DATA" })); // k1 absent.
    expect(claimAllowed(claim, l, deps())).toBe("REFUSED");
  });

  it("multiple all-pass evidences → VALIDATED (∀ holds across the set)", () => {
    const claim = readClaim({
      requiredEvidence: [req({ key: "k1" }), req({ key: "k2" })],
    });
    const l = ledgerWith(entry({ key: "k1" }), entry({ key: "k2" }));
    expect(claimAllowed(claim, l, deps())).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1-snd Fix 1 — action_outcome on a read_claim must still enforce C4 (§E C4)
// ─────────────────────────────────────────────────────────────────────────
//
// C4 ("EXECUTE ∧ dispatched=ok ∧ result.success ∧ (settlement, for money)") is
// the OUTCOME conjunct. Its trigger is NOT just `kind === "action_claim"`: a
// claim whose evidence IS this turn's Action verdict + dispatch (`freshnessPolicy:
// "action_outcome"`, §E/§G) asserts an action outcome regardless of `kind`. The
// per-evidence freshness branch PASSes `action_outcome` (staleness is not its
// axis), so claim-level C4 is the ONLY place that enforces the outcome — and it
// must fire for ANY claim that asserts one, not only `action_claim`s. Otherwise a
// read_claim could assert PURCHASE_COMPLETED it never confirmed.

describe("claimAllowed — C4 fires for action_outcome on a read_claim (§E C4; R1-snd Fix 1)", () => {
  const actionOutcomeReq = req({ freshnessPolicy: "action_outcome" });

  it("(a) read_claim with an action_outcome requirement + ¬outcomeConfirmed → REFUSED", () => {
    // The defect this fix closes: kind !== "action_claim" yet the requirement's
    // evidence IS an action outcome. Every other conjunct passes (present, live,
    // structured, preserve, not_applicable), so the verdict reaches C4. With the
    // outcome UNconfirmed, asserting the action is a contradiction → REFUSED.
    // NON-VACUOUS: revert the broadened `assertsActionOutcome` trigger back to
    // `kind === "action_claim"` and C4 never fires here → this VALIDATES (RED).
    const claim = readClaim({
      requiredEvidence: [actionOutcomeReq],
      kind: "read_claim",
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({ outcomeConfirmed: () => false }),
    );
    expect(verdict).toBe("REFUSED");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("(a') the outcome accessor receives the read_claim (C4 wiring, not action-only)", () => {
    let inspected: MinimalClaim | undefined;
    const claim = readClaim({
      requiredEvidence: [actionOutcomeReq],
      kind: "read_claim",
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({
        outcomeConfirmed: (c) => {
          inspected = c;
          return false;
        },
      }),
    );
    expect(verdict).toBe("REFUSED");
    expect(inspected).toBe(claim);
  });

  it("(c) read_claim with an action_outcome requirement + outcomeConfirmed=true → VALIDATED", () => {
    // The positive contrast — proves the broadened trigger is NOT blanket-REFUSE:
    // a correctly-confirmed action_outcome read still validates (C4 passes).
    const claim = readClaim({
      requiredEvidence: [actionOutcomeReq],
      kind: "read_claim",
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry()),
      deps({ outcomeConfirmed: () => true }),
    );
    expect(verdict).toBe("VALIDATED");
  });

  it("(b) action_claim + ¬outcomeConfirmed → REFUSED; + outcomeConfirmed → not blocked by C4 (unchanged)", () => {
    // The original action_claim behavior is preserved by the broadening (the OR's
    // first disjunct). Both polarities, on the same claim shape.
    const claim = readClaim({
      requiredEvidence: [actionOutcomeReq],
      kind: "action_claim",
    });
    expect(
      claimAllowed(claim, ledgerWith(entry()), deps({ outcomeConfirmed: () => false })),
    ).toBe("REFUSED");
    expect(
      claimAllowed(claim, ledgerWith(entry()), deps({ outcomeConfirmed: () => true })),
    ).toBe("VALIDATED");
  });

  it("a read_claim with NO action_outcome requirement never consults outcomeConfirmed (scope intact)", () => {
    // The broadening must not over-fire: a plain read_claim (static freshness)
    // still never calls the accessor and validates with outcomeConfirmed=false.
    let called = false;
    const verdict = claimAllowed(
      readClaim({ kind: "read_claim" }), // default req(): static freshness.
      ledgerWith(entry()),
      deps({
        outcomeConfirmed: () => {
          called = true;
          return false;
        },
      }),
    );
    expect(verdict).toBe("VALIDATED");
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1-snd Fix 2 — a NEGATIVE age (fetchedAt in the future) is NOT fresh (§G)
// ─────────────────────────────────────────────────────────────────────────
//
// Freshness is `now - fetchedAt` (§G); a value cannot be fresher than "now". A
// negative age (clock skew, or a future-stamped/tampered entry) previously passed
// the `age <= ttl` upper bound and validated as fresh. fresh ⟺ `0 <= age <= ttl`.

describe("claimAllowed — negative freshness age is not fresh (§G; R1-snd Fix 2)", () => {
  const cacheableReq = (ttl: number): EvidenceRequirement =>
    req({ freshnessPolicy: { kind: "cacheable", ttl } });

  it("(d) fetchedAt in the future (age < 0) under a cacheable ttl → UNKNOWN, not VALIDATED", () => {
    // NON-VACUOUS: revert the `age >= 0 &&` lower bound and age=-1 <= ttl is true →
    // this VALIDATES (RED). With the lower bound, a future stamp is not provably
    // fresh → UNKNOWN (stale-class).
    const ttl = 30_000;
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
      ledgerWith(entry({ fetchedAt: NOW + 1 })), // 1 ms in the future → age = -1.
      deps(),
    );
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("(d') a large future skew (age ≪ 0) is likewise UNKNOWN, never VALIDATED", () => {
    const ttl = 30_000;
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
      ledgerWith(entry({ fetchedAt: NOW + 10_000_000 })),
      deps(),
    );
    expect(verdict).toBe("UNKNOWN");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("(e) age == 0 (fetchedAt == now) → fresh → VALIDATED (lower-bound boundary, no false negative)", () => {
    // The new lower bound is `>= 0`, so age exactly 0 is still fresh.
    const ttl = 30_000;
    const verdict = claimAllowed(
      readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
      ledgerWith(entry({ fetchedAt: NOW })), // age = 0.
      deps(),
    );
    expect(verdict).toBe("VALIDATED");
  });

  it("(e') normal 0 < age <= ttl stays fresh → VALIDATED (the fix adds no false negatives)", () => {
    const ttl = 30_000;
    // Mid-window.
    expect(
      claimAllowed(
        readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
        ledgerWith(entry({ fetchedAt: NOW - 1 })),
        deps(),
      ),
    ).toBe("VALIDATED");
    // At the upper boundary (age == ttl).
    expect(
      claimAllowed(
        readClaim({ requiredEvidence: [cacheableReq(ttl)] }),
        ledgerWith(entry({ fetchedAt: NOW - ttl })),
        deps(),
      ),
    ).toBe("VALIDATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// C6 — value-binding (Theorem S (a-value)): a claim's RENDERED value is bound
// to its licensing evidence; a model-authored surplus value cannot VALIDATE.
// ─────────────────────────────────────────────────────────────────────────

describe("claimAllowed — C6 value-binding (§5 C6; Theorem S (a-value))", () => {
  it("no valueBinding → C6 is a no-op (value-agnostic §5 unchanged)", () => {
    // The fail-safe default: a claim that declares no binding carries a value the
    // predicate never inspects — VALIDATED exactly as before W6 (non-vacuity for
    // every existing ibatexas claim type).
    const claim = readClaim({ value: "anything-the-model-said" });
    expect(claimAllowed(claim, ledgerWith(entry({ value: "v" })), deps())).toBe(
      "VALIDATED",
    );
  });

  it("matched value (claim.value === ledger value) → VALIDATED", () => {
    // The licensed happy path: the rendered value equals its evidence value.
    const claim = readClaim({
      value: "aberto",
      valueBinding: { key: "k" },
    });
    expect(
      claimAllowed(claim, ledgerWith(entry({ value: "aberto" })), deps()),
    ).toBe("VALIDATED");
  });

  it("mismatched value (model-authored surplus) → NOT VALIDATED (REFUSED)", () => {
    // THE round-2 (a-value) catch: every other §5 conjunct passes
    // (present∧fresh∧owned∧integrity∧provenance), but the rendered value is a
    // confabulation that contradicts its licensing evidence → over-claim → REFUSED.
    // If C6 were removed this would VALIDATE the surplus value (the bug).
    const claim = readClaim({
      value: "aberto", // model says open…
      valueBinding: { key: "k" },
    });
    const verdict = claimAllowed(
      claim,
      ledgerWith(entry({ value: "fechado" })), // …evidence says closed.
      deps(),
    );
    expect(verdict).toBe("REFUSED");
    expect(verdict).not.toBe("VALIDATED");
  });

  it("mismatch DOMINATES (REFUSED even when another evidence is UNKNOWN)", () => {
    // A C6 REFUSED is a contradiction class — it must dominate an UNKNOWN, like
    // every other REFUSED conjunct.
    const claim = readClaim({
      requiredEvidence: [req({ key: "k" }), req({ key: "missing" })],
      value: 10,
      valueBinding: { key: "k" },
    });
    // "missing" is absent → that evidence is UNKNOWN; the C6 mismatch must still
    // drive the whole claim to REFUSED.
    expect(
      claimAllowed(claim, ledgerWith(entry({ key: "k", value: 99 })), deps()),
    ).toBe("REFUSED");
  });

  it("path projection: bind a single PROPOSITION field of a value object", () => {
    // STORE_OPEN_NOW-shaped: claim.value = { open: true } bound to the schedule
    // entry's { open: true } via path ["open"].
    const claim = readClaim({
      value: { open: true },
      valueBinding: { key: "k", path: ["open"] },
    });
    expect(
      claimAllowed(claim, ledgerWith(entry({ value: { open: true } })), deps()),
    ).toBe("VALIDATED");
    // And the projected-field mismatch is caught.
    expect(
      claimAllowed(
        { ...claim, value: { open: true } },
        ledgerWith(entry({ value: { open: false } })),
        deps(),
      ),
    ).toBe("REFUSED");
  });

  it("value OUTSIDE the closed scalar grammar → abstain (UNKNOWN), not VALIDATE", () => {
    // A non-scalar rendered value (an object) is not a single proposition we can
    // confidently equate → C6 abstains to UNKNOWN (honest ignorance), never a free
    // VALIDATE and never a REFUSE. (Whole-value object compare is OUT of grammar.)
    const claim = readClaim({
      value: { a: 1 },
      valueBinding: { key: "k" },
    });
    expect(
      claimAllowed(claim, ledgerWith(entry({ value: { a: 1 } })), deps()),
    ).toBe("UNKNOWN");
  });

  it("missed projection path → abstain (UNKNOWN), never a free pass", () => {
    // The path points at a field that does not exist → projected side is undefined
    // → outside the grammar → abstain.
    const claim = readClaim({
      value: { open: true },
      valueBinding: { key: "k", path: ["nope"] },
    });
    expect(
      claimAllowed(claim, ledgerWith(entry({ value: { open: true } })), deps()),
    ).toBe("UNKNOWN");
  });

  it("bound key not present → abstain (UNKNOWN), never REFUSE on a missing value", () => {
    // If the bound key resolved absent, the ∀ already drove the claim to UNKNOWN;
    // C6 must not upgrade that to REFUSED on a value it cannot read.
    const claim = readClaim({
      requiredEvidence: [req({ key: "k" })],
      value: "x",
      valueBinding: { key: "k" },
    });
    // Ledger has NO entry for "k".
    expect(claimAllowed(claim, ledgerWith(), deps())).toBe("UNKNOWN");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC10 — kernel purity: no downstream import (§R)
// ─────────────────────────────────────────────────────────────────────────

describe("soundness.ts — kernel purity (§R; AC10)", () => {
  it("imports NOTHING from a downstream package (claustrum/ibatexas)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      resolvePath(here, "../src/claims/soundness.ts"),
      "utf8",
    );
    // The dependency chain is adjudicate → claustrum → ibatexas, never backward.
    expect(src).not.toMatch(/from\s+["'][^"']*claustrum/);
    expect(src).not.toMatch(/from\s+["'][^"']*ibatexas/);
    // And it is pure: no Date.now()/Math.random()/IO clock inside the predicate
    // (now is injected via deps). The test file itself may use node:fs; the
    // SOURCE must not.
    expect(src).not.toMatch(/Date\.now\(/);
    expect(src).not.toMatch(/Math\.random\(/);
  });

  it("a SourceIntegrity type value is usable (Q1 type surface intact)", () => {
    // Touches the imported SourceIntegrity type so the import is load-bearing.
    const floor: SourceIntegrity = "structured";
    expect(typeof floor).toBe("string");
  });
});
