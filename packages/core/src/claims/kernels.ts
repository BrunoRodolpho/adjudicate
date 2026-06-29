/**
 * The THREE KERNELS + the asymmetric Evidence-Ledger TOPOLOGY — the
 * architectural capstone of the claims runtime (SDD §F; v1.1 §6; §R topology;
 * Inv 13). This module is the one place the whole §F table is expressed as
 * TYPES, and the one place the §F one-directional flow
 *
 *     Read + Action  →  Evidence Ledger  →  Claims  →  Renderer
 *
 * is wired as a composition. It owns NO new policy: every repo-specific decision
 * (does this actor own the resource? is this field PII? did the action's outcome
 * confirm?) is INJECTED (like Q3's `SoundnessDeps`), so the kernel stays pure
 * and the two-axis Read layers version independently (SDD §F: "authorization ≠
 * trust"). Each conjunct/verdict it reuses lives in its own Q-module:
 *
 *   - Read kernel    = THIS module's `ReadKernel` (Access ⊕ Provenance — §F, Inv 13).
 *   - Action kernel  = the EXISTING `Decision` (REUSED, not forked — §F, §R).
 *   - Claims kernel  = Q3 `claimAllowed` (P1) ∘ Q4 `checkConsistency` (P2) — §F.
 *   - Evidence Ledger= Q2 `EvidenceLedger` (the per-turn snapshot Read+Action feed).
 *
 * §F TOPOLOGY (asymmetric, one-directional): Read + Action FEED the Evidence
 * Ledger; the Claims Kernel sits DOWNSTREAM as the final output authority. The
 * arrow never points backward — Claims CONSUMES the Ledger; the Ledger never
 * consumes Claims, and nothing flows Claims → Ledger → Read (SDD §R topology
 * condition 1: the model must not collapse). Q5 stops at producing the
 * renderable VALIDATED+consistent set + the turn terminal; the
 * renderer-from-claims itself is a DOWNSTREAM (ibatexas) deliverable (SDD §Q.7).
 *
 * §R topology hard-errors this module structurally prevents (each is a test):
 *   1. the four-stage model does not collapse (the flow is one-directional);
 *   2. NO claim carries free-text reasoning to validate — validation goes through
 *      Q3's typed `EvidenceRequirement` predicate, never a prose field;
 *   3. the three-valued `VALIDATED | UNKNOWN | REFUSED` model is intact (Q1);
 *   4. the Read kernel's two layers (access ≠ provenance) are independent.
 *
 * PURE & self-contained — no clock/RNG/IO; no kernel-downstream import (SDD §R
 * kernel purity: `adjudicate → claustrum → ibatexas`, never backward). The
 * Action kernel is REUSED INTRA-PACKAGE from `../decision.js` (allowed — same
 * package), never redefined (a divergent second Action verdict = drift, §F/§R).
 */

// ── Action kernel: REUSE the EXISTING Decision (NOT a fork) ────────────────
// Intra-package import (same `@adjudicate/core`) — allowed by §R kernel purity
// (the backward-arrow ban is about DOWNSTREAM packages, claustrum/ibatexas).
// The §F Action verdict IS this `Decision` / `DecisionKind`; redefining the
// six values here would be the drift §F/§R forbids ("a second/divergent Action
// verdict = drift").
import type { Decision, DecisionKind } from "../decision.js";

import type { EvidenceLedger } from "./evidence-ledger.js";
import type { LedgerTaint } from "./evidence-ledger.js";
import { claimAllowed } from "./soundness.js";
import type {
  MinimalClaim,
  SoundnessDeps,
} from "./soundness.js";
import { checkConsistency } from "./consistency.js";
import type {
  ConsistencyClaim,
  ConsistencyOptions,
  ConsistencyResult,
} from "./consistency.js";
import type { ClaimVerdict, TurnTerminal } from "./verdict.js";

// ═══════════════════════════════════════════════════════════════════════════
// KERNEL 1 — READ = Access ⊕ Provenance (SDD §F; v1.1 §6; Inv 13)
// ═══════════════════════════════════════════════════════════════════════════
//
// The Read kernel answers "may I read it? + what's its trust?" with TWO
// INDEPENDENT layers (SDD §F: "Read's two layers (authorization ≠ trust)
// version independently"). They are modeled as SEPARATE types so they can vary
// — and version — independently; the kernel result is their direct sum (⊕):
//
//   access     : ALLOW_READ · REDACT · ESCALATE · REFUSE   (authorization)
//   provenance : TRUSTED · UNTRUSTED_DATA                  (trust)
//
// Authorization is NOT trust: an ALLOW_READ on an UNTRUSTED_DATA row is a valid,
// expected combination (you may read a value whose origin you do not trust); so
// is a REDACT on a TRUSTED row (PII-minimization fires on first-party data too).
// Because all four × two combinations are well-formed, the two axes are
// genuinely orthogonal — neither field constrains the other.

