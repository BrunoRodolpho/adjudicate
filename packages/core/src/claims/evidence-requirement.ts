/**
 * EvidenceRequirement — the per-type evidence schema the §5 soundness predicate
 * quantifies over (SDD §E; v1.1 §5; registry v0.2). One `EvidenceRequirement`
 * declares, for a single piece of evidence a claim depends on, how that evidence
 * must be owned, kept fresh, sourced, and provenance-checked.
 *
 * This module is TYPES + a runtime VALIDATOR + the source-integrity ordering. It
 * does NOT implement `CLAIM_ALLOWED` (that is the soundness validator, a separate
 * kernel deliverable — SDD §Q.3); it provides the schema those conjuncts read.
 *
 * Transcribed VERBATIM from SDD §E / v1.1 §5 — values are not re-derived,
 * rounded, or paraphrased (SDD zero-drift contract; §P misreadings refused).
 * Pure & self-contained — no kernel-downstream import (SDD §R kernel purity).
 */

// ─────────────────────────────────────────────────────────────────────────
// The four policy axes — SDD §E / v1.1 §5, verbatim closed unions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ownership policy for one evidence requirement (SDD §E C1).
 *
 *   - `"required"`       — `owns(actor, e.resource)` MUST hold to validate
 *                          (ownership is a VALIDATION predicate, not read-auth).
 *   - `"not_applicable"` — public/ownerless evidence; ownership is not gated.
 *
 * NOTE (SDD §E C0): a requirement set in which EVERY member is
 * `not_applicable` does not on its own auto-VALIDATE a claim — non-emptiness
 * (C0) is a separate, claim-level conjunct of the soundness predicate, not a
 * property of this field. This module validates the SHAPE of one requirement.
 */
export type OwnershipPolicy = "required" | "not_applicable";

/**
 * The `cacheable` freshness tier (SDD §E / v1.1 §5). It MUST carry its `ttl`:
 * a bare `cacheable` "leaves fresh(e) unenforceable" (SDD §E; v1.1 §5) because
 * `fresh(e)` needs the per-type window (e.g. STORE_OPEN_NOW 30s vs STORE_HOURS
 * 1h vs MENU_ITEM_PRICE reindex-bound).
 *
 *   - `ttl: number`            — a finite staleness window (seconds, per registry).
 *   - `ttl: "reindex_bound"`   — staleness floored by reindex lag, not a TTL
 *                                clock (e.g. MENU_ITEM_PRICE — registry §6).
 */
export interface CacheableFreshness {
  readonly kind: "cacheable";
  readonly ttl: number | "reindex_bound";
}

/**
 * Freshness policy for one evidence requirement (SDD §E / v1.1 §5), verbatim:
 *
 *   "static" | { kind: "cacheable"; ttl: number | "reindex_bound" }
 *            | "must_read_this_turn" | "action_outcome"
 *
 *   - `"static"`              — never goes stale (e.g. allergens).
 *   - `CacheableFreshness`    — cacheable WITH a mandatory ttl (see above).
 *   - `"must_read_this_turn"` — live state; never cached, never from model memory
 *                               (requires Ledger `sourceMode == "live"` — §G).
 *   - `"action_outcome"`      — evidence = this turn's Action verdict + dispatch,
 *                               not a read (registry §3).
 */
export type FreshnessPolicy =
  | "static"
  | CacheableFreshness
  | "must_read_this_turn"
  | "action_outcome";

/**
 * Source-integrity tier for one evidence requirement (SDD §E / v1.1 §5),
 * verbatim. Classifies the channel SHAPE of the evidence (a claim declares a
 * `minSourceIntegrity` FLOOR that this must clear — SDD §E C2):
 *
 *   "structured" | "trusted_service" | "first_party_verified"
 *                | "human_report" | "free_text"
 *
 * Ordering is encoded by `sourceIntegrityRank` below.
 */
export type SourceIntegrity =
  | "structured"
  | "trusted_service"
  | "first_party_verified"
  | "human_report"
  | "free_text";

