/**
 * Q1 — EvidenceRequirement schema + validator + source-integrity ordering
 * (SDD §E; v1.1 §5).
 *
 * Proves: the exact field/type schema (AC3); cacheable-requires-ttl reject AND
 * accept (AC4 — the §R hard compile error); the low→high source-integrity order
 * incl. the `structured ≈ first_party_verified` tie (AC5).
 */

import { describe, expect, it } from "vitest";
import {
  isValidEvidenceRequirement,
  isValidFreshnessPolicy,
  meetsSourceIntegrityFloor,
  parseEvidenceRequirement,
  sourceIntegrityRank,
  type EvidenceRequirement,
  type FreshnessPolicy,
  type SourceIntegrity,
} from "@adjudicate/core";

// A canonical valid requirement (a worked safety type from SDD §E:
// PAYMENT_STATUS — required / must_read_this_turn / first_party_verified /
// first_party_only).
const PAYMENT_STATUS_REQ: EvidenceRequirement = {
  key: "payment.status",
  ownershipPolicy: "required",
  freshnessPolicy: "must_read_this_turn",
  sourceIntegrity: "first_party_verified",
  provenancePolicy: "first_party_only",
};

describe("EvidenceRequirement schema — exact §E fields/types (AC3)", () => {
  it("accepts a fully-valid requirement across all four axes", () => {
    expect(isValidEvidenceRequirement(PAYMENT_STATUS_REQ)).toBe(true);
    expect(parseEvidenceRequirement(PAYMENT_STATUS_REQ)).toEqual(
      PAYMENT_STATUS_REQ,
    );
  });

  it("accepts each ownershipPolicy member and rejects others", () => {
    for (const ownershipPolicy of ["required", "not_applicable"] as const) {
      expect(
        isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, ownershipPolicy }),
      ).toBe(true);
    }
    expect(
      isValidEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        ownershipPolicy: "optional",
      }),
    ).toBe(false);
  });

  it("accepts each sourceIntegrity member and rejects others", () => {
    const tiers: SourceIntegrity[] = [
      "structured",
      "trusted_service",
      "first_party_verified",
      "human_report",
      "free_text",
    ];
    for (const sourceIntegrity of tiers) {
      expect(
        isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, sourceIntegrity }),
      ).toBe(true);
    }
    expect(
      isValidEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        sourceIntegrity: "verified",
      }),
    ).toBe(false);
  });

  it("accepts each provenancePolicy member and rejects others", () => {
    for (const provenancePolicy of ["preserve", "first_party_only"] as const) {
      expect(
        isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, provenancePolicy }),
      ).toBe(true);
    }
    expect(
      isValidEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        provenancePolicy: "any",
      }),
    ).toBe(false);
  });

  it("rejects a non-string key and non-object inputs", () => {
    expect(
      isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, key: 42 }),
    ).toBe(false);
    for (const notObject of [null, undefined, "str", 7, [], true]) {
      expect(isValidEvidenceRequirement(notObject)).toBe(false);
    }
  });
});

describe("freshnessPolicy — the four tiers (AC3)", () => {
  it("accepts the three bare-string tiers", () => {
    for (const freshnessPolicy of [
      "static",
      "must_read_this_turn",
      "action_outcome",
    ] as const) {
      expect(isValidFreshnessPolicy(freshnessPolicy)).toBe(true);
      expect(
        isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, freshnessPolicy }),
      ).toBe(true);
    }
  });

  it("rejects an unknown bare-string freshness tier", () => {
    expect(isValidFreshnessPolicy("eventually")).toBe(false);
  });
});