/**
 * The Read kernel's ACCESS-layer verdict (SDD §F; v1.1 §6; Inv 13) — the
 * authorization axis, EXACTLY these four members:
 *
 *   - `ALLOW_READ` — the actor may read the value as requested.
 *   - `REDACT`     — read is permitted but PII/cross-tenant fields are removed.
 *                    REDACT is the FIELD-LEVEL mechanism of PII-minimization +
 *                    tenant-isolation (Inv 13).
 *   - `ESCALATE`   — the access decision needs a human/supervisor.
 *   - `REFUSE`     — the actor may NOT read it (e.g. cross-customer scope, Inv 2).
 *
 * This is the P1-ownership + PII-minimization + tenant-isolation verdict (Inv
 * 13). It is DISTINCT from `provenance` (the trust axis) — the two version
 * independently (SDD §F).
 */
export type ReadAccess = "ALLOW_READ" | "REDACT" | "ESCALATE" | "REFUSE";

/**
 * The closed membership tuple for `ReadAccess`, in spec order (SDD §F). Single
 * source of truth for the four members; `isReadAccess` narrows against it.
 */
export const READ_ACCESS_VERDICTS: readonly ReadAccess[] = [
  "ALLOW_READ",
  "REDACT",
  "ESCALATE",
  "REFUSE",
] as const;

/** Type guard: is `value` one of the exactly-four Read access verdicts? Pure. */
export function isReadAccess(value: unknown): value is ReadAccess {
  return (
    typeof value === "string" &&
    (READ_ACCESS_VERDICTS as readonly string[]).includes(value)
  );
}

/**
 * The Read kernel's PROVENANCE-layer verdict (SDD §F; v1.1 §6) — the trust axis,
 * EXACTLY the two `LedgerTaint` members `TRUSTED | UNTRUSTED_DATA` (reused from
 * Q2's ledger vocabulary — §G; these two values land on a ledger entry's read-
 * layer `taint`). A distinct ALIAS name documents that this is the Read kernel's
 * SECOND, orthogonal layer; the underlying union is shared with the ledger so a
 * Read provenance verdict drops into the ledger entry's `taint` as-is. NOTE this
 * is the read-layer trust axis, NOT the 3-value `OriginProvenance` ORIGIN axis
 * (§G / §J.3) on `originProvenance` — that is labeled at mint time, separately.
 *
 * Authorization ≠ trust (SDD §F): this is NOT `ReadAccess`. An `UNTRUSTED_DATA`
 * value may still be `ALLOW_READ` (you read it) — but it may never be the
 * VALIDATING value of a claim (Inv 3; enforced downstream by Q3, not here).
 */
export type ReadProvenance = LedgerTaint;

/**
 * The Read kernel RESULT — the DIRECT SUM (⊕) of the two independent layers
 * (SDD §F; v1.1 §6; Inv 13). The two are SEPARATE fields, each its own closed
 * union, so they version independently (the §R/§F "two layers version
 * independently" requirement is structural here — neither field's type mentions
 * the other; all `ReadAccess × ReadProvenance` combinations are well-formed):
 *
 *   - `access`     — the authorization verdict (P1 ownership + PII-min +
 *                    tenant-isolation, Inv 13).
 *   - `provenance` — the trust verdict (TRUSTED | UNTRUSTED_DATA).
 *
 * This is what the Read kernel FEEDS the Evidence Ledger: an allowed/redacted
 * read writes an entry whose read-layer `taint` carries `provenance` (the entry's
 * 3-value `originProvenance` ORIGIN axis is labeled separately at mint time, §G /
 * §J.3). The Read kernel does NOT itself validate claims — it produces evidence +
 * its trust; the Claims kernel (downstream) decides what may be SAID (SDD §F).
 */
export interface ReadKernelResult {
  readonly access: ReadAccess;
  readonly provenance: ReadProvenance;
}

