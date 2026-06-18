/**
 * Decision — the 6-valued output of adjudicate(envelope, state, policy).
 *
 *   EXECUTE              → mutation is authorized; proceed to side effect
 *   REFUSE               → not allowed; surface a typed Refusal to the user
 *   ESCALATE             → defer to a human or supervisor; block until resolved
 *   REQUEST_CONFIRMATION → ask the user to re-confirm, then re-adjudicate
 *   DEFER                → valid but awaits an external signal (e.g. payment webhook)
 *   REWRITE              → kernel substitutes a sanitized/normalized/capped envelope
 *
 * REWRITE is scope-restricted: sanitization, normalization, and safe mechanical
 * capping only. Never business transformation. See @adjudicate/core/README.md.
 *
 * **REWRITE re-adjudication & executed-hash recording (011).** A REWRITE is a
 * *proposal substitution*, not authorization. The `rewritten` envelope carries
 * its own content-addressed `intentHash`; the kernel never mutates that recipe.
 * Two things happen to a REWRITE before any side effect:
 *   1. In the pure kernel (`adjudicate`), the rewritten `intentHash` is re-derived
 *      fail-closed and a taint-elevating rewrite is blocked (a non-deterministic
 *      rewrite may only INCREASE friction — §C monotonicity).
 *   2. In the audited shell (`adjudicateAndAudit`), the rewritten envelope
 *      re-enters the kernel ONCE; only a second-pass EXECUTE lets it reach the
 *      executor. The EXECUTED (rewritten) hash — not the original — is the audit
 *      row's indexed `intentHash` and the ledger-claim key, linked back to the
 *      original via a `rewrite_executed` supersession.
 * REWRITE→REWRITE is bounded to that single pass: a rewrite that itself rewrites
 * falls through to REFUSE, never recursing.
 */

import type {
  AuthorityEdge,
  AuthorityGraph,
  AuthorityRelationship,
  IntentEnvelope,
  RecordedAuthoritySnapshot,
} from "./envelope.js";
import type { DecisionBasis } from "./basis-codes.js";
import type { Refusal } from "./refusal.js";
import { sha256SnapshotCanonical } from "./hash.js";

export type DecisionKind =
  | "EXECUTE"
  | "REFUSE"
  | "ESCALATE"
  | "REQUEST_CONFIRMATION"
  | "DEFER"
  | "REWRITE";

export type Decision =
  | { kind: "EXECUTE"; basis: readonly DecisionBasis[] }
  | { kind: "REFUSE"; refusal: Refusal; basis: readonly DecisionBasis[] }
  | {
      kind: "ESCALATE";
      to: "human" | "supervisor";
      reason: string;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "REQUEST_CONFIRMATION";
      prompt: string;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "DEFER";
      signal: string;
      timeoutMs: number;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "REWRITE";
      rewritten: IntentEnvelope;
      reason: string;
      basis: readonly DecisionBasis[];
    };

/** Construct an EXECUTE decision with the given basis list. */
export function decisionExecute(basis: readonly DecisionBasis[]): Decision {
  return { kind: "EXECUTE", basis };
}

export function decisionRefuse(
  refusal: Refusal,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REFUSE", refusal, basis };
}

export function decisionEscalate(
  to: "human" | "supervisor",
  reason: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "ESCALATE", to, reason, basis };
}

export function decisionRequestConfirmation(
  prompt: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REQUEST_CONFIRMATION", prompt, basis };
}

export function decisionDefer(
  signal: string,
  timeoutMs: number,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "DEFER", signal, timeoutMs, basis };
}

export function decisionRewrite(
  rewritten: IntentEnvelope,
  reason: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REWRITE", rewritten, reason, basis };
}

