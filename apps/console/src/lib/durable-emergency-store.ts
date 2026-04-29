import {
  createInMemoryEmergencyStateStore,
  type EmergencyStateStore,
  type EmergencyUpdateRequest,
  type EmergencyUpdateResult,
} from "@adjudicate/admin-sdk";
import type { PostgresGovernanceLog } from "@adjudicate/audit-postgres";

export interface DurableEmergencyStoreOptions {
  /**
   * The state backend. Pluggable: in-memory (default) for single-process
   * dev, Redis-coordinated (Phase 1.5d) for cross-replica sync with the
   * kernel's DistributedKillSwitch.
   */
  readonly stateStore?: EmergencyStateStore;
  /** Durable governance event log. Postgres is the canonical home. */
  readonly log: PostgresGovernanceLog;
}

/**
 * Composite emergency-state store: pluggable state backend + durable
 * Postgres governance event log.
 *
 * Phase 1.5c shipped this as `in-memory + Postgres-log`. Phase 1.5d
 * generalized the state backend so a Redis-coordinated state store can
 * compose with the same Postgres log without duplicating the log-write
 * logic.
 *
 * Composition matrix:
 *   stateStore: in-memory    + log: pg → 1.5c shape (volatile state, durable log)
 *   stateStore: Redis        + log: pg → 1.5d shape (kernel-coordinated state + durable log)
 *   stateStore: omitted      + log: pg → defaults to in-memory (back-compat)
 *
 * On `update` failure to write to the log: log to console but do NOT
 * throw. Operator action takes precedence over audit completeness in
 * incident response — a kill-switch must work even when other infra is
 * degraded.
 */
export function createDurableEmergencyStore(
  opts: DurableEmergencyStoreOptions,
): EmergencyStateStore {
  const inner = opts.stateStore ?? createInMemoryEmergencyStateStore();

  return {
    async getState() {
      return inner.getState();
    },

    async update(
      input: EmergencyUpdateRequest,
    ): Promise<EmergencyUpdateResult> {
      const result = await inner.update(input);
      if (result.event) {
        try {
          await opts.log.insert(result.event);
        } catch (err) {
          // Fire-and-forget: state has already updated. The operator's
          // action is durable in the live system (Redis or in-memory);
          // only the audit trail entry was lost. TODO: surface this
          // via the metrics sink for observability.
          console.error(
            "[adjudicate] failed to write governance event to Postgres:",
            err,
          );
        }
      }
      return result;
    },

    async history(limit) {
      // Read durable history from Postgres, not the in-memory log.
      // Survives process restarts.
      return opts.log.history(limit);
    },
  };
}