/**
 * The Read kernel's ACCESS layer (SDD §F; Inv 13) — the authorization predicate,
 * INJECTED so the kernel hardcodes no repo ownership/PII model (mirrors Q3's
 * injected `owns`). Given an opaque, kernel-abstract `query`, it returns a
 * `ReadAccess`. The repo implements P1 ownership (owner-scoped read),
 * PII-minimization, and tenant-isolation here; `REDACT` is the field-level
 * mechanism (Inv 13). Must be PURE so the Read kernel stays pure.
 */
export interface ReadAccessLayer {
  readonly decideAccess: (query: unknown) => ReadAccess;
}

/**
 * The Read kernel's PROVENANCE layer (SDD §F) — the trust predicate, INJECTED
 * and SEPARATE from the access layer so the two version independently (SDD §F:
 * "authorization ≠ trust"). Given the same opaque `query`, it returns the
 * `ReadProvenance` (TRUSTED | UNTRUSTED_DATA) the read's origin warrants. Must
 * be PURE.
 *
 * The two layers are DELIBERATELY two distinct injected objects, not one — a
 * downstream repo can re-version (swap) the access policy without touching the
 * provenance policy, and vice versa. That is the §F independence made concrete.
 */
export interface ReadProvenanceLayer {
  readonly decideProvenance: (query: unknown) => ReadProvenance;
}

/**
 * The Read kernel = Access ⊕ Provenance (SDD §F; v1.1 §6; Inv 13). It runs the
 * two INDEPENDENT layers over a read `query` and returns their direct sum. A
 * PURE function: same `query` + same layers ⟹ same result. The two layers are
 * never composed INTO one another — `access` is computed solely by the access
 * layer, `provenance` solely by the provenance layer — so they remain
 * orthogonal and version independently (the §F/§R requirement).
 */
export function runReadKernel(
  query: unknown,
  layers: ReadKernel,
): ReadKernelResult {
  return {
    // authorization axis (P1 ownership + PII-min + tenant-isolation, Inv 13)
    access: layers.access.decideAccess(query),
    // trust axis (TRUSTED | UNTRUSTED_DATA) — computed INDEPENDENTLY
    provenance: layers.provenance.decideProvenance(query),
  };
}

/**
 * The Read kernel as a COMPOSITION of its two independent layers (SDD §F). The
 * two are separate fields so a repo can re-version one without the other; that
 * separation IS the "two layers version independently" contract.
 */
export interface ReadKernel {
  readonly access: ReadAccessLayer;
  readonly provenance: ReadProvenanceLayer;
}

// ═══════════════════════════════════════════════════════════════════════════
// KERNEL 2 — ACTION = adjudicate (SDD §F; v1.1 §6) — REUSE, DO NOT FORK
// ═══════════════════════════════════════════════════════════════════════════
//
// The Action kernel answers "can this happen?" Its verdict IS the EXISTING
// six-valued `Decision` (EXECUTE · REFUSE · ESCALATE · REQUEST_CONFIRMATION ·
// DEFER · REWRITE) produced by the EXISTING `adjudicate(envelope, state,
// policy)` — NOT a new union. We re-export the existing types under §F-named
// aliases so the topology can NAME the Action verdict without DEFINING a second
// one. Redefining the six values here would be the §F/§R drift ("a second/
// divergent Action verdict = drift"); a type alias guarantees identity — these
// names ARE `Decision` / `DecisionKind`, byte-for-byte, by construction.

/**
 * The Action kernel's VERDICT (SDD §F; v1.1 §6) — an ALIAS of the EXISTING
 * `Decision` (from `../decision.js`), NOT a redefinition. The §F Action verdict
 * is the six-valued adjudicate `Decision`; this alias lets the topology refer to
 * it by a §F-evocative name while the type IDENTITY stays the existing
 * `Decision`. (`ActionKernelVerdict` ≡ `Decision`, structurally.)
 */
export type ActionKernelVerdict = Decision;

/**
 * The Action kernel verdict KIND (SDD §F; v1.1 §6) — an ALIAS of the EXISTING
 * `DecisionKind` (`EXECUTE | REFUSE | ESCALATE | REQUEST_CONFIRMATION | DEFER |
 * REWRITE`). Reused, not forked: `ActionKernelVerdictKind` ≡ `DecisionKind`.
 */
export type ActionKernelVerdictKind = DecisionKind;