/**
 * Provenance policy for one evidence requirement (SDD §E C3 / v1.1 §5):
 *
 *   - `"preserve"`         — provenance survives persistence; an UNTRUSTED-origin
 *                            row stays UNTRUSTED and may never be a validating
 *                            value (SDD §J.3).
 *   - `"first_party_only"` — only first-party-origin evidence validates (e.g.
 *                            payment owner-attribution — SDD §E worked types).
 */
export type ProvenancePolicy = "preserve" | "first_party_only";

/**
 * EvidenceRequirement (SDD §E / v1.1 §5; registry v0.2) — EXACTLY these fields,
 * transcribed verbatim. The §5 predicate's `∀ e ∈ c.requiredEvidence` quantifies
 * over a set of these; each conjunct (C1 ownership, fresh, C2 integrity, C3
 * provenance) reads one field here.
 */
export interface EvidenceRequirement {
  readonly key: string;
  readonly ownershipPolicy: OwnershipPolicy;
  readonly freshnessPolicy: FreshnessPolicy;
  readonly sourceIntegrity: SourceIntegrity;
  readonly provenancePolicy: ProvenancePolicy;
}

// ─────────────────────────────────────────────────────────────────────────
// Source-integrity ordering — SDD §E / v1.1 §5
// ─────────────────────────────────────────────────────────────────────────
//
// Order (low→high), verbatim from SDD §E / v1.1 §5:
//
//   free_text < human_report < trusted_service < structured ≈ first_party_verified
//
// `structured` and `first_party_verified` SHARE the top rank (the `≈` tie): both
// are the strongest channel shape, so neither out-ranks the other. A claim's
// `minSourceIntegrity` floor (C2) is later checked as `rank(e) >= rank(floor)`
// (the Q3 comparator); ranks are an internal lattice index only — never on the
// wire, never an `EvidenceRequirement` field.

const SOURCE_INTEGRITY_RANK: Readonly<Record<SourceIntegrity, number>> = {
  free_text: 0,
  human_report: 1,
  trusted_service: 2,
  // The `≈` tie: structured and first_party_verified are co-equal at the top.
  structured: 3,
  first_party_verified: 3,
};

/**
 * The rank of a `SourceIntegrity` tier on the low→high ordering (SDD §E):
 * `free_text(0) < human_report(1) < trusted_service(2) < structured(3) ≈
 * first_party_verified(3)`. Higher == higher integrity. `structured` and
 * `first_party_verified` return the SAME rank (the `≈` tie). Pure & total.
 */
export function sourceIntegrityRank(level: SourceIntegrity): number {
  return SOURCE_INTEGRITY_RANK[level];
}

/**
 * Floor comparator (C2): `true` iff `level` meets-or-exceeds the `floor` tier on
 * the source-integrity ordering (`rank(level) >= rank(floor)`). Usable as the
 * later `sourceIntegrity(e) >= c.minSourceIntegrity` check (SDD §E C2 / Q3).
 *
 * The `structured ≈ first_party_verified` tie means each clears a floor of the
 * other (equal rank satisfies `>=`). Pure & total.
 */
export function meetsSourceIntegrityFloor(
  level: SourceIntegrity,
  floor: SourceIntegrity,
): boolean {
  return sourceIntegrityRank(level) >= sourceIntegrityRank(floor);
}

// ─────────────────────────────────────────────────────────────────────────
// Runtime validator — SDD §E "cacheable MUST carry its ttl"; §R compile error
// ─────────────────────────────────────────────────────────────────────────

const OWNERSHIP_POLICIES: readonly OwnershipPolicy[] = [
  "required",
  "not_applicable",
] as const;

const SOURCE_INTEGRITIES: readonly SourceIntegrity[] = [
  "structured",
  "trusted_service",
  "first_party_verified",
  "human_report",
  "free_text",
] as const;

const PROVENANCE_POLICIES: readonly ProvenancePolicy[] = [
  "preserve",
  "first_party_only",
] as const;

