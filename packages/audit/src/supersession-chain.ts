/**
 * Supersession-chain analytics — walks a set of AuditRecord objects and
 * reconstructs the chains formed by `supersedes` links (AuditRecord v3+).
 *
 * Each record may carry a `supersedes` field pointing back to a prior
 * record's `intentHash`. Chains form because:
 *
 *   - REQUEST_CONFIRMATION resolves → the resolution record carries
 *     `supersedes` back to the awaiting record;
 *   - DEFER resumes → the resumed record carries `supersedes` back to
 *     the parked record;
 *   - REWRITE executes → the execution record carries `supersedes` back
 *     to the rewrite-issuing record;
 *   - replay records carry `supersedes` back to the original;
 *   - LGPD/GDPR per-surface scrub records carry `supersedes` back to the
 *     originating customer-anonymize envelope.
 *
 * Operators triaging "what happened to this intent over time" walk these
 * chains. Without this primitive every adopter would re-implement the
 * walk; now there is one canonical implementation.
 *
 * Pure: no I/O, no clock, no RNG. Deterministic ordering. Bounded in
 * cardinality by the input set size.
 */

import type { AuditRecord, SupersessionReason } from "@adjudicate/core";

export interface SupersessionChainNode {
  readonly intentHash: string;
  readonly decisionKind: AuditRecord["decision"]["kind"];
  readonly at: string;
  readonly reason?: SupersessionReason;
  readonly predecessorIntentHash?: string;
}

export interface SupersessionChain {
  /**
   * Head of the chain — the *latest* record. Chains are emitted
   * head-first because operators typically start at the most recent
   * event and walk backwards.
   */
  readonly head: SupersessionChainNode;
  /**
   * Tail nodes in oldest-first order. `[head, ...tail.reverse()]` would
   * read chronologically; `[head, ...tail]` reads in reverse-chrono.
   */
  readonly tail: ReadonlyArray<SupersessionChainNode>;
  /** Reason taxonomy summary — counts per supersession reason in this chain. */
  readonly reasonCounts: Readonly<Record<SupersessionReason, number>>;
  readonly length: number;
}

export interface SupersessionChainReport {
  readonly schemaVersion: 1;
  /** Every full chain in the input set. */
  readonly chains: ReadonlyArray<SupersessionChain>;
  /** Records observed but never referenced and never carrying supersedes. */
  readonly singletons: ReadonlyArray<SupersessionChainNode>;
  /**
   * Diagnostic: records whose `supersedes.predecessorIntentHash` does
   * not appear in the input set. May indicate a partial window or a
   * legitimately external predecessor (e.g., from a sibling tenant).
   */
  readonly danglingReferences: ReadonlyArray<{
    readonly intentHash: string;
    readonly missingPredecessor: string;
  }>;
  /** Aggregate reason counts across every chain in the report. */
  readonly aggregateReasonCounts: Readonly<Record<SupersessionReason, number>>;
}

const REASON_KEYS: ReadonlyArray<SupersessionReason> = [
  "confirmation_resolved",
  "defer_resumed",
  "rewrite_executed",
  "replay",
  "lgpd_scrub",
];

function emptyReasonCounts(): Record<SupersessionReason, number> {
  return {
    confirmation_resolved: 0,
    defer_resumed: 0,
    rewrite_executed: 0,
    replay: 0,
    lgpd_scrub: 0,
  };
}

function nodeOf(record: AuditRecord): SupersessionChainNode {
  return {
    intentHash: record.intentHash,
    decisionKind: record.decision.kind,
    at: record.at,
    ...(record.supersedes !== undefined
      ? {
          reason: record.supersedes.reason,
          predecessorIntentHash: record.supersedes.predecessorIntentHash,
        }
      : {}),
  };
}

/**
 * Reconstruct supersession chains from an input set of audit records.
 *
 * Algorithm:
 *
 *   1. Build a hash → record map.
 *   2. Build a hash → successor map (who supersedes me).
 *   3. Walk every record that has no successor — those are the *heads*
 *      of their chains. From each head, follow `supersedes` backwards
 *      to reach the original.
 *   4. Records that have no predecessor and no successor are emitted
 *      as `singletons`.
 *
 * Cycles are not possible by construction (supersedes points backwards
 * in time, and the build is hash-keyed) — but to be robust against
 * adversarial inputs the walk is bounded by `records.length`.
 */
