import type {
  InMemoryOutcomeSink,
  OutcomeSink,
  RetrospectiveOutcome,
} from "@adjudicate/core";
import type { AuditStore } from "../store/index.js";
import type {
  DecisionAccuracyQuery,
  DecisionAccuracyResult,
  RetrospectiveOutcomeParsed,
} from "../schemas/outcome-reconciliation.js";

export interface CreateOutcomeReconciliationHandlerDeps {
  readonly sink: OutcomeSink;
  /**
   * Read-side: required for `decisionAccuracy`. Must expose `query` from
   * AuditStore plus a way to enumerate outcomes by intentHash. The
   * reference `InMemoryOutcomeSink` exposes `get(intentHash)` and `all()`.
   */
  readonly outcomeLookup?: InMemoryOutcomeSink | OutcomeLookup;
  readonly auditStore?: AuditStore;
}

export interface OutcomeLookup {
  get(intentHash: string): RetrospectiveOutcome | undefined;
}

export function createRecordOutcomeHandler(
  deps: Pick<CreateOutcomeReconciliationHandlerDeps, "sink">,
): (input: RetrospectiveOutcomeParsed) => Promise<{ ok: true }> {
  return async (input) => {
    await deps.sink.recordOutcome(input);
    return { ok: true };
  };
}

export function createDecisionAccuracyHandler(
  deps: Required<
    Pick<
      CreateOutcomeReconciliationHandlerDeps,
      "auditStore" | "outcomeLookup"
    >
  >,
): (input: DecisionAccuracyQuery) => Promise<DecisionAccuracyResult> {
  return async (input) => {
    const { records } = await deps.auditStore.query({
      since: input.since,
      ...(input.until ? { until: input.until } : {}),
      decisionKind: "EXECUTE",
      limit: 500,
    });
    let succeeded = 0;
    let failed = 0;
    let withdrawn = 0;
    let matched = 0;
    for (const r of records) {
      const o = deps.outcomeLookup.get(r.intentHash);
      if (!o) continue;
      matched += 1;
      if (o.observed === "succeeded") succeeded += 1;
      else if (o.observed === "failed") failed += 1;
      else withdrawn += 1;
    }
    return {
      total: records.length,
      matched,
      succeeded,
      failed,
      withdrawn,
    };
  };
}
