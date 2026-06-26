/**
 * Q4 — the P2 set-level CONSISTENCY gate (SDD §C P2; §D; §J.5; §O#1; §O#5).
 *
 * Proves the four load-bearing rules:
 *   AC1  §D — only VALIDATED enter / runs-after-soundness: a non-validated
 *             member does not enter the set and does not suppress a valid
 *             same-subject claim.
 *   AC2  §D / v1.1 §4 — same-subject MUTUAL_EXCLUSION: both forced UNKNOWN/
 *             ESCALATE; NEVER renders both.
 *   AC3  §O#1 — un-modelled same-subject co-render → ESCALATE (default-deny).
 *   AC4  §O#5 / Inv 6 — the gate's OWN output is proposition-free: it contains
 *             NO domain value of the suppressed claim.
 *   AC5  COMPATIBLE same-subject declared pair → both render (no over-blocking).
 *   AC6  different-subject claims → no cross-subject constraint (independent).
 *   AC7  kernel purity — no downstream import (asserted structurally below).
 *   AC8  §C P2 / §D — same-(subject,type) value-aware gate: DIFFERENT values →
 *             both suppressed `SAME_TYPE_VALUE_CONFLICT` → ESCALATE (never render
 *             both); PROVABLY-equal values → idempotent dup, exactly ONE renders.
 *   AC9  the P2-gate SOURCE file is reviewable text — NO literal NUL byte (the
 *             pairKey separator is the `\x00` source escape, not a raw NUL).
 *
 * NON-VACUITY: AC2/AC3/AC4 each go RED when the guard is removed/inverted; this
 * is demonstrated by the orchestrator's transient-mutation check and recorded in
 * the self-check. The tests assert the SAFE outcome, so deleting the guard (e.g.
 * dropping default-deny, or leaking the value) flips them red. AC8 is non-vacuous
 * against restoring the old `if (claimA.type === claimB.type) continue;` — the
 * different-value case would then render BOTH (RED on `renderable` length and the
 * missing ESCALATE), and the equal-value case would render TWO not one (RED).
 */

import { describe, expect, it } from "vitest";
import {
  CONSISTENCY_RELATIONS,
  DEFAULT_CONSISTENCY_TABLE,
  SUPPRESSION_REASONS,
  checkConsistency,
  type ConsistencyClaim,
  type ConsistencyConstraint,
  type ConsistencyResult,
} from "@adjudicate/core";

// ─────────────────────────────────────────────────────────────────────────
// Fixtures — minimal VALIDATED-by-default claims; the suppressed VALUE is a
// distinctive sentinel so the §O#5 grep (AC4) is unambiguous.
// ─────────────────────────────────────────────────────────────────────────

const ORDER = "order-123";
const OTHER_ORDER = "order-999";

/** A distinctive domain value that MUST NOT appear in the gate's own output. */
const DELIVERED_VALUE = "DELIVERED_PROPOSITION_SENTINEL_xyz";
const ETA_VALUE = "ETA_45MIN_PROPOSITION_SENTINEL_xyz";

function claim(
  partial: Partial<ConsistencyClaim> & Pick<ConsistencyClaim, "type">,
): ConsistencyClaim {
  return {
    subject: ORDER,
    verdict: "VALIDATED",
    value: `value-of-${partial.type}`,
    ...partial,
  };
}

/** The canonical same-subject MUTUAL_EXCLUSION pair (delivered ⊥ has-ETA). */
function deliveredVsEta(subject = ORDER): readonly ConsistencyClaim[] {
  return [
    claim({
      subject,
      type: "ORDER_FULFILLMENT_STAGE",
      value: DELIVERED_VALUE,
    }),
    claim({
      subject,
      type: "ORDER_ESTIMATED_ARRIVAL",
      value: ETA_VALUE,
    }),
  ];
}

/** Recursively collect every string leaf of a value, for the §O#5 grep. */
function collectStrings(value: unknown, sink: string[]): void {
  if (typeof value === "string") {
    sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, sink);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, sink);
    }
  }
}

/** The full serialized + string-leaf surface of the gate output, for grep. */
function outputSurface(result: ConsistencyResult): {
  json: string;
  leaves: string[];
} {
  const leaves: string[] = [];
  collectStrings(result, leaves);
  return { json: JSON.stringify(result), leaves };
}

// ─────────────────────────────────────────────────────────────────────────
// AC1 — §D: only VALIDATED enter / runs after soundness
// ─────────────────────────────────────────────────────────────────────────