// ── BUILD-TIME reuse-not-fork guard (SDD §F Action-reuse; §R no-fork) ──────────
// The §F Action verdict MUST stay byte-identical to the existing `Decision`/
// `DecisionKind` — forking the alias (redefining the six values, or drifting its
// shape) is the §F/§R drift ("a second/divergent Action verdict = drift"). The
// assertion lives HERE, in `src`, BECAUSE `src` is always typechecked by the
// package build (`tsc`); a guard placed in the test file would be inert (that
// file is excluded from the typecheck). These are PURE compile-time TYPES — zero
// runtime cost — so a fork becomes a BUILD-TIME compile error, not a silent pass.
//
// `_Equal<A, B>` is `true` IFF A and B are mutually assignable AND identical
// (the classic invariant-position trick: two identity functions are assignable
// to each other only when their type parameters' constraints coincide exactly).
type _Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

// `_AssertEqual<A, B>` resolves to `true` when A ≡ B and to `never` otherwise.
// Annotating a `true` literal with it is the build-time check: assigning `true`
// to a `true`-typed binding is fine, but assigning `true` to `never` (the forked
// case) is a TYPE ERROR. The two constants below force `tsc` to evaluate the
// equality — an unreferenced `type` alias alone is never checked.
type _AssertEqual<A, B> = _Equal<A, B> extends true ? true : never;

// If either alias ever FORKS away from its source type, its `_AssertEqual<…>`
// collapses to `never`, `true` is no longer assignable to it, and the package
// build (`tsc`) FAILS on the offending line — the §F/§R drift surfaces at build
// time, exactly where the source is always typechecked. Pure compile-time: these
// two `const`s carry no logic and are tree-shaken away.
const _actionVerdictReused: _AssertEqual<ActionKernelVerdict, Decision> = true;
const _actionVerdictKindReused: _AssertEqual<
  ActionKernelVerdictKind,
  DecisionKind
> = true;
// Reference them so an enabled `noUnusedLocals` stays satisfied; `void` = no use.
void _actionVerdictReused;
void _actionVerdictKindReused;

// ═══════════════════════════════════════════════════════════════════════════
// KERNEL 3 — CLAIMS = P1 (per claim) ⊕ P2 (set) (SDD §F; v1.1 §6) — THE OUTPUT AUTHORITY
// ═══════════════════════════════════════════════════════════════════════════
//
// The Claims kernel answers "may the system SAY it?" It is the FINAL output
// authority of the topology (SDD §F). It runs the lifecycle (SDD §D):
//
//   Candidate Claims  →(P1 soundness, Q3 claimAllowed)→  Validated Claim Set
//                     →(P2 consistency, Q4 checkConsistency)→  Renderable Set + Terminal
//
// It COMPOSES the two existing gates — it does not re-implement either. P1 runs
// FIRST and per-claim (an UNTRUSTED/UNKNOWN member must never enter or suppress
// the P2 set — SDD §D); only the VALIDATED survivors reach P2. Validation goes
// THROUGH Q3's typed `EvidenceRequirement` predicate over the Evidence Ledger —
// NEVER a free-text reasoning field (SDD §R topology condition 2).

/**
 * One CANDIDATE claim presented to the Claims kernel (SDD §D; §F). It carries
 * BOTH faces the two gates need, kept as the EXISTING Q-module shapes so no
 * third claim type is invented:
 *
 *   - `soundness`  — the Q3 `MinimalClaim` the §5 predicate quantifies over
 *                    (`requiredEvidence` + `minSourceIntegrity` + `kind` +
 *                    `actor` + `resources`). Validation reads ONLY this typed
 *                    structure (no free-text reason — §R condition 2).
 *   - `subject`    — the Q4 same-subject partition key (consistency is a
 *                    same-subject property — SDD §D).
 *   - `type`       — the Q4 registry type name (the consistency table is keyed
 *                    by the unordered `{type, type}` pair within a subject).
 *   - `value`      — the domain proposition the renderer would fill from this
 *                    claim. Carried for a RENDERED claim; it is the §O#5 / Inv 6
 *                    forbidden payload — the gate's OWN suppression output never
 *                    echoes it (Q4 enforces that).
 *
 * Deliberately NO `reason` / `rationale` / free-text field: a claim validates
 * via the typed soundness predicate, never prose (SDD §R topology condition 2).
 */
export interface CandidateClaim {
  readonly soundness: MinimalClaim;
  readonly subject: string;
  readonly type: string;
  readonly value: unknown;
}