// ─────────────────────────────────────────────────────────────────────────
// 061 · Monotonic escalation: restrictiveness lattice + friction-only ceiling
// ─────────────────────────────────────────────────────────────────────────
//
// The closed 6-outcome `Decision` algebra carries NO built-in restrictiveness
// total order (no `rank`/`severity`/`ordinal`/`confidence`/`metadata` field — see
// invariant #2). 061 adds that order as net-new COMPOSITION METADATA derived from
// the `kind` alone — it does NOT add any field to the `Decision` union and does
// NOT add a 7th outcome. The lattice exists solely so `clampToCeiling` can compute
// index §C's `final = min(deterministic_decision, risk_ceiling)`.
//
// ── The ratified restrictiveness order (index §C, constitutional) ──
//
//   EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER < ESCALATE < REFUSE
//   (least friction → most friction)
//
// Index §C ratifies one ordering pair as a constitutional decision, not merely an
// illustration: **REWRITE ranks BELOW REQUEST_CONFIRMATION** — a sanitizing rewrite
// is less friction than asking a human. Do not reorder without amending §C.
//
// Rationale per rung (low→high friction):
//   • EXECUTE              — no friction; the mutation proceeds.
//   • REWRITE              — a mechanically sanitized/normalized/capped proposal
//                            still proceeds (after a single re-adjudication pass);
//                            cheaper than any human/threshold step.
//   • REQUEST_CONFIRMATION — pauses for a human "are you sure?" before proceeding.
//   • DEFER                — valid but blocked awaiting an external signal/webhook.
//   • ESCALATE             — routed to a human/supervisor; blocks until resolved.
//   • REFUSE               — terminally denied; maximum friction.
//
// The numbers are an internal lattice index only; never serialized, never on the
// wire, never a `Decision` field. Higher index == more restrictive (more friction).
const RESTRICTIVENESS_ORDER: readonly DecisionKind[] = [
  "EXECUTE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "ESCALATE",
  "REFUSE",
] as const;

/**
 * The restrictiveness rank of a `DecisionKind` on the §C lattice: 0 = least
 * restrictive (EXECUTE) … 5 = most restrictive (REFUSE). Higher == more friction.
 *
 * Pure, total, and derived from `kind` alone — no `Decision` field is read or
 * added. Used by `clampToCeiling`; exported so downstream ceiling consumers
 * (05x/10x/11x) and tests can reason about the same total order.
 */
export function restrictivenessRank(kind: DecisionKind): number {
  return RESTRICTIVENESS_ORDER.indexOf(kind);
}

/**
 * Total restrictiveness order: `true` iff `a` is at least as restrictive as `b`
 * (a's friction >= b's friction) on the §C lattice. Reflexive.
 */
export function isAtLeastAsRestrictive(a: DecisionKind, b: DecisionKind): boolean {
  return restrictivenessRank(a) >= restrictivenessRank(b);
}

/**
 * `clampToCeiling` — index §C's `final = min(deterministic, ceiling)` over the
 * restrictiveness lattice. Returns whichever of the two Decisions carries the
 * GREATER friction (the more-restrictive `kind`), so a ceiling may only RAISE
 * friction, never lower it.
 *
 * Semantics (the monotonicity primitive 05x/10x/11x consume):
 *   • If `ceiling` is strictly MORE restrictive than `deterministic`, the
 *     ceiling Decision is returned verbatim (friction is raised).
 *   • Otherwise (`ceiling` equal or LESS restrictive) the `deterministic`
 *     Decision is returned UNCHANGED. A ceiling can never weaken below the
 *     deterministic decision: `REFUSE`-ceiling over an `EXECUTE`-deterministic
 *     raises to REFUSE; an `EXECUTE`-ceiling over a `REFUSE`-deterministic is a
 *     no-op (the REFUSE stands). Only deterministic rules authorize EXECUTE —
 *     the result is EXECUTE iff `deterministic.kind === "EXECUTE"` (invariant
 *     #1/§C), because EXECUTE is the unique minimum of the lattice, so any
 *     non-EXECUTE ceiling clamps an EXECUTE deterministic upward and an EXECUTE
 *     ceiling never lowers a more-restrictive deterministic decision.
 *
 * This adds NO field and NO 7th outcome: it only SELECTS between two existing
 * Decisions by their `kind`'s lattice rank, returning one of them as-is (so its
 * `basis`/payload is preserved exactly — no synthesis, no mutation).
 *
 * Fail-closed (§C / invariant #6): the function is total over the closed algebra
 * and is biased to friction on a tie (it keeps `deterministic` only when the
 * ceiling is NOT strictly more restrictive, i.e. it never trades a more-
 * restrictive ceiling for a less-restrictive deterministic decision).
 *
 * Pure & synchronous (kernel-purity §D): no clock, RNG, or IO.
 */
