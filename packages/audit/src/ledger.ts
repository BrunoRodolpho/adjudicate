/**
 * Execution Ledger contract.
 *
 * As of the kernel-side audit refactor (T1), the Ledger contract lives in
 * `@adjudicate/core` so the kernel-side `adjudicateAndAudit` can depend
 * on it without inverting the package dependency. This module re-exports
 * the interfaces; the implementations (`createRedisLedger`,
 * `createMemoryLedger`) remain in this package.
 */

export type {
  Ledger,
  LedgerHit,
  LedgerRecordInput,
  LedgerRecordOutcome,
} from "@adjudicate/core";
