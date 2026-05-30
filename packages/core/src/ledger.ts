/**
 * Execution Ledger contract — hot-path replay/dedup.
 *
 * Lives in `@adjudicate/core` so the kernel can depend on it without inverting
 * the package dependency. `@adjudicate/audit` re-exports this interface and
 * provides the Redis/Memory implementations.
 *
 * Purpose: "has this intentHash already been executed against a current
 * resourceVersion?" If yes, suppress re-execution. This is NOT the
 * governance record of truth — that is `AuditSink`.
 *
 * `recordExecution` returns a tag identifying whether the write claimed the
 * key (first writer) or found one already there. The kernel uses this tag
 * to flip an in-flight EXECUTE to REPLAY_SUPPRESSED when two parallel
 * adjudications race past `checkLedger` before either records.
 */

export interface LedgerHit {
  /**
   * resourceVersion recorded when the intent last executed.
   *
   * The empty string `""` is a LOAD-BEARING sentinel meaning "no resource
   * version" — callers with no version to bind an execution to record `""`
   * rather than omitting the field. The type stays a plain `string` (NOT
   * `string | null | undefined`) on purpose: replay/dedup compares the
   * recorded version for byte-equality, so a stored `""` only matches a
   * later attempt that also presents `""`. Widening to a nullable type
   * would silently change that comparison and the dedup semantics.
   */
  readonly resourceVersion: string;
  /** ISO-8601 timestamp of the recorded execution. */
  readonly at: string;
  /** Session that produced the recorded execution. */
  readonly sessionId: string;
  /** Intent kind, for quick triage without decoding the full envelope. */
  readonly kind: string;
}

export interface LedgerRecordInput {
  readonly intentHash: string;
  readonly resourceVersion: string;
  readonly sessionId: string;
  readonly kind: string;
}

export type LedgerRecordOutcome = "acquired" | "exists";

export interface Ledger {
  /**
   * Return a LedgerHit if this intentHash has been recorded within the TTL
   * window, otherwise null. Implementations MUST be idempotent — calling
   * twice returns the same hit.
   */
  checkLedger(intentHash: string): Promise<LedgerHit | null>;
  /**
   * Record that `intentHash` executed. Implementations use SET NX — first
   * writer wins. Returns:
   *   - "acquired": this caller wrote the entry.
   *   - "exists":   another writer was first; entry was not overwritten.
   *
   * Adopters built against the old `Promise<void>` shape continue to
   * COMPILE because the resolved value is structurally compatible with
   * `void` at the call site (TypeScript allows ignoring a typed return).
   *
   * WARNING: compiling is not the same as behaving correctly. Silently
   * discarding the returned tag is a behavioural REGRESSION — it forfeits
   * EXECUTE-race protection. The kernel relies on the "acquired"/"exists"
   * outcome to flip an in-flight EXECUTE to REPLAY_SUPPRESSED when two
   * parallel adjudications race past `checkLedger` before either records
   * (see this module's header). A `void`-shaped call site that ignores the
   * result loses that protection and can double-execute the racing intent,
   * so such call sites MUST be updated to inspect the outcome — not merely
   * left to type-check.
   */
  recordExecution(entry: LedgerRecordInput): Promise<LedgerRecordOutcome>;
}