/**
 * The Claims kernel's per-claim VERDICT record (SDD §F; §I). The §5 soundness
 * verdict (Q3) for one candidate, paired with the candidate's identity so the
 * caller can trace WHICH candidate got WHICH three-valued verdict. The
 * `verdict` is EXACTLY the three-valued `ClaimVerdict` (Q1) — never a fourth
 * value, never the turn terminal (SDD §R topology condition 3 / §P misreading).
 */
export interface ClaimSoundnessVerdict {
  readonly subject: string;
  readonly type: string;
  /** The Q3 §5 verdict — the three-valued `VALIDATED | UNKNOWN | REFUSED`. */
  readonly verdict: ClaimVerdict;
}

/**
 * The Claims kernel RESULT (SDD §F; §D; §I) — the FINAL output authority's
 * output. Q5 stops HERE (the renderer-from-claims is downstream, SDD §Q.7):
 *
 *   - `perClaim`    — the three-valued §5 verdict (Q1 `ClaimVerdict`) for EVERY
 *                     candidate, in input order (P4 completeness: no candidate
 *                     silently disappears — each gets an explicit verdict).
 *   - `renderable`  — the consistent VALIDATED subset that may reach the
 *                     renderer (Q4's `renderable`). A suppressed or non-validated
 *                     claim is NOT here.
 *   - `terminal`    — the TURN terminal (Q1 `TurnTerminal`): `RENDER` iff there
 *                     is a non-empty consistent VALIDATED set; otherwise the
 *                     safe terminal Q4 forced (`ESCALATE`) or `UNKNOWN` when
 *                     nothing validated at all (honest ignorance, SDD §I/§K).
 *   - `consistency` — the full Q4 `ConsistencyResult` (renderable + terminal +
 *                     the §O#5 proposition-free suppression records), surfaced so
 *                     a downstream renderer has the structural suppression
 *                     reasons WITHOUT this kernel re-deriving them.
 *
 * The `terminal` is a `TurnTerminal`, NOT a `ClaimVerdict` (SDD §I/§P): the turn
 * space includes `ESCALATE`/`CLARIFY`, which the three-valued verdict does not.
 */
export interface ClaimsKernelResult {
  readonly perClaim: readonly ClaimSoundnessVerdict[];
  readonly renderable: readonly ConsistencyClaim[];
  readonly terminal: TurnTerminal;
  readonly consistency: ConsistencyResult;
}

/**
 * The Claims kernel = P1 ∘ P2 (SDD §F; §D; v1.1 §6) — the FINAL output authority.
 * A PURE function: same ledger + candidates + deps ⟹ same result.
 *
 * Topology + lifecycle (SDD §F / §D, in order — ONE-DIRECTIONAL):
 *
 *   1. **P1 soundness (Q3), per candidate, FIRST.** Run `claimAllowed` for each
 *      candidate against the Evidence Ledger (the snapshot Read + Action fed —
 *      the kernel CONSUMES it; it never writes to it). Each candidate gets a
 *      three-valued `ClaimVerdict`. Validation is THROUGH the typed §5 predicate
 *      over `requiredEvidence` — never a free-text reason (§R condition 2).
 *   2. **Form the VALIDATED set (§D).** Only `VALIDATED` candidates carry into
 *      P2; an UNKNOWN/REFUSED member must never enter or suppress the P2 set.
 *   3. **P2 consistency (Q4) over the SET.** Run `checkConsistency` over the
 *      VALIDATED members → the renderable subset + the turn terminal + the
 *      proposition-free suppression records.
 *   4. **Turn terminal (§I).** `RENDER` when a non-empty consistent VALIDATED
 *      set survives; `ESCALATE` when consistency suppressed something; `UNKNOWN`
 *      when nothing validated at all (honest ignorance — the turn surfaces it
 *      rather than rendering an empty set as if it had content, SDD §I/§K).
 *
 * The flow is ASYMMETRIC: the Ledger is read-only INPUT here; this function
 * never mutates it and nothing flows Claims → Ledger → Read (SDD §F/§R topology
 * condition 1 — the model does not collapse).
 */
