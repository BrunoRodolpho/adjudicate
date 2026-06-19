/**
 * Execution Ledger contract.
 *
 * As of the kernel-side audit refactor (T1), the Ledger contract lives in
 * `@adjudicate/core` so the kernel-side `adjudicateAndAudit` can depend
 * on it without inverting the package dependency. This module re-exports
 * the interfaces; the implementations (`createRedisLedger`,
 * `createMemoryLedger`) remain in this package.
 *
 * ── 052 — the recorded aggregate snapshot persists on the AuditRecord ───────
 * The Execution Ledger is the HOT-PATH dedup record (intentHash → executed); it
 * is deliberately NOT the governance record of truth. The 052 aggregate/limit
 * snapshot is RECORDED into the durable, replayable governance record — the
 * `AuditRecord.aggregateSnapshot` field (`@adjudicate/core` audit.ts) — which is
 * bound into the tamper-evident `auditHash` pre-image and carried VERBATIM by
 * this package's replay/integrity path (`replay.ts`, `replay-integrity.ts`,
 * which take `AuditRecord[]` as-is). Re-running the pure kernel over the recorded
 * snapshot (`aggregateSnapshotFromRecorded`) reproduces the byte-identical
 * decision (§D-5, invariant #5). See `tests/ledger.test.ts` for the
 * persists-through-the-record round-trip.
 */

export type {
  Ledger,
  LedgerHit,
  LedgerRecordInput,
  LedgerRecordOutcome,
} from "@adjudicate/core";
