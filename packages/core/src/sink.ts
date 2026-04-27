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
