import {
  createInMemoryEscalationSink,
  type EscalationSink,
  type EscalationRecordRequest,
  type RecordedEscalation,
} from "@adjudicate/admin-sdk";

/**
 * Durable governance log for operator escalations (114). An adopter implements
 * this against Postgres/Redis; the canonical home is the same governance log
 * that backs the kill-switch timeline.
 */
export interface EscalationLog {
  insert(record: RecordedEscalation): Promise<void>;
  history(limit: number): Promise<readonly RecordedEscalation[]>;
}

export interface DurableEscalationSinkOptions {
  /**
   * The live sink backend. Pluggable: in-memory (default) for single-process
   * dev, a cross-replica store for production.
   */
  readonly liveSink?: EscalationSink;
  /** Durable escalation event log. Postgres is the canonical home. */
  readonly log: EscalationLog;
}

/**
 * Composite escalation sink: pluggable live backend + durable log — the 114
 * analog of `apps/console/src/lib/durable-emergency-store.ts`.
 *
 * FAIL-OPEN within the governance plane (operator-action precedence): on a
 * failure to write the durable log, log to console but do NOT throw. The
 * operator's escalation has already been recorded in the live system; only the
 * durable audit-trail entry was lost. This matches the kill-switch governance
 * log's fail-OPEN posture exactly:
 *
 *   "Operator action takes precedence over audit completeness in incident
 *    response — a kill-switch must work even when other infra is degraded."
 *
 * CRITICAL boundary: this fail-OPEN is ISOLATED to the governance plane. It
 * never touches the kernel decision hot-path, which stays fail-CLOSED. And the
 * escalation is friction-MONOTONE regardless — recording (or failing to durably
 * log) an escalation can only INCREASE friction, never authorize, weaken, or
 * lower a threshold (§C / §D inv.7).
 */
export function createDurableEscalationSink(
  opts: DurableEscalationSinkOptions,
): EscalationSink {
  const live = opts.liveSink ?? createInMemoryEscalationSink();

  return {
    async record(
      input: EscalationRecordRequest,
    ): Promise<RecordedEscalation> {
      const record = await live.record(input);
      try {
        await opts.log.insert(record);
      } catch (err) {
        // Fire-and-forget: the live record already exists. Operator escalation
        // succeeds even under degraded log infra; only the durable trail entry
        // was lost. TODO: surface via the metrics sink for observability.
        console.error(
          "[adjudicant] failed to write escalation to the durable log:",
          err,
        );
      }
      return record;
    },

    async history(limit: number): Promise<readonly RecordedEscalation[]> {
      // Read durable history (survives process restarts) when wired.
      return opts.log.history(limit);
    },
  };
}
