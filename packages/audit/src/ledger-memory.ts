/**
 * In-memory ledger — for unit tests and for boot-time scenarios before Redis
 * is available. Not suitable for production; there is no persistence and no
 * TTL enforcement.
 */

import type {
  Ledger,
  LedgerHit,
  LedgerRecordInput,
  LedgerRecordOutcome,
} from "./ledger.js";

export function createMemoryLedger(): Ledger {
  const store = new Map<string, LedgerHit>();
  return {
    async checkLedger(intentHash) {
      return store.get(intentHash) ?? null;
    },
    async recordExecution(
      entry: LedgerRecordInput,
    ): Promise<LedgerRecordOutcome> {
      // SET NX semantics — first writer wins. Returns "exists" so the
      // kernel can flip a racing EXECUTE to REPLAY_SUPPRESSED.
      if (store.has(entry.intentHash)) return "exists";
      store.set(entry.intentHash, {
        resourceVersion: entry.resourceVersion,
        at: new Date().toISOString(),
        sessionId: entry.sessionId,
        kind: entry.kind,
      });
      return "acquired";
    },
  };
}
