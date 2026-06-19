import type { AuditRecord } from "@adjudicate/core";
import type { AuditRecordVerification } from "@adjudicate/core";

/**
 * 113 — pure case-correlation for the Investigations surface.
 *
 * The Investigations/cases surface lets an OBSERVER pivot from a SINGLE audit
 * record (by `intentHash`) into a correlated CASE view. A "case" is the set of
 * audit records that belong to the same investigation context, derived purely
 * from the kernel-recorded facts already present on every `AuditRecord`:
 *
 *   1. SESSION correlation — records sharing the seed record's
 *      `envelope.actor.sessionId` (the stream a decision belongs to). This is
 *      the same "stream" the 093 hash chain is grouped by.
 *   2. LINEAGE correlation — the supersession links
 *      (`supersedes.predecessorIntentHash`) that connect a record to the prior
 *      record it superseded (confirmation_resolved / defer_resumed /
 *      rewrite_executed / replay / budget_satisfied / lgpd_scrub). A
 *      superseding record may carry a predecessor in ANOTHER session window, so
 *      lineage is followed transitively across the supplied window even when the
 *      predecessor's session differs.
 *
 * This module is PURE: no I/O, no clock, no randomness. It is given the records
 * (fetched by the read-only `audit.query` / `audit.byHash*` procedures) and the
 * seed `intentHash`, and returns the correlated, ordered case. It NEVER mutates
 * an input, makes NO decision, and weakens NOTHING — it only composes FACTS,
 * consistent with §C monotonicity and constitutional invariant #1 (the ops
 * plane has zero mutation authority). It cannot, by construction, authorize.
 *
 * Correlation is window-scoped: it correlates over the records SUPPLIED (the
 * page the read procedures returned), so it is an investigation SIGNAL over the
 * fetched window, never a global proof — exactly like the 093 chain-continuity
 * signal the Audit Explorer renders.
 */

/** A correlation reason links a case member back to the seed/lineage. */
export type CaseLinkReason =
  | "seed"
  | "same_session"
  | "lineage_predecessor"
  | "lineage_successor";

/** A single record in a correlated case, tagged with WHY it belongs. */
export interface CaseMember {
  readonly record: AuditRecord;
  /** Index-aligned verify-on-read verdict for this member, if the store supplied one. */
  readonly verification: AuditRecordVerification | undefined;
  /** Why this record is part of the case (relative to the seed). */
  readonly reason: CaseLinkReason;
}

/** The correlated case view returned to the Investigations surface. */
export interface CorrelatedCase {
  /** The intent hash the investigation pivoted from. */
  readonly seedIntentHash: string;
  /**
   * The session the case is grouped on (the seed record's
   * `envelope.actor.sessionId`). `undefined` when the seed is not present in the
   * supplied window (the surface then renders an empty/not-found case).
   */
  readonly sessionId: string | undefined;
  /**
   * The correlated records, ORDERED by their decision timestamp (`at`) ascending
   * so the case reads as a timeline; ties break by `intentHash` for determinism.
   * The seed is always included (when present in the window).
   */
  readonly members: readonly CaseMember[];
  /** Whether the seed record was found in the supplied window. */
  readonly seedFound: boolean;
}

/**
 * The shape the correlation consumes — the `audit.query` result projected to the
 * fields the case view needs (records + index-aligned verifications). Accepting a
 * structural subset keeps this helper decoupled from the exact wire schema.
 */
export interface CaseCorrelationInput {
  readonly records: readonly AuditRecord[];
  readonly verifications?: readonly AuditRecordVerification[] | undefined;
}

/**
 * Build a correlated case from a window of audit records and a seed intent hash.
 *
 * Pure + deterministic: given identical inputs it returns an identical case.
 * Performs NO mutation — every member is a reference to a record from the input
 * array, never a copy that re-validates or re-derives anything.
 */
export function correlateCase(
  input: CaseCorrelationInput,
  seedIntentHash: string,
): CorrelatedCase {
  const records = input.records;
  const verifications = input.verifications;

  // Index records by intentHash so lineage links resolve in O(1). The first
  // record for a hash wins (audit hashes are content-addressed and unique in a
  // well-formed window; a defensive first-wins keeps this deterministic).
  const byHash = new Map<string, { record: AuditRecord; index: number }>();
  records.forEach((record, index) => {
    if (!byHash.has(record.intentHash)) {
      byHash.set(record.intentHash, { record, index });
    }
  });

  const seed = byHash.get(seedIntentHash);
  if (seed === undefined) {
    // Seed not in window — the surface renders "no case found for this hash".
    return {
      seedIntentHash,
      sessionId: undefined,
      members: [],
      seedFound: false,
    };
  }

  const sessionId = seed.record.envelope.actor.sessionId;

  // Collect case members keyed by intentHash with the STRONGEST reason seen
  // (seed > lineage > same_session — a more specific reason never downgrades to
  // a weaker one). `reason` is informational; membership is the union.
  const reasonRank: Record<CaseLinkReason, number> = {
    seed: 3,
    lineage_predecessor: 2,
    lineage_successor: 2,
    same_session: 1,
  };
  const chosen = new Map<string, CaseLinkReason>();
  const consider = (intentHash: string, reason: CaseLinkReason) => {
    const existing = chosen.get(intentHash);
    if (existing === undefined || reasonRank[reason] > reasonRank[existing]) {
      chosen.set(intentHash, reason);
    }
  };

  // 1. The seed itself.
  consider(seed.record.intentHash, "seed");

  // 2. Same-session records.
  for (const record of records) {
    if (record.envelope.actor.sessionId === sessionId) {
      consider(record.intentHash, "same_session");
    }
  }

  // 3. Lineage — walk predecessor links transitively from the seed (a record
  // points BACKWARD at the record it superseded). Predecessors may live in a
  // different session window, so they are pulled in regardless of session.
  let cursor: AuditRecord | undefined = seed.record;
  const visitedPred = new Set<string>();
  while (cursor !== undefined) {
    const predHash = cursor.supersedes?.predecessorIntentHash;
    if (predHash === undefined || visitedPred.has(predHash)) break;
    visitedPred.add(predHash);
    const pred = byHash.get(predHash);
    if (pred === undefined) break; // predecessor out of window — stop walking.
    consider(pred.record.intentHash, "lineage_predecessor");
    cursor = pred.record;
  }

  // 4. Lineage — successors: any record in the window whose predecessor link
  // (transitively) reaches the seed. We resolve forward by scanning for records
  // that supersede a member already in the case, iterating to a fixpoint so a
  // chain of successors all attach.
  let grew = true;
  while (grew) {
    grew = false;
    for (const record of records) {
      const predHash = record.supersedes?.predecessorIntentHash;
      if (predHash === undefined) continue;
      if (chosen.has(predHash) && !chosen.has(record.intentHash)) {
        consider(record.intentHash, "lineage_successor");
        grew = true;
      }
    }
  }

  // Materialize members in a deterministic timeline order: by `at` ascending,
  // ties broken by `intentHash`. Each member carries its index-aligned verdict.
  const members: CaseMember[] = [];
  for (const [intentHash, reason] of chosen) {
    const entry = byHash.get(intentHash);
    if (entry === undefined) continue;
    members.push({
      record: entry.record,
      verification: verifications?.[entry.index],
      reason,
    });
  }
  members.sort((a, b) => {
    if (a.record.at < b.record.at) return -1;
    if (a.record.at > b.record.at) return 1;
    return a.record.intentHash < b.record.intentHash ? -1 : 1;
  });

  return {
    seedIntentHash,
    sessionId,
    members,
    seedFound: true,
  };
}