export function clampToCeiling(deterministic: Decision, ceiling: Decision): Decision {
  // The ceiling wins iff it is STRICTLY more restrictive (higher friction rank);
  // on equal or lower friction the deterministic decision is returned unchanged.
  // This is a true `min` over the restrictiveness lattice (min == most friction)
  // with ties biased to the deterministic decision (fail-closed §C / invariant #6).
  return restrictivenessRank(ceiling.kind) > restrictivenessRank(deterministic.kind)
    ? ceiling
    : deterministic;
}

// ─────────────────────────────────────────────────────────────────────────
// 032 · Authority-graph store + pure ownership resolver
// ─────────────────────────────────────────────────────────────────────────
//
// The authority graph (`principal —relationship→ resource —permits→
// {actions, limits}`, index §G) is an IMMUTABLE injected SNAPSHOT (index §B/§D),
// never a decision layer. This module ships the read-only STORE over a snapshot
// and the PURE resolver that turns `(graph, envelope) => ownership FACT`.
//
// The resolver returns a FACT (predicate results + the matched edges), NEVER a
// `Decision` — preserving index §B ("everything else produces facts; the kernel
// produces decisions") and index §C monotonicity (a fact can never authorize
// EXECUTE or lower friction). The closed 6-outcome `Decision` algebra above is
// UNTOUCHED: no 7th outcome, no `confidence`/`metadata` field.
//
// Pure & synchronous (kernel-purity §D, invariant #5): no clock, RNG, or IO — so
// the resolver replays bit-identically over a recorded snapshot. The lookup
// resolves a `(principal, resource)` pair against the snapshot's edges; the
// envelope's resource refs (031) supply the resource/owner identifiers, and the
// caller supplies the actor's resolved principal identity (the kernel/`IntentActor`
// is provenance-only and carries no identity, so the principal binding is an
// explicit input — never inferred from the provenance enum).

/**
 * The keys in an envelope's `resourceRefs` the resolver consults (032). Both are
 * OPTIONAL on any given kind — a kind that declares neither yields a fact with
 * no matched edges (the resolver never throws on a missing ref). `principal` is
 * the actor's RESOLVED identity (the owner/account holder the action is taken
 * as), `resource` is the target the action operates on.
 *
 * Defaulted to the conventional ref names so the canonical call site is just
 * `resolveOwnership(store, envelope)`; a kind with bespoke ref names passes an
 * override.
 */
export interface OwnershipRefKeys {
  /** `resourceRefs` key carrying the acting principal's identity. Default `"owner"`. */
  readonly principalKey?: string;
  /** `resourceRefs` key carrying the target resource's identity. Default `"resource"`. */
  readonly resourceKey?: string;
}

const DEFAULT_PRINCIPAL_KEY = "owner";
const DEFAULT_RESOURCE_KEY = "resource";

/**
 * The ownership FACT the resolver returns — predicate results over the injected
 * snapshot, NOT a `Decision`. A guard (034) reads these booleans to decide; the
 * resolver itself never authorizes.
 *
 * `bound` is the load-bearing predicate (does an edge bind this principal to this
 * resource?). `relationships` enumerates the matched edges' relationship labels
 * in snapshot order (so `advisor`-only vs `owns` is distinguishable); `permits`
 * unions the matched edges' permitted actions; `edges` is the matched subset
 * verbatim for a downstream limit check. All deterministic functions of the
 * snapshot + the resolved (principal, resource).
 */
export interface OwnershipFact {
  /** The resolved acting principal identity (or `null` when the ref is absent). */
  readonly principal: string | null;
  /** The resolved target resource identity (or `null` when the ref is absent). */
  readonly resource: string | null;
  /** True iff ≥1 snapshot edge binds `principal` to `resource`. */
  readonly bound: boolean;
  /** Matched edges' relationship labels, snapshot order, de-duplicated. */
  readonly relationships: readonly AuthorityRelationship[];
  /** Union of the matched edges' permitted action names, snapshot order, de-duplicated. */
  readonly permits: readonly string[];
  /** The matched edges verbatim (for a downstream limit/permits check). */
  readonly edges: readonly AuthorityEdge[];
}