const STRING_FRESHNESS_POLICIES: readonly Exclude<FreshnessPolicy, CacheableFreshness>[] = [
  "static",
  "must_read_this_turn",
  "action_outcome",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a `freshnessPolicy` value (SDD §E / v1.1 §5).
 *
 * **cacheable-requires-ttl (SDD §E; v1.1 §5; §R hard compile error):** a
 * `cacheable` policy MUST carry a `ttl` of `number | "reindex_bound"`. The bare
 * string `"cacheable"` is REJECTED (it is not a member of the union), and the
 * object form `{ kind: "cacheable" }` with no `ttl` is REJECTED — a bare
 * cacheable "leaves fresh(e) unenforceable." `{ kind: "cacheable", ttl: 30 }`
 * and `{ kind: "cacheable", ttl: "reindex_bound" }` are ACCEPTED.
 *
 * Pure: a deterministic predicate over the value. No clock/RNG/IO.
 */
export function isValidFreshnessPolicy(value: unknown): value is FreshnessPolicy {
  if (typeof value === "string") {
    // The bare string "cacheable" is intentionally NOT a member — cacheable
    // must be the object form carrying a ttl (SDD §E).
    return (STRING_FRESHNESS_POLICIES as readonly string[]).includes(value);
  }
  if (isRecord(value)) {
    if (value.kind !== "cacheable") return false;
    // cacheable-requires-ttl: the ttl must be present AND well-typed.
    const ttl = value.ttl;
    return (
      (typeof ttl === "number" && Number.isFinite(ttl)) || ttl === "reindex_bound"
    );
  }
  return false;
}

/**
 * Runtime predicate: is `value` a structurally-valid `EvidenceRequirement`
 * (SDD §E / v1.1 §5)? Checks every field against its closed union, and enforces
 * cacheable-requires-ttl via `isValidFreshnessPolicy`. Pure; no clock/RNG/IO.
 */
export function isValidEvidenceRequirement(
  value: unknown,
): value is EvidenceRequirement {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === "string" &&
    (OWNERSHIP_POLICIES as readonly string[]).includes(
      value.ownershipPolicy as string,
    ) &&
    isValidFreshnessPolicy(value.freshnessPolicy) &&
    (SOURCE_INTEGRITIES as readonly string[]).includes(
      value.sourceIntegrity as string,
    ) &&
    (PROVENANCE_POLICIES as readonly string[]).includes(
      value.provenancePolicy as string,
    )
  );
}

/**
 * Parse-or-throw an `EvidenceRequirement` (SDD §E / v1.1 §5). Returns the value
 * narrowed to `EvidenceRequirement` when valid; throws a descriptive `Error`
 * otherwise (fail-closed — an ill-formed requirement must never silently pass to
 * the soundness predicate). The thrown message names the cacheable-requires-ttl
 * rule specifically when that is the cause, so the §R compile error is legible.
 *
 * Pure: deterministic over the value; no clock/RNG/IO.
 */
export function parseEvidenceRequirement(value: unknown): EvidenceRequirement {
  if (isValidEvidenceRequirement(value)) return value;
  // Distinguish the cacheable-requires-ttl cause for a legible §R error.
  if (
    isRecord(value) &&
    (value as { freshnessPolicy?: unknown }).freshnessPolicy !== undefined &&
    !isValidFreshnessPolicy(
      (value as { freshnessPolicy?: unknown }).freshnessPolicy,
    )
  ) {
    throw new Error(
      "parseEvidenceRequirement: invalid freshnessPolicy — a `cacheable` policy " +
        'MUST carry its `ttl` (number | "reindex_bound"); a bare "cacheable" or ' +
        "`{ kind: 'cacheable' }` leaves fresh(e) unenforceable (SDD §E / v1.1 §5).",
    );
  }
  throw new Error(
    "parseEvidenceRequirement: value is not a valid EvidenceRequirement " +
      "(SDD §E / v1.1 §5) — check key/ownershipPolicy/freshnessPolicy/" +
      "sourceIntegrity/provenancePolicy.",
  );
}