export function runClaimsKernel(
  ledger: EvidenceLedger,
  candidates: readonly CandidateClaim[],
  deps: ClaimsKernelDeps,
): ClaimsKernelResult {
  // ── (1) P1 soundness (Q3), per candidate, against the read-only Ledger. The
  // ledger is the snapshot Read + Action already fed; the Claims kernel only
  // RESOLVES keys out of it (one-directional — never records into it here).
  const perClaim: ClaimSoundnessVerdict[] = candidates.map((candidate) => ({
    subject: candidate.subject,
    type: candidate.type,
    // Validation goes THROUGH the typed §5 predicate over `requiredEvidence` —
    // there is no free-text reason path (§R topology condition 2).
    //
    // C6 value-binding (§5 C6; Theorem S (a-value)): the RENDERED value the model
    // authored is `candidate.value` (the field copied UNTOUCHED into the renderable
    // ConsistencyClaim below). We thread it into the soundness input so that, when
    // the candidate's `soundness.valueBinding` is declared (W5), C6 binds THAT
    // rendered value to its licensing evidence — closing the surplus channel where
    // a claim validated on present∧fresh∧owned∧… while its value was a model
    // confabulation. Additive + fail-safe: with no `valueBinding`, `value` is never
    // read and the verdict is byte-identical to before.
    verdict: claimAllowed(
      { ...candidate.soundness, value: candidate.value },
      ledger,
      deps.soundness,
    ),
  }));

  // ── (2) Form the VALIDATED set (§D): only VALIDATED candidates carry into P2.
  // Each carries its (subject, type, value) so the P2 gate can partition by
  // subject and key the constraint table by type. A non-VALIDATED candidate is
  // dropped here — it may neither enter the renderable set nor suppress a valid
  // same-subject claim (SDD §D).
  const consistencyInput: ConsistencyClaim[] = candidates
    .map((candidate, i): ConsistencyClaim => {
      const verdict = perClaim[i]?.verdict ?? "UNKNOWN";
      return {
        subject: candidate.subject,
        type: candidate.type,
        verdict,
        value: candidate.value,
      };
    })
    // DEFENSE-IN-DEPTH §D filter (NOT the single enforcement point). The P2 gate
    // ALSO drops non-VALIDATED members internally (consistency.ts step 1), so §D
    // is enforced in BOTH places. This pre-filter is a redundant belt-and-braces:
    // it keeps `consistencyInput` honest (only VALIDATED reaches the gate) even if
    // the gate's own filter were ever weakened. The two use the IDENTICAL
    // predicate (`verdict === "VALIDATED"`), so they cannot diverge.
    .filter((c) => c.verdict === "VALIDATED");

  // ── (3) P2 consistency (Q4) over the VALIDATED set.
  const consistency = checkConsistency(consistencyInput, deps.consistency);

  // ── (4) Turn terminal (§I). Q4 returns RENDER iff nothing was suppressed and
  // ESCALATE otherwise. But a Q4 RENDER over an EMPTY validated set is not a
  // render of anything — there is no content to show. When nothing validated,
  // the turn surfaces honest ignorance: UNKNOWN (SDD §I/§K — "missing/not-found
  // → honest ignorance + offer; not a failure"), never a vacuous RENDER.
  const terminal: TurnTerminal =
    consistency.terminal === "RENDER" && consistency.renderable.length === 0
      ? "UNKNOWN"
      : consistency.terminal;

  return {
    perClaim,
    renderable: consistency.renderable,
    terminal,
    consistency,
  };
}

/**
 * The injected capabilities the Claims kernel composes (SDD §F). It holds NO
 * policy of its own — it threads the EXISTING Q3 `SoundnessDeps` (ownership +
 * action-outcome + `now`) into P1, and the EXISTING Q4 `ConsistencyOptions`
 * (the optional declared constraint table) into P2. Keeping them as the
 * existing shapes means the topology adds no new injection surface — it only
 * WIRES the two gates that already exist.
 */