describe("AC1 — §D only-VALIDATED enter (runs after soundness)", () => {
  it("a VALIDATED lone claim renders; a non-validated peer does NOT suppress it", () => {
    // Same subject: one VALIDATED stage claim + an UNKNOWN ETA claim. If the
    // UNKNOWN member wrongly ENTERED the P2 set, it would form the delivered⊥ETA
    // exclusion pair and suppress the valid stage claim. §D forbids that: the
    // UNKNOWN member must never enter or suppress the set.
    const result = checkConsistency([
      claim({ type: "ORDER_FULFILLMENT_STAGE", value: DELIVERED_VALUE }),
      claim({ type: "ORDER_ESTIMATED_ARRIVAL", verdict: "UNKNOWN" }),
    ]);

    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
    expect(result.renderable).toHaveLength(1);
    expect(result.renderable[0].type).toBe("ORDER_FULFILLMENT_STAGE");
  });

  it("a REFUSED member never enters the renderable set", () => {
    const result = checkConsistency([
      claim({ type: "ORDER_FULFILLMENT_STAGE", value: DELIVERED_VALUE }),
      claim({ type: "ORDER_ESTIMATED_ARRIVAL", verdict: "REFUSED" }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderable.map((c) => c.verdict)).toEqual(["VALIDATED"]);
    expect(result.renderable.every((c) => c.verdict === "VALIDATED")).toBe(true);
  });

  it("an all-non-validated input renders nothing and does NOT escalate", () => {
    // No VALIDATED member ⟹ no pair ⟹ nothing to suppress ⟹ RENDER of the
    // empty set. (A non-validated member never manufactures a conflict.)
    const result = checkConsistency([
      claim({ type: "ORDER_FULFILLMENT_STAGE", verdict: "UNKNOWN" }),
      claim({ type: "ORDER_ESTIMATED_ARRIVAL", verdict: "REFUSED" }),
    ]);
    expect(result.renderable).toHaveLength(0);
    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC2 — §D / v1.1 §4: same-subject MUTUAL_EXCLUSION → never render both
// ─────────────────────────────────────────────────────────────────────────

describe("AC2 — same-subject MUTUAL_EXCLUSION (delivered ⊥ ETA)", () => {
  it("forces BOTH conflicting members out and NEVER renders both", () => {
    const result = checkConsistency(deliveredVsEta());

    // Never render both — the renderable set contains NEITHER conflicting member.
    expect(result.renderable).toHaveLength(0);
    expect(
      result.renderable.some((c) => c.type === "ORDER_FULFILLMENT_STAGE"),
    ).toBe(false);
    expect(
      result.renderable.some((c) => c.type === "ORDER_ESTIMATED_ARRIVAL"),
    ).toBe(false);

    // Turn terminal is the safe ESCALATE (a first-class terminal); two
    // suppression records, one per conflicting member.
    expect(result.terminal).toBe("ESCALATE");
    expect(result.suppressions).toHaveLength(2);
    for (const rec of result.suppressions) {
      expect(rec.reason).toBe("MUTUAL_EXCLUSION_CONFLICT");
      expect(rec.terminal).toBe("ESCALATE");
      expect(rec.subject).toBe(ORDER);
      expect([...rec.conflictTypes].sort()).toEqual([
        "ORDER_ESTIMATED_ARRIVAL",
        "ORDER_FULFILLMENT_STAGE",
      ]);
    }
  });

  it("the conflict is reported under the SAME subject only", () => {
    const result = checkConsistency(deliveredVsEta());
    expect(new Set(result.suppressions.map((r) => r.subject))).toEqual(
      new Set([ORDER]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC3 — §O#1: un-modelled same-subject co-render → ESCALATE (default-deny)
// ─────────────────────────────────────────────────────────────────────────

describe("AC3 — §O#1 un-modelled same-subject co-render → ESCALATE", () => {
  it("a same-subject pair with NO declared relation defaults to ESCALATE", () => {
    // Two real, distinct types with NO entry in DEFAULT_CONSISTENCY_TABLE on the
    // same subject. §O#1: default-deny → ESCALATE, never a silent render.
    const result = checkConsistency([
      claim({ type: "UNMODELLED_TYPE_A" }),
      claim({ type: "UNMODELLED_TYPE_B" }),
    ]);

    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(0); // never silently renders.
    expect(result.suppressions).toHaveLength(2);
    for (const rec of result.suppressions) {
      expect(rec.reason).toBe("UNMODELLED_SAME_SUBJECT");
      expect(rec.terminal).toBe("ESCALATE");
    }
  });

  it("default-deny is NOT triggered for a single lone un-modelled claim", () => {
    // A lone claim has no co-render pair, so §O#1 (which is about a PAIR) does
    // not fire — the gate constrains co-renders, not isolated claims.
    const result = checkConsistency([claim({ type: "UNMODELLED_TYPE_A" })]);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderable).toHaveLength(1);
    expect(result.suppressions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC4 — §O#5 / Inv 6: the gate's OWN output is PROPOSITION-FREE
// ─────────────────────────────────────────────────────────────────────────

describe("AC4 — §O#5 proposition-free gate output (no re-leak)", () => {
  it("the ESCALATE output contains NO suppressed domain value (exclusion)", () => {
    const result = checkConsistency(deliveredVsEta());
    const { json, leaves } = outputSurface(result);

    // The suppressed propositions' VALUES must be ABSENT from the gate's own
    // output — neither in the JSON nor as any string leaf. The output carries
    // ONLY terminal + types + reason code (Inv 6: must not re-leak what it just
    // suppressed).
    expect(json).not.toContain(DELIVERED_VALUE);
    expect(json).not.toContain(ETA_VALUE);
    expect(leaves).not.toContain(DELIVERED_VALUE);
    expect(leaves).not.toContain(ETA_VALUE);

    // Positively: each suppression record carries exactly the non-propositional
    // fields and NOTHING that could hold a value (no `value`/`message`/`prose`).
    for (const rec of result.suppressions) {
      expect(Object.keys(rec).sort()).toEqual([
        "conflictTypes",
        "reason",
        "subject",
        "terminal",
      ]);
      expect(rec).not.toHaveProperty("value");
      expect(rec).not.toHaveProperty("message");
    }
  });

  it("the ESCALATE output contains NO suppressed domain value (un-modelled)", () => {
    const SENTINEL_A = "UNMODELLED_VALUE_A_SENTINEL_qrs";
    const SENTINEL_B = "UNMODELLED_VALUE_B_SENTINEL_qrs";
    const result = checkConsistency([
      claim({ type: "UNMODELLED_TYPE_A", value: SENTINEL_A }),
      claim({ type: "UNMODELLED_TYPE_B", value: SENTINEL_B }),
    ]);
    const { json, leaves } = outputSurface(result);

    expect(json).not.toContain(SENTINEL_A);
    expect(json).not.toContain(SENTINEL_B);
    expect(leaves).not.toContain(SENTINEL_A);
    expect(leaves).not.toContain(SENTINEL_B);
  });

  it("a non-string suppressed value is also never re-leaked", () => {
    // The value can be any domain object; none of its content may surface.
    const objValue = { received: false, secretField: "LEAK_ME_NOT_obj" };
    const result = checkConsistency([
      claim({ type: "ORDER_FULFILLMENT_STAGE", value: objValue }),
      claim({ type: "ORDER_ESTIMATED_ARRIVAL", value: 4500 }),
    ]);
    const { json } = outputSurface(result);
    expect(json).not.toContain("LEAK_ME_NOT_obj");
    expect(json).not.toContain("4500");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC5 — COMPATIBLE / IMPLICATION declared pair → both render (no over-block)
// ─────────────────────────────────────────────────────────────────────────

describe("AC5 — declared COMPATIBLE/IMPLICATION pair renders both", () => {
  it("a COMPATIBLE same-subject pair renders BOTH members", () => {
    const result = checkConsistency([
      claim({ type: "ORDER_FULFILLMENT_STAGE" }),
      claim({ type: "ORDER_MODIFIABLE" }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
    expect(new Set(result.renderable.map((c) => c.type))).toEqual(
      new Set(["ORDER_FULFILLMENT_STAGE", "ORDER_MODIFIABLE"]),
    );
  });

  it("an IMPLICATION same-subject pair renders BOTH members", () => {
    const result = checkConsistency([
      claim({ type: "PURCHASE_COMPLETED" }),
      claim({ type: "PAYMENT_SETTLED" }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderable).toHaveLength(2);
  });

  it("the declared relation matches regardless of declaration order", () => {
    // The table declares {FULFILLMENT, MODIFIABLE} COMPATIBLE; supplying the
    // members in the OPPOSITE order still resolves COMPATIBLE (unordered pair).
    const result = checkConsistency([
      claim({ type: "ORDER_MODIFIABLE" }),
      claim({ type: "ORDER_FULFILLMENT_STAGE" }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderable).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC6 — different-subject claims do NOT constrain each other
// ─────────────────────────────────────────────────────────────────────────

describe("AC6 — different-subject independence", () => {
  it("delivered on order-A and ETA on order-B both render (no cross-subject)", () => {
    // The SAME exclusion-typed pair, but on DIFFERENT subjects. Consistency is a
    // same-subject property: these do not constrain each other → both render.
    const result = checkConsistency([
      claim({
        subject: ORDER,
        type: "ORDER_FULFILLMENT_STAGE",
        value: DELIVERED_VALUE,
      }),
      claim({
        subject: OTHER_ORDER,
        type: "ORDER_ESTIMATED_ARRIVAL",
        value: ETA_VALUE,
      }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
    expect(result.renderable).toHaveLength(2);
  });

  it("a same-subject conflict suppresses ONLY that subject's members", () => {
    // order-123 has the delivered⊥ETA conflict; order-999 has a lone, clean
    // claim. Only order-123's members are suppressed; order-999 still renders.
    const result = checkConsistency([
      ...deliveredVsEta(ORDER),
      claim({ subject: OTHER_ORDER, type: "ORDER_FULFILLMENT_STAGE" }),
    ]);
    expect(result.terminal).toBe("ESCALATE"); // a conflict occurred somewhere.
    expect(result.renderable).toHaveLength(1);
    expect(result.renderable[0].subject).toBe(OTHER_ORDER);
    expect(result.suppressions.every((r) => r.subject === ORDER)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC7 — kernel purity + structural contract
// ─────────────────────────────────────────────────────────────────────────

describe("AC7 — kernel purity + structural contract", () => {
  it("imports ONLY from @adjudicate/core (no downstream import)", () => {
    // The source file must never import claustrum/ibatexas (SDD §R: the chain is
    // adjudicate → claustrum → ibatexas, never backward). This greps the source.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/claims/consistency.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@adjudicate\/claustrum/);
    expect(src).not.toMatch(/from\s+["']@adjudicate\/ibatexas/);
    expect(src).not.toMatch(/from\s+["']claustrum/);
    expect(src).not.toMatch(/from\s+["']ibatexas/);
  });

  it("the relation + reason vocabularies are exactly the declared closed sets", () => {
    expect(CONSISTENCY_RELATIONS).toEqual([
      "MUTUAL_EXCLUSION",
      "IMPLICATION",
      "COMPATIBLE",
    ]);
    expect(SUPPRESSION_REASONS).toEqual([
      "MUTUAL_EXCLUSION_CONFLICT",
      "SAME_TYPE_VALUE_CONFLICT",
      "UNMODELLED_SAME_SUBJECT",
    ]);
  });

  it("the default table declares the canonical delivered⊥ETA exclusion", () => {
    const hasExclusion = DEFAULT_CONSISTENCY_TABLE.some(
      (c: ConsistencyConstraint) =>
        c.relation === "MUTUAL_EXCLUSION" &&
        [c.typeA, c.typeB].sort().join() ===
          ["ORDER_ESTIMATED_ARRIVAL", "ORDER_FULFILLMENT_STAGE"].sort().join(),
    );
    expect(hasExclusion).toBe(true);
  });

  it("is pure: same input ⟹ same output (no hidden state)", () => {
    const input = deliveredVsEta();
    const a = checkConsistency(input);
    const b = checkConsistency(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("a duplicate-pair table with conflicting relations throws at build", () => {
    // Table integrity: a pair must have ONE declared relation. A contradictory
    // table is an authoring error surfaced eagerly, not silently resolved.
    expect(() =>
      checkConsistency([claim({ type: "X" }), claim({ type: "Y" })], {
        table: [
          { typeA: "X", typeB: "Y", relation: "COMPATIBLE" },
          { typeA: "Y", typeB: "X", relation: "MUTUAL_EXCLUSION" },
        ],
      }),
    ).toThrow(/conflict/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC8 — §C P2 / §D: same-(subject,type) value-aware idempotency vs conflict
// ─────────────────────────────────────────────────────────────────────────

describe("AC8 — same-(subject,type) value-aware gate (idempotent dup vs conflict)", () => {
  const SAME_TYPE = "ORDER_FULFILLMENT_STAGE";

  it("DIFFERENT values for one (subject,type) → BOTH suppressed, NEVER render both", () => {
    // Two VALIDATED claims of ONE type on ONE subject with CONTRADICTORY values.
    // Each is individually sound (P1), but their conjunction is a self-
    // contradiction. §C P2 / §D: never render both — suppress BOTH → ESCALATE.
    // NON-VACUOUS: restore `if (type === type) continue` and both would render.
    const A = "STAGE_VALUE_A_PROPOSITION_SENTINEL_klm";
    const B = "STAGE_VALUE_B_PROPOSITION_SENTINEL_klm";
    const result = checkConsistency([
      claim({ type: SAME_TYPE, value: A }),
      claim({ type: SAME_TYPE, value: B }),
    ]);

    expect(result.renderable).toHaveLength(0);
    expect(result.terminal).toBe("ESCALATE");
    expect(result.suppressions).toHaveLength(2);
    for (const rec of result.suppressions) {
      expect(rec.reason).toBe("SAME_TYPE_VALUE_CONFLICT");
      expect(rec.terminal).toBe("ESCALATE");
      expect(rec.subject).toBe(ORDER);
      // The conflict names the single type-in-conflict — non-propositional.
      expect(rec.conflictTypes).toEqual([SAME_TYPE]);
    }

    // §O#5 / Inv 6: the contradictory VALUES must NOT leak into the gate output.
    const { json, leaves } = outputSurface(result);
    expect(json).not.toContain(A);
    expect(json).not.toContain(B);
    expect(leaves).not.toContain(A);
    expect(leaves).not.toContain(B);
  });

  it("EQUAL values for one (subject,type) → idempotent dup: exactly ONE renders, no suppression", () => {
    // A provably-equal duplicate read is consistent: render exactly ONE, no
    // suppression record, terminal RENDER.
    // NON-VACUOUS: restore `continue` and TWO would render, not one.
    const V = "STAGE_VALUE_EQ_PROPOSITION_SENTINEL_klm";
    const result = checkConsistency([
      claim({ type: SAME_TYPE, value: V }),
      claim({ type: SAME_TYPE, value: V }),
    ]);

    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
    expect(result.renderable).toHaveLength(1);
    expect(result.renderable[0].type).toBe(SAME_TYPE);
    expect(result.renderable[0].value).toBe(V);
  });

  it("EQUAL structural (plain-object) values are also de-duplicated to ONE", () => {
    // Conservative equality recurses into plain objects/arrays.
    const v1 = { stage: "PREPARING", step: 2, tags: ["a", "b"] };
    const v2 = { stage: "PREPARING", step: 2, tags: ["a", "b"] };
    const result = checkConsistency([
      claim({ type: SAME_TYPE, value: v1 }),
      claim({ type: SAME_TYPE, value: v2 }),
    ]);
    expect(result.terminal).toBe("RENDER");
    expect(result.suppressions).toHaveLength(0);
    expect(result.renderable).toHaveLength(1);
  });

  it("NOT-provably-equal values (distinct exotics) FAIL SAFE to conflict, not dup", () => {
    // Two DISTINCT Date instances of the SAME millis: conservative equality
    // cannot prove them equal (own-key compare would falsely equate exotics), so
    // the gate must FAIL SAFE to a contradiction (ESCALATE) — never silently
    // de-dup one away as if a duplicate.
    const result = checkConsistency([
      claim({ type: SAME_TYPE, value: new Date(0) }),
      claim({ type: SAME_TYPE, value: new Date(0) }),
    ]);
    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(0);
    expect(result.suppressions).toHaveLength(2);
    expect(
      result.suppressions.every((r) => r.reason === "SAME_TYPE_VALUE_CONFLICT"),
    ).toBe(true);
  });

  it("a same-type conflict is independent of a different subject's clean claim", () => {
    // order-123 has the same-type value conflict; order-999 has a lone clean
    // claim of the same type → only order-123's members are suppressed.
    const result = checkConsistency([
      claim({ subject: ORDER, type: SAME_TYPE, value: "X_sentinel_pqr" }),
      claim({ subject: ORDER, type: SAME_TYPE, value: "Y_sentinel_pqr" }),
      claim({ subject: OTHER_ORDER, type: SAME_TYPE, value: "Z_sentinel_pqr" }),
    ]);
    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(1);
    expect(result.renderable[0].subject).toBe(OTHER_ORDER);
    expect(result.suppressions.every((r) => r.subject === ORDER)).toBe(true);
  });

  it("SAME_TYPE_VALUE_CONFLICT is a member of the closed SuppressionReason set", () => {
    // AC(c): the new reason is in the closed vocabulary (union + array).
    expect(SUPPRESSION_REASONS).toContain("SAME_TYPE_VALUE_CONFLICT");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC9 — the P2-gate SOURCE file is reviewable text (no literal NUL byte)
// ─────────────────────────────────────────────────────────────────────────

describe("AC9 — consistency.ts is reviewable text (no literal NUL byte)", () => {
  it("contains NO raw NUL byte; the pairKey separator is the `\\x00` source escape", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/claims/consistency.ts"),
      "utf8",
    );
    // No raw NUL anywhere — the file is grep-able / prettier-safe review text.
    expect(src.includes("\u0000")).toBe(false);
    // The separator is written as the printable escape instead (runtime-identical).
    expect(src).toContain("\\x00");
  });
});
