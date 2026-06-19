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
  /**
   * The LOGICAL inter-record link — the predecessor's ENVELOPE content hash
   * (`supersedes.predecessorIntentHash`). Present when this node supersedes a
   * prior record. Distinct from `prevAuditHash`: it cannot detect a deleted or
   * reordered record (it is a content-address re-used as a logical pointer).
   */
  readonly predecessorIntentHash?: string;
  /**
   * 093 — this record's own `auditHash` (the per-stream cryptographic TIP this
   * node contributes to the chain). Present for v4+ records. Surfaced so the
   * report can expose the cryptographic chain alongside the logical
   * supersession links.
   */
  readonly auditHash?: string;
  /**
   * 093 — the CRYPTOGRAPHIC inter-record link: the `auditHash` of the
   * immediately-preceding record this node binds to (`record.prevAuditHash`).
   * Distinct from `predecessorIntentHash` (a logical envelope hash): a mismatch
   * between this and the actual predecessor's `auditHash` is a hard chain break
   * (surfaced in `chainBreaks`), detecting deletion/reorder.
   */
  readonly prevAuditHash?: string;
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
  /**
   * Diagnostic: chains containing a cycle (A→B→…→A). Cycles are not
   * possible by construction in legitimate workloads, so any entry here
   * indicates an adversarial input, a hash collision, or a producer bug.
   * The chain is emitted with `head` = first node in the cycle and
   * `tail` = the loop walked once until the cycle closes. Operators
   * should investigate.
   */
  readonly cycles: ReadonlyArray<SupersessionChain>;
  /**
   * Diagnostic: records whose `intentHash` is the predecessor of more
   * than one other record. The canonical shape is the LGPD/GDPR
   * per-surface scrub fan-out: one customer-anonymize root + N
   * `lgpd_scrub` records, all carrying `supersedes.predecessorIntentHash`
   * pointing at the root. Each fork shows up as its own chain in
   * `chains` — `forks` is the index that lets dashboards report
   * "1 forked anonymize → 7 surfaces" instead of "7 unrelated chains".
   */
  readonly forks: ReadonlyArray<{
    readonly predecessorIntentHash: string;
    readonly successorIntentHashes: ReadonlyArray<string>;
  }>;
  /** Aggregate reason counts across every chain in the report. */
  readonly aggregateReasonCounts: Readonly<Record<SupersessionReason, number>>;
  /**
   * 093 — CRYPTOGRAPHIC chain breaks, surfaced DISTINCTLY from the logical
   * `predecessorIntentHash` link. An entry is emitted when a record carries a
   * `prevAuditHash` (the cryptographic per-stream tip) that does NOT equal the
   * `auditHash` of its resolved supersession predecessor — i.e. the logical link
   * resolved to a record, but the cryptographic link to that record is broken
   * (the predecessor was substituted, or the recorded link drifted). This is the
   * detection the logical link alone cannot provide: `predecessorIntentHash`
   * walks the chain; `prevAuditHash` proves the walked predecessor is the
   * authentic one.
   */
  readonly chainBreaks: ReadonlyArray<{
    readonly intentHash: string;
    /** The record's `prevAuditHash` (the cryptographic link it claims). */
    readonly prevAuditHash: string;
    /** The resolved predecessor's actual `auditHash` (what the link should be). */
    readonly predecessorAuditHash: string | undefined;
    /** The logical link the walk resolved by (for cross-referencing). */
    readonly predecessorIntentHash: string;
  }>;
}

const REASON_KEYS: ReadonlyArray<SupersessionReason> = [
  "confirmation_resolved",
  "defer_resumed",
  "rewrite_executed",
  "replay",
  // 025 — capabilities-as-budgets: a budget-satisfied EXECUTE supersedes the
  // REQUEST_CONFIRMATION it was substituted for.
  "budget_satisfied",
  "lgpd_scrub",
];