export function buildSupersessionChains(
  records: ReadonlyArray<AuditRecord>,
): SupersessionChainReport {
  const byHash = new Map<string, AuditRecord>();
  for (const r of records) byHash.set(r.intentHash, r);

  const successorOf = new Map<string, string>();
  const dangling: { intentHash: string; missingPredecessor: string }[] = [];

  for (const r of records) {
    const s = r.supersedes;
    if (s === undefined) continue;
    if (!byHash.has(s.predecessorIntentHash)) {
      dangling.push({
        intentHash: r.intentHash,
        missingPredecessor: s.predecessorIntentHash,
      });
      continue;
    }
    successorOf.set(s.predecessorIntentHash, r.intentHash);
  }

  // Heads = records that are not a predecessor of any other record.
  const heads: AuditRecord[] = [];
  for (const r of records) {
    if (!successorOf.has(r.intentHash)) heads.push(r);
  }

  const chains: SupersessionChain[] = [];
  const singletons: SupersessionChainNode[] = [];
  const aggregateReasonCounts = emptyReasonCounts();

  for (const head of heads) {
    const headNode = nodeOf(head);
    const tail: SupersessionChainNode[] = [];
    const reasonCounts = emptyReasonCounts();

    let cursor: AuditRecord | undefined = head;
    let steps = 0;
    while (cursor?.supersedes !== undefined && steps < records.length) {
      const r = cursor.supersedes.reason;
      const prev = byHash.get(cursor.supersedes.predecessorIntentHash);
      if (prev === undefined) break; // dangling — separately reported, not counted
      reasonCounts[r]++;
      aggregateReasonCounts[r]++;
      tail.push(nodeOf(prev));
      cursor = prev;
      steps++;
    }

    if (tail.length === 0) {
      // No walkable history. A record with no supersedes is a true
      // singleton; a record whose supersedes points outside the input
      // is already recorded in `danglingReferences` — emit neither a
      // chain nor a singleton for it.
      if (head.supersedes === undefined) singletons.push(headNode);
      continue;
    }

    chains.push({
      head: headNode,
      tail,
      reasonCounts,
      length: 1 + tail.length,
    });
  }

  // Deterministic ordering: chains sorted by head.intentHash; singletons
  // sorted by intentHash; dangling sorted by intentHash.
  chains.sort((a, b) => (a.head.intentHash < b.head.intentHash ? -1 : 1));
  singletons.sort((a, b) => (a.intentHash < b.intentHash ? -1 : 1));
  dangling.sort((a, b) => (a.intentHash < b.intentHash ? -1 : 1));

  return {
    schemaVersion: 1,
    chains,
    singletons,
    danglingReferences: dangling,
    aggregateReasonCounts,
  };
}

/**
 * Render a one-line operator summary of the report:
 *
 *   "5 chains (avg length 2.4), 12 singletons, 0 dangling — reasons:
 *    confirmation_resolved=3, defer_resumed=2"
 */
export function explainSupersessionChainReport(
  report: SupersessionChainReport,
): string {
  const avg =
    report.chains.length === 0
      ? 0
      : report.chains.reduce((acc, c) => acc + c.length, 0) /
        report.chains.length;
  const reasons = REASON_KEYS.filter(
    (k) => (report.aggregateReasonCounts[k] ?? 0) > 0,
  )
    .map((k) => `${k}=${report.aggregateReasonCounts[k] ?? 0}`)
    .join(", ");
  const reasonClause = reasons.length > 0 ? ` — reasons: ${reasons}` : "";
  return `${report.chains.length} chain${report.chains.length === 1 ? "" : "s"} (avg length ${avg.toFixed(1)}), ${report.singletons.length} singleton${report.singletons.length === 1 ? "" : "s"}, ${report.danglingReferences.length} dangling${reasonClause}`;
}