/**
 * Read-only lookup surface over a frozen authority-graph snapshot (032). The
 * store is a constructor: it captures the snapshot and exposes pure edge lookups.
 * No `Date.now`/`Math.random`/IO on any path (kernel-purity §D, invariant #5).
 *
 * The store NEVER mutates the snapshot. `graph` is the captured snapshot (its
 * `edges` array is frozen on construction so a holder cannot mutate it in place).
 */
export interface AuthorityGraphStore {
  /** The captured (frozen) snapshot — exposed read-only for serialization/audit. */
  readonly graph: AuthorityGraph;
  /**
   * Edges binding `principal` to `resource`, in snapshot order. Pure: a stable
   * function of the snapshot. Returns `[]` when either id is `null`/absent or no
   * edge matches.
   */
  readonly edgesFor: (
    principal: string | null,
    resource: string | null,
  ) => readonly AuthorityEdge[];
}

/**
 * Construct a read-only authority-graph store over an immutable snapshot (032).
 * Freezes the snapshot's `edges` array (shallow) so the store cannot be mutated
 * through the captured reference. Pure — no clock/RNG/IO.
 */
/**
 * Content-address an authority-graph snapshot (032 T3) for the audit record so
 * the injected snapshot replays bit-identically (invariant #5). Rides
 * `@adjudicate/canonical` (`sha256SnapshotCanonical`, RFC 8785 / JCS) — NOT a
 * forked canonicalizer — so a recorded graph never drifts from `intentHash`
 * semantics (NFC, fail-on-non-finite). Pure: no clock/RNG/IO.
 */
export function hashAuthorityGraph(graph: AuthorityGraph): string {
  return sha256SnapshotCanonical(graph);
}

// ─────────────────────────────────────────────────────────────────────────
// 033 · Authority-snapshot injection + recording for replay (§D-5, inv. #5)
// ─────────────────────────────────────────────────────────────────────────
//
// 033 INJECTS the authority-graph snapshot into the one kernel decision (via
// injected state/deps) and RECORDS it into the audit record so the decision is
// REPLAYABLE: re-running the PURE kernel over the recorded snapshot reproduces
// the decision bit-identically (index §D-5, invariant #5). These two helpers are
// the inject/record + replay seam:
//
//   • `recordAuthoritySnapshot(graph)` — content-addresses the INJECTED graph
//     (`hashAuthorityGraph`, RFC 8785 / JCS via `@adjudicate/canonical`) into a
//     `RecordedAuthoritySnapshot` the audit record carries (033 T3/T4). Pure.
//
//   • `authorityGraphStoreFromRecorded(recorded)` — on REPLAY, re-derives the
//     SAME read-only store from the RECORDED snapshot, so the pure resolver
//     (`resolveOwnership`) sees byte-identical edges and computes the byte-
//     identical `OwnershipFact` it did at decision time (033 T5). Fail-closed:
//     a recorded snapshot whose `snapshotHash` no longer matches its `graph`
//     (a tampered/drifted recorded snapshot) throws rather than replaying a
//     different decision than the one the hash claims (§D-5, invariant #6).
//
// Neither touches the `Decision` algebra (no 7th outcome, no field — invariant
// #2) and neither enters `intentHashInput` (the snapshot rides injected state,
// not a hashed envelope field — invariant #4).

/**
 * Build the RECORDED authority snapshot (033 T3/T4) from the graph the kernel
 * decision was INJECTED with: pairs the immutable `graph` with its
 * content-address (`hashAuthorityGraph`). The audit shell records this onto the
 * `AuditRecord` so the decision replays bit-identically (§D-5, invariant #5).
 *
 * Pure & synchronous (kernel-purity §D): no clock/RNG/IO. Re-running it over the
 * same graph yields a byte-identical `snapshotHash`.
 */
export function recordAuthoritySnapshot(
  graph: AuthorityGraph,
): RecordedAuthoritySnapshot {
  return { graph, snapshotHash: hashAuthorityGraph(graph) };
}