describe("cacheable MUST carry its ttl — §E / v1.1 §5 (AC4, §R hard error)", () => {
  // ── REJECT: a bare cacheable leaves fresh(e) unenforceable ──
  it("REJECTS the bare string 'cacheable' (no ttl)", () => {
    expect(isValidFreshnessPolicy("cacheable")).toBe(false);
    expect(
      isValidEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        freshnessPolicy: "cacheable",
      }),
    ).toBe(false);
  });

  it("REJECTS { kind: 'cacheable' } with no ttl", () => {
    expect(isValidFreshnessPolicy({ kind: "cacheable" })).toBe(false);
    expect(
      isValidEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        freshnessPolicy: { kind: "cacheable" },
      }),
    ).toBe(false);
  });

  it("REJECTS a cacheable with a non-number/non-'reindex_bound' ttl", () => {
    expect(isValidFreshnessPolicy({ kind: "cacheable", ttl: "soon" })).toBe(false);
    expect(isValidFreshnessPolicy({ kind: "cacheable", ttl: null })).toBe(false);
    // a non-finite ttl (NaN/Infinity) cannot bound fresh(e) — rejected.
    expect(isValidFreshnessPolicy({ kind: "cacheable", ttl: NaN })).toBe(false);
    expect(
      isValidFreshnessPolicy({ kind: "cacheable", ttl: Infinity }),
    ).toBe(false);
  });

  it("parseEvidenceRequirement THROWS on a bare cacheable, naming the rule", () => {
    expect(() =>
      parseEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        freshnessPolicy: { kind: "cacheable" },
      }),
    ).toThrowError(/cacheable.*MUST carry its `ttl`/);
    expect(() =>
      parseEvidenceRequirement({
        ...PAYMENT_STATUS_REQ,
        freshnessPolicy: "cacheable",
      }),
    ).toThrowError(/cacheable/);
  });

  // ── ACCEPT: cacheable WITH a ttl ──
  it("ACCEPTS { kind: 'cacheable', ttl: 30 } (finite seconds window)", () => {
    const freshnessPolicy: FreshnessPolicy = { kind: "cacheable", ttl: 30 };
    expect(isValidFreshnessPolicy(freshnessPolicy)).toBe(true);
    const req = { ...PAYMENT_STATUS_REQ, freshnessPolicy };
    expect(isValidEvidenceRequirement(req)).toBe(true);
    expect(parseEvidenceRequirement(req)).toEqual(req);
  });

  it("ACCEPTS { kind: 'cacheable', ttl: 'reindex_bound' }", () => {
    const freshnessPolicy: FreshnessPolicy = {
      kind: "cacheable",
      ttl: "reindex_bound",
    };
    expect(isValidFreshnessPolicy(freshnessPolicy)).toBe(true);
    expect(
      isValidEvidenceRequirement({ ...PAYMENT_STATUS_REQ, freshnessPolicy }),
    ).toBe(true);
  });
});

describe("source-integrity ordering low→high incl. the tie (AC5, §E)", () => {
  it("encodes free_text < human_report < trusted_service < structured", () => {
    expect(sourceIntegrityRank("free_text")).toBeLessThan(
      sourceIntegrityRank("human_report"),
    );
    expect(sourceIntegrityRank("human_report")).toBeLessThan(
      sourceIntegrityRank("trusted_service"),
    );
    expect(sourceIntegrityRank("trusted_service")).toBeLessThan(
      sourceIntegrityRank("structured"),
    );
  });

  it("structured ≈ first_party_verified — SHARE the top rank (the tie)", () => {
    expect(sourceIntegrityRank("structured")).toBe(
      sourceIntegrityRank("first_party_verified"),
    );
    // Both are the maximum.
    const all: SourceIntegrity[] = [
      "free_text",
      "human_report",
      "trusted_service",
      "structured",
      "first_party_verified",
    ];
    const max = Math.max(...all.map(sourceIntegrityRank));
    expect(sourceIntegrityRank("structured")).toBe(max);
    expect(sourceIntegrityRank("first_party_verified")).toBe(max);
  });

  it("ranks the full chain monotonically (sorted == spec low→high order)", () => {
    // free_text(0) < human_report(1) < trusted_service(2) < {structured,
    // first_party_verified}(3). Sorting by rank reproduces the spec order
    // (the two top-tier members tie, so either order among them is valid).
    const ranked: Array<[SourceIntegrity, number]> = (
      [
        "structured",
        "first_party_verified",
        "trusted_service",
        "human_report",
        "free_text",
      ] as SourceIntegrity[]
    )
      .map((s): [SourceIntegrity, number] => [s, sourceIntegrityRank(s)])
      .sort((a, b) => a[1] - b[1]);
    expect(ranked.map((r) => r[1])).toEqual([0, 1, 2, 3, 3]);
    expect(ranked[0]![0]).toBe("free_text");
    expect(ranked[1]![0]).toBe("human_report");
    expect(ranked[2]![0]).toBe("trusted_service");
    // top two are the tie (order between them unspecified)
    expect(new Set([ranked[3]![0], ranked[4]![0]])).toEqual(
      new Set(["structured", "first_party_verified"]),
    );
  });

  it("meetsSourceIntegrityFloor — the C2 floor comparator (usable in Q3)", () => {
    // free_text fails every floor above it.
    expect(meetsSourceIntegrityFloor("free_text", "structured")).toBe(false);
    expect(meetsSourceIntegrityFloor("human_report", "trusted_service")).toBe(
      false,
    );
    // structured clears a trusted_service floor.
    expect(meetsSourceIntegrityFloor("structured", "trusted_service")).toBe(true);
    // The tie: each top-tier member clears a floor of the other (equal rank
    // satisfies >=).
    expect(
      meetsSourceIntegrityFloor("structured", "first_party_verified"),
    ).toBe(true);
    expect(
      meetsSourceIntegrityFloor("first_party_verified", "structured"),
    ).toBe(true);
    // reflexive
    expect(meetsSourceIntegrityFloor("trusted_service", "trusted_service")).toBe(
      true,
    );
  });
});