export interface ClaimsKernelDeps {
  /** Q3 §5 capabilities (P1): `owns`, `outcomeConfirmed`, `now`. */
  readonly soundness: SoundnessDeps;
  /** Q4 P2 options (the optional declared same-subject constraint table). */
  readonly consistency?: ConsistencyOptions;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ASYMMETRIC TOPOLOGY (SDD §F; v1.1 §6; §R) — Read+Action → Ledger → Claims → Renderer
// ═══════════════════════════════════════════════════════════════════════════
//
// The §F topology is ASYMMETRIC and ONE-DIRECTIONAL. Read + Action FEED the
// Evidence Ledger (they WRITE evidence); the Claims kernel sits DOWNSTREAM and
// READS the Ledger as the final output authority. The arrow never reverses —
// Claims consumes the Ledger; the Ledger never consumes Claims, and nothing
// flows Claims → Ledger → Read. We model this as a typed STAGE enum + a
// directed adjacency so the asymmetry is inspectable AND testable (a §R
// topology-collapse becomes a failing assertion against this graph).

/**
 * The FOUR distinct stages of the §F topology (SDD §F; §R topology condition 1).
 * They are DISTINCT — collapsing any two is the §R "kernel model collapses"
 * failure. Order is the spec's left-to-right flow.
 */
export type TopologyStage = "READ_ACTION" | "EVIDENCE_LEDGER" | "CLAIMS" | "RENDERER";

/**
 * The closed membership tuple for `TopologyStage`, in flow order (SDD §F).
 */
export const TOPOLOGY_STAGES: readonly TopologyStage[] = [
  "READ_ACTION",
  "EVIDENCE_LEDGER",
  "CLAIMS",
  "RENDERER",
] as const;

/**
 * One DIRECTED edge of the §F topology — `from` FEEDS `to` (SDD §F). The
 * direction is load-bearing: it encodes that Read+Action feed the Ledger and the
 * Ledger feeds Claims, never the reverse.
 */
export interface TopologyEdge {
  readonly from: TopologyStage;
  readonly to: TopologyStage;
}

/**
 * The §F topology as a DIRECTED, ACYCLIC, ONE-DIRECTIONAL adjacency (SDD §F;
 * v1.1 §6; §R topology condition 1):
 *
 *   READ_ACTION  →  EVIDENCE_LEDGER  →  CLAIMS  →  RENDERER
 *
 * EXACTLY these three forward edges; NO backward edge (no `CLAIMS → ...`,
 * `EVIDENCE_LEDGER → READ_ACTION`, etc.). The Claims kernel CONSUMES the Ledger
 * (`EVIDENCE_LEDGER → CLAIMS`); the Ledger does NOT consume Claims. This is the
 * data-flow asymmetry §F demands; `topologyHasBackwardEdge` proves it holds.
 */
export const ASYMMETRIC_TOPOLOGY: readonly TopologyEdge[] = [
  { from: "READ_ACTION", to: "EVIDENCE_LEDGER" },
  { from: "EVIDENCE_LEDGER", to: "CLAIMS" },
  { from: "CLAIMS", to: "RENDERER" },
] as const;

/**
 * The forward RANK of each stage on the §F flow (SDD §F). A topology edge is
 * FORWARD iff `rank(from) < rank(to)`. Used to detect a backward (or self) edge
 * — the §R topology-collapse signal.
 */
function stageRank(stage: TopologyStage): number {
  return TOPOLOGY_STAGES.indexOf(stage);
}

/**
 * Does the topology contain ANY backward or self edge (SDD §F; §R topology
 * condition 1)? `true` iff some edge has `rank(from) >= rank(to)` — i.e. the
 * flow is NOT strictly one-directional (a Claims → Ledger → Read reversal, or a
 * stage feeding itself, would be a collapse). For `ASYMMETRIC_TOPOLOGY` this is
 * `false` by construction; the test asserts that, and asserts that INJECTING a
 * backward edge flips it to `true` (non-vacuity). Pure.
 */
export function topologyHasBackwardEdge(
  edges: readonly TopologyEdge[],
): boolean {
  return edges.some((edge) => stageRank(edge.from) >= stageRank(edge.to));
}

/**
 * Does the Evidence Ledger CONSUME Claims (SDD §F; §R topology condition 1)? The
 * §F asymmetry says NO — Claims consumes the Ledger, never the reverse. `true`
 * iff any edge points FROM `CLAIMS` (or `RENDERER`) back INTO `EVIDENCE_LEDGER`
 * or `READ_ACTION`. For `ASYMMETRIC_TOPOLOGY` this is `false`; a `CLAIMS →
 * EVIDENCE_LEDGER` (or `→ READ_ACTION`) edge would make it `true` (the collapse
 * the §R test forbids). Pure.
 */
export function ledgerConsumesClaims(
  edges: readonly TopologyEdge[],
): boolean {
  const upstream: readonly TopologyStage[] = ["READ_ACTION", "EVIDENCE_LEDGER"];
  const downstream: readonly TopologyStage[] = ["CLAIMS", "RENDERER"];
  return edges.some(
    (edge) =>
      downstream.includes(edge.from) && upstream.includes(edge.to),
  );
}