function emptyReasonCounts(): Record<SupersessionReason, number> {
  return {
    confirmation_resolved: 0,
    defer_resumed: 0,
    rewrite_executed: 0,
    replay: 0,
    budget_satisfied: 0,
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
    // 093 — surface the cryptographic tip (this record's own auditHash) and the
    // cryptographic link (prevAuditHash) alongside the logical supersession link.
    ...(record.auditHash !== undefined ? { auditHash: record.auditHash } : {}),
    ...(record.prevAuditHash !== undefined
      ? { prevAuditHash: record.prevAuditHash }
      : {}),
  };
}

/**
 * Reconstruct supersession chains from an input set of audit records.
 *
 * Algorithm:
 *
 *   1. Build a hash → record map.
 *   2. Build a hash → successors map (who supersedes me — multimap so
 *      LGPD scrub fan-outs surface as a `forks` entry instead of being
 *      collapsed to the last writer).
 *   3. Walk every record that has no successor — those are the *heads*
 *      of their chains. From each head, follow `supersedes` backwards
 *      to reach the original.
 *   4. Records that have no predecessor and no successor are emitted
 *      as `singletons`.
 *   5. Cycles (A→B→…→A) are detected via a per-walk `visited` set; on
 *      revisit, the chain is emitted to `cycles` instead of `chains`.
 *
 * Cycles are not possible by construction in legitimate workloads, but
 * the guard is real (not just a comment) so adversarial input or hash
 * collisions don't silently vanish from the report.
 */
/**
 * LogicReviewer-003: resolve a predecessor record from the multi-valued
 * `byHash` index. When a single record carries the hash, return it. When two
 * or more share it (the confirmation-resolved case: REQUEST_CONFIRMATION and
 * its EXECUTE successor share the envelope intentHash), prefer the one whose
 * `at` matches `predecessorAt`; fall back to the first-inserted record
 * (chronologically the predecessor) when no `at` match is found.
 */
function findRecord(
  byHash: Map<string, AuditRecord[]>,
  hash: string,
  predecessorAt?: string,
): AuditRecord | undefined {
  const bucket = byHash.get(hash);
  if (bucket === undefined) return undefined;
  if (bucket.length === 1 || predecessorAt === undefined) return bucket[0];
  return bucket.find((r) => r.at === predecessorAt) ?? bucket[0];
}