/**
 * Replay primitive (033 T5): re-derive the read-only `AuthorityGraphStore` from
 * a RECORDED snapshot so the pure resolver re-runs over the SAME injected edges
 * and reproduces the byte-identical `OwnershipFact` — the §D-5 replayability
 * proof that the recorded snapshot is sufficient to re-derive the decision.
 *
 * Fail-closed integrity (§D-5 / invariant #6): re-content-addresses the recorded
 * `graph` and compares to the stored `snapshotHash`. A mismatch means the
 * recorded snapshot was tampered with or drifted from its hash — replaying it
 * would silently re-decide over a DIFFERENT graph than the hash claims, so we
 * throw rather than produce a non-faithful replay. A faithful recorded snapshot
 * always passes and yields a store identical to the one used at decision time.
 *
 * Pure & synchronous: no clock/RNG/IO.
 */
export function authorityGraphStoreFromRecorded(
  recorded: RecordedAuthoritySnapshot,
): AuthorityGraphStore {
  const rederived = hashAuthorityGraph(recorded.graph);
  if (rederived !== recorded.snapshotHash) {
    throw new Error(
      `authorityGraphStoreFromRecorded: recorded snapshot integrity failure — ` +
        `re-derived snapshotHash ${rederived} does not match stored ` +
        `${recorded.snapshotHash} (tampered or drifted recorded authority snapshot)`,
    );
  }
  return createAuthorityGraphStore(recorded.graph);
}

export function createAuthorityGraphStore(graph: AuthorityGraph): AuthorityGraphStore {
  // Capture a frozen snapshot so the store is an immutable injected input
  // (index §B/§D). Edges are frozen shallowly; their nested `permits` are
  // already read-only by type.
  const edges = Object.freeze(graph.edges.slice());
  const snapshot: AuthorityGraph = Object.freeze({ edges });
  const store: AuthorityGraphStore = {
    graph: snapshot,
    edgesFor: (principal, resource) =>
      principal === null || resource === null
        ? []
        : edges.filter(
            (e) => e.principal === principal && e.resource === resource,
          ),
  };
  return Object.freeze(store);
}

function dedupe<T>(values: readonly T[]): readonly T[] {
  const out: T[] = [];
  for (const v of values) if (!out.includes(v)) out.push(v);
  return out;
}

/**
 * The PURE ownership resolver (032): `(store, envelope) => OwnershipFact`. Binds
 * the envelope's declared principal/resource (`resourceRefs`, 031) to the
 * injected snapshot and returns the predicate FACT — NEVER a `Decision`.
 *
 * Resolves the `(principal, resource)` pair from the envelope's `resourceRefs`
 * (by `OwnershipRefKeys`, defaulting to `owner`/`resource`), then asks the store
 * for the matched edges. `bound` is true iff an edge binds the pair; the matched
 * relationships (`owns`/`joint`/`advisor`/`custodian`) and permitted actions ride
 * along for a downstream authority guard (034) to interpret.
 *
 * Pure & synchronous (kernel-purity §D, invariant #5): a deterministic function
 * of the snapshot + envelope only — no clock, RNG, or IO — so it replays
 * bit-identically. It NEVER authorizes EXECUTE and NEVER lowers friction
 * (index §B/§C): a missing ref or no matching edge simply yields `bound: false`.
 */
export function resolveOwnership(
  store: AuthorityGraphStore,
  envelope: IntentEnvelope,
  refKeys: OwnershipRefKeys = {},
): OwnershipFact {
  const principalKey = refKeys.principalKey ?? DEFAULT_PRINCIPAL_KEY;
  const resourceKey = refKeys.resourceKey ?? DEFAULT_RESOURCE_KEY;
  const refs = envelope.resourceRefs;
  const principal = refs?.[principalKey] ?? null;
  const resource = refs?.[resourceKey] ?? null;
  const edges = store.edgesFor(principal, resource);
  return {
    principal,
    resource,
    bound: edges.length > 0,
    relationships: dedupe(edges.map((e) => e.relationship)),
    permits: dedupe(edges.flatMap((e) => e.permits.actions)),
    edges,
  };
}
