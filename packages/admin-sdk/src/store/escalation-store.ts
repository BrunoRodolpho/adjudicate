import type {
  Actor,
  EscalateRecommendation,
  RecordedEscalation,
} from "../schemas/emergency.js";

/**
 * One operator escalation/recommendation to be recorded.
 *
 * The `actor` is the (auth-gate-trusted) raiser; `intentHash` keys the
 * escalation to a real audited decision the surface already resolved read-only.
 */
export interface EscalationRecordRequest {
  readonly intentHash: string;
  readonly recommendation: EscalateRecommendation;
  readonly reason: string;
  readonly actor: Actor;
}

/**
 * Adopter-implemented sink for the ONE friction-monotone write the Adjudicant
 * (Inspector-General) OBSERVER plane is permitted: recording an escalation /
 * recommendation FACT against an audited decision (114).
 *
 * The sink is FEATURE-DETECTED on `AdminContext` (like every other optional
 * port): when a host omits it (e.g. a pure read-only plane), `escalate.raise`
 * throws PRECONDITION_FAILED rather than silently succeeding.
 *
 * Implementations MUST:
 *   - Append-only record the escalation as a FACT (never a `Decision`); the
 *     kernel decision hot-path is untouched and stays fail-closed.
 *   - Return history newest-first.
 *
 * Implementations MUST NOT:
 *   - Mutate or weaken any kernel `Decision`, threshold, or refusal — this is a
 *     friction-INCREASING record only (§C/§D inv.7 monotonicity).
 *
 * FAIL-OPEN (governance plane only): a durable implementation MAY follow the
 * `createDurableEmergencyStore` precedent — record into the live (e.g. memory /
 * Redis) sink, then fire-and-forget the durable log write, logging (not
 * throwing) on log-infra failure. Operator escalation succeeds even under
 * degraded log infra; this fail-OPEN is isolated to the governance plane and
 * NEVER touches the decision hot-path (which remains fail-closed).
 */
export interface EscalationSink {
  record(input: EscalationRecordRequest): Promise<RecordedEscalation>;
  history(limit: number): Promise<readonly RecordedEscalation[]>;
}

/**
 * Default cap on retained escalation records for the in-memory sink. High
 * enough that a real escalation timeline is never truncated in practice, low
 * enough that a long-lived process cannot grow the array without bound.
 */
export const DEFAULT_MAX_ESCALATIONS = 10_000;

export interface InMemoryEscalationSinkOptions {
  /** Hard cap on retained escalation records (newest-first). */
  readonly maxRecords?: number;
}

/**
 * Reference in-memory `EscalationSink`. Drives the SDK's tests and the
 * Adjudicant observer app's dev mode. Adopters with durable governance logs
 * implement `EscalationSink` against Postgres/Redis (fail-OPEN on the log write
 * per the JSDoc above).
 */
export function createInMemoryEscalationSink(
  opts: InMemoryEscalationSinkOptions = {},
): EscalationSink {
  const records: RecordedEscalation[] = [];
  const requestedMax = opts.maxRecords ?? DEFAULT_MAX_ESCALATIONS;
  // A non-positive cap would discard every record on write; clamp to >= 1.
  const maxRecords = requestedMax > 0 ? Math.floor(requestedMax) : 1;

  return {
    async record(
      input: EscalationRecordRequest,
    ): Promise<RecordedEscalation> {
      const record: RecordedEscalation = {
        id: globalThis.crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "escalation.raised",
        intentHash: input.intentHash,
        recommendation: input.recommendation,
        reason: input.reason,
        raisedBy: input.actor,
      };
      records.unshift(record);
      if (records.length > maxRecords) records.length = maxRecords;
      return record;
    },

    async history(limit: number): Promise<readonly RecordedEscalation[]> {
      return records.slice(0, limit);
    },
  };
}