export function buildSupersessionChains(
  records: ReadonlyArray<AuditRecord>,
): SupersessionChainReport {
  // LogicReviewer-003: a confirmation-resolved EXECUTE record and its
  // predecessor REQUEST_CONFIRMATION record share the same `intentHash`
  // (the envelope's intentHash). Keying `byHash` on intentHash alone made the
  // last writer silently overwrite the first, which then made the back-walk
  // see `predecessorIntentHash === head.intentHash` and flag a false cycle.
  // Store ALL records per intentHash and disambiguate by `at` at lookup time.
  const byHash = new Map<string, AuditRecord[]>();
  for (const r of records) {
    const bucket = byHash.get(r.intentHash);
    if (bucket === undefined) byHash.set(r.intentHash, [r]);
    else bucket.push(r);
  }

  const successorsOf = new Map<string, string[]>();
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
    const existing = successorsOf.get(s.predecessorIntentHash);
    if (existing === undefined) {
      successorsOf.set(s.predecessorIntentHash, [r.intentHash]);
    } else {
      existing.push(r.intentHash);
    }
  }

  // Heads = records that no OTHER record supersedes. We resolve each
  // supersedes link to the concrete predecessor *record* (identity, via
  // findRecord) and mark it superseded — but only when the predecessor is a
  // distinct record from the successor. LogicReviewer-003: in the
  // confirmation-resolved flow the EXECUTE successor and its
  // REQUEST_CONFIRMATION predecessor share `intentHash`, so a hash-keyed
  // `successorsOf.has(r.intentHash)` test wrongly excludes the genuine head.
  // Reference-identity disambiguation keeps the EXECUTE record as the head.
  const superseded = new Set<AuditRecord>();
  for (const r of records) {
    if (r.supersedes === undefined) continue;
    const prev = findRecord(
      byHash,
      r.supersedes.predecessorIntentHash,
      r.supersedes.predecessorAt,
    );
    if (prev !== undefined && prev !== r) superseded.add(prev);
  }
  const heads: AuditRecord[] = [];
  for (const r of records) {
    if (!superseded.has(r)) heads.push(r);
  }

  const chains: SupersessionChain[] = [];
  const cycles: SupersessionChain[] = [];
  const singletons: SupersessionChainNode[] = [];
  const aggregateReasonCounts = emptyReasonCounts();

  for (const head of heads) {
    const headNode = nodeOf(head);
    const tail: SupersessionChainNode[] = [];
    const reasonCounts = emptyReasonCounts();
    // LogicReviewer-003: track visited *records* by reference, not by
    // intentHash. Two records can legitimately share a hash (confirmation
    // flow), so a hash-keyed visited set produces a false cycle on the first
    // back-step. Reference identity only fires on a genuine record revisit.
    const visited = new Set<AuditRecord>([head]);

    let cursor: AuditRecord | undefined = head;
    let cycleDetected = false;
    while (cursor?.supersedes !== undefined) {
      const r = cursor.supersedes.reason;
      const prevHash = cursor.supersedes.predecessorIntentHash;
      const prev = findRecord(byHash, prevHash, cursor.supersedes.predecessorAt);
      if (prev === undefined) break; // dangling — separately reported, not counted
      if (visited.has(prev)) {
        // Cycle: the predecessor record was already in this walk. Emit the
        // partial chain to `cycles` (operators investigate); do NOT
        // increment aggregate counters for the looping edge.
        cycleDetected = true;
        break;
      }
      visited.add(prev);
      reasonCounts[r]++;
      aggregateReasonCounts[r]++;
      tail.push(nodeOf(prev));
      cursor = prev;
    }

    if (cycleDetected) {
      cycles.push({
        head: headNode,
        tail,
        reasonCounts,
        length: 1 + tail.length,
      });
      continue;
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

  // Pure-cycle component salvage: records that are part of a cycle but
  // never picked up as a head (because every node in the cycle has a
  // successor) would otherwise silently vanish. Detect them by finding
  // records absent from every chain/cycle/singleton/dangling collection,
  // then walk each unvisited record to surface its loop.
  const accountedFor = new Set<string>();
  for (const c of chains) {
    accountedFor.add(c.head.intentHash);
    for (const t of c.tail) accountedFor.add(t.intentHash);
  }
  for (const c of cycles) {
    accountedFor.add(c.head.intentHash);
    for (const t of c.tail) accountedFor.add(t.intentHash);
  }
  for (const s of singletons) accountedFor.add(s.intentHash);
  for (const d of dangling) accountedFor.add(d.intentHash);

  for (const r of records) {
    if (accountedFor.has(r.intentHash)) continue;
    // r is part of a pure-cycle component. Walk it.
    const tail: SupersessionChainNode[] = [];
    const reasonCounts = emptyReasonCounts();
    // Identity-keyed visited set (see main walker): hash-keying would
    // mis-close a walk when two records share an intentHash.
    const visited = new Set<AuditRecord>([r]);
    let cursor: AuditRecord | undefined = r;
    while (cursor?.supersedes !== undefined) {
      const prevHash = cursor.supersedes.predecessorIntentHash;
      const prev = findRecord(byHash, prevHash, cursor.supersedes.predecessorAt);
      if (prev === undefined) break;
      if (visited.has(prev)) break; // cycle closes
      visited.add(prev);
      reasonCounts[cursor.supersedes.reason]++;
      aggregateReasonCounts[cursor.supersedes.reason]++;
      tail.push(nodeOf(prev));
      cursor = prev;
    }
    cycles.push({
      head: nodeOf(r),
      tail,
      reasonCounts,
      length: 1 + tail.length,
    });
    accountedFor.add(r.intentHash);
    for (const t of tail) accountedFor.add(t.intentHash);
  }

  // Fork index: every predecessor with more than one successor.
  const forks: {
    predecessorIntentHash: string;
    successorIntentHashes: string[];
  }[] = [];
  for (const [predecessor, successors] of successorsOf) {
    if (successors.length > 1) {
      forks.push({
        predecessorIntentHash: predecessor,
        successorIntentHashes: [...successors].sort(),
      });
    }
  }

  // 093 — CRYPTOGRAPHIC chain-break detection, surfaced DISTINCTLY from the
  // logical `predecessorIntentHash` link. For every record that BOTH carries a
  // cryptographic link (`prevAuditHash`) AND supersedes a prior record we can
  // resolve, compare the link to the resolved predecessor's `auditHash`. A
  // mismatch means the logical walk found a predecessor but the cryptographic
  // binding to it is broken (the predecessor was substituted, or the link
  // drifted) — exactly the deletion/reorder the logical link cannot detect.
  const chainBreaks: {
    intentHash: string;
    prevAuditHash: string;
    predecessorAuditHash: string | undefined;
    predecessorIntentHash: string;
  }[] = [];
  for (const r of records) {
    if (r.prevAuditHash === undefined || r.supersedes === undefined) continue;
    const prev = findRecord(
      byHash,
      r.supersedes.predecessorIntentHash,
      r.supersedes.predecessorAt,
    );
    // Only assess when we resolved a DISTINCT predecessor record (the
    // confirmation-resolved flow shares an intentHash; `prev === r` is not a
    // cryptographic predecessor). An out-of-window predecessor (prev undefined)
    // is reported as a dangling logical link, not a cryptographic break.
    if (prev === undefined || prev === r) continue;
    if (prev.auditHash !== r.prevAuditHash) {
      chainBreaks.push({
        intentHash: r.intentHash,
        prevAuditHash: r.prevAuditHash,
        predecessorAuditHash: prev.auditHash,
        predecessorIntentHash: r.supersedes.predecessorIntentHash,
      });
    }
  }

  // Deterministic ordering across every emitted collection.
  chains.sort((a, b) => (a.head.intentHash < b.head.intentHash ? -1 : 1));
  cycles.sort((a, b) => (a.head.intentHash < b.head.intentHash ? -1 : 1));
  singletons.sort((a, b) => (a.intentHash < b.intentHash ? -1 : 1));
  dangling.sort((a, b) => (a.intentHash < b.intentHash ? -1 : 1));
  forks.sort((a, b) =>
    a.predecessorIntentHash < b.predecessorIntentHash ? -1 : 1,
  );
  chainBreaks.sort((a, b) => (a.intentHash < b.intentHash ? -1 : 1));

  return {
    schemaVersion: 1,
    chains,
    singletons,
    danglingReferences: dangling,
    cycles,
    forks,
    aggregateReasonCounts,
    chainBreaks,
  };
}

/**
 * Render a one-line operator summary of the report:
 *
 *   "5 chains (avg length 2.4), 12 singletons, 0 dangling, 1 fork
 *    (LGPD scrub fan-out), 0 cycles — reasons:
 *    confirmation_resolved=3, defer_resumed=2, lgpd_scrub=7"
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
  const forkClause =
    report.forks.length > 0
      ? `, ${report.forks.length} fork${report.forks.length === 1 ? "" : "s"}`
      : "";
  const cycleClause =
    report.cycles.length > 0
      ? `, ${report.cycles.length} cycle${report.cycles.length === 1 ? "" : "s"}`
      : "";
  return `${report.chains.length} chain${report.chains.length === 1 ? "" : "s"} (avg length ${avg.toFixed(1)}), ${report.singletons.length} singleton${report.singletons.length === 1 ? "" : "s"}, ${report.danglingReferences.length} dangling${forkClause}${cycleClause}${reasonClause}`;
}
