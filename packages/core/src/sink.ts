/**
 * AuditSink contract — durable governance trail.
 *
 * Lives in `@adjudicate/core` so the kernel-side audit emitter
 * (`adjudicateAndAudit`) can depend on it without inverting the package
 * dependency. `@adjudicate/audit` re-exports this interface and provides
 * the fan-out helpers (`multiSink`, `multiSinkLossy`, `bufferedSink`,
 * `persistentBufferedSink`) plus concrete sinks (Console, NATS).
 *
 * Distinct from the Execution Ledger:
 *   - AuditSink:  governance record of truth. Permanent.
 *   - Ledger:     execution dedup. 14d TTL. Lossy is recoverable.
 */

import type { AuditRecord } from "./audit.js";

export interface AuditSink {
  /**
   * Emit one record. Implementations rejecting their inner promise signal
   * a durable-write failure. Fan-out helpers in `@adjudicate/audit` decide
   * whether to swallow (lossy) or propagate (strict).
   *
   * Implementation requirements:
   *
   *   - Idempotency: the same record (keyed by its `auditHash`) may be
   *     emitted more than once — on retries, buffer flushes, or fan-out
   *     re-delivery. Implementations MUST treat re-emission of an
   *     already-persisted record as a no-op (e.g. upsert on `auditHash`)
   *     rather than appending a duplicate row.
   *   - Ordering: emission order is NOT guaranteed to be causal or
   *     monotonic. Buffered and multi-sink wrappers may reorder or
   *     interleave records. Implementations MUST NOT assume records arrive
   *     in decision order; reconstruct ordering from record fields (e.g.
   *     timestamps / supersession links), never from arrival order.
   *   - Durability: resolve the promise ONLY after the record is durably
   *     committed (fsync'd / acknowledged by the backing store). Resolving
   *     early defeats the strict fan-out path, which relies on a rejected
   *     promise to detect and surface durable-write failures.
   */
  emit(record: AuditRecord): Promise<void>;
}

/**
 * Built-in no-op sink. Useful when an entry point's signature requires a
 * sink but the caller has not wired one — e.g., `adjudicateAndLearn`
 * delegating to `adjudicateAndAudit({ sink: noopAuditSink() })`.
 *
 * Adopters in production should NOT wire this — emission would be silent.
 */
export function noopAuditSink(): AuditSink {
  return {
    async emit() {
      /* intentional no-op */
    },
  };
}
