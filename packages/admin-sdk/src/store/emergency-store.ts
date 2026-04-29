import type {
  Actor,
  EmergencyState,
  EmergencyStatus,
  GovernanceEvent,
} from "../schemas/emergency.js";

export interface EmergencyUpdateRequest {
  readonly newStatus: EmergencyStatus;
  readonly reason: string;
  readonly actor: Actor;
}

export interface EmergencyUpdateResult {
  readonly state: EmergencyState;
  /**
   * The governance event recording the transition. `null` when the request
   * was an idempotent no-op (newStatus === currentStatus).
   */
  readonly event: GovernanceEvent | null;
}

/**
 * Adopter-implemented contract for reading + writing emergency state.
 *
 * Distinct from `AuditStore` (which holds kernel-emitted decision audits)
 * because emergency state is human-initiated and low-volume. An adopter
 * can wire AuditStore to Postgres for high-volume search and
 * EmergencyStateStore to Redis for fast cross-replica reads — different
 * latency/durability profiles, separately tunable.
 *
 * Implementations MUST:
 *   - Treat same-status updates as idempotent no-ops (return current
 *     state, emit no GovernanceEvent).
 *   - Persist the new state atomically with the governance event when
 *     status actually changes.
 *   - Return history newest-first.
 *
 * Implementations MUST NOT:
 *   - Mutate state without recording a governance event.
 *   - Allow events to outlive their state (orphaned events are governance
 *     poison).
 */
export interface EmergencyStateStore {
  getState(): Promise<EmergencyState>;
  update(input: EmergencyUpdateRequest): Promise<EmergencyUpdateResult>;
  history(limit: number): Promise<readonly GovernanceEvent[]>;
}

const SYSTEM_ACTOR: Actor = {
  id: "system",
  displayName: "system",
};

const DEFAULT_STATE: EmergencyState = {
  status: "NORMAL",
  reason: "Initial state — kill switch never engaged.",
  toggledAt: new Date(0).toISOString(),
  toggledBy: SYSTEM_ACTOR,
};

export interface InMemoryEmergencyStateStoreOptions {
  readonly initialState?: EmergencyState;
}

/**
 * Reference in-memory store. Drives the SDK's tests and the reference
 * console's dev mode. Adopters with cross-replica deployments implement
 * `EmergencyStateStore` against Redis (or similar) — the kernel's
 * `DistributedKillSwitch` already polls Redis, so a Redis-backed
 * implementation here closes the loop end-to-end.
 */
export function createInMemoryEmergencyStateStore(
  opts: InMemoryEmergencyStateStoreOptions = {},
): EmergencyStateStore {
  let currentState: EmergencyState = opts.initialState ?? DEFAULT_STATE;
  const events: GovernanceEvent[] = [];

  return {
    async getState(): Promise<EmergencyState> {
      return currentState;
    },

    async update(
      input: EmergencyUpdateRequest,
    ): Promise<EmergencyUpdateResult> {
      // Idempotent no-op: same status → no event, return unchanged state.
      if (input.newStatus === currentState.status) {
        return { state: currentState, event: null };
      }

      const at = new Date().toISOString();
      const event: GovernanceEvent = {
        id: globalThis.crypto.randomUUID(),
        at,
        kind: "emergency.update",
        actor: input.actor,
        previousStatus: currentState.status,
        newStatus: input.newStatus,
        reason: input.reason,
      };

      currentState = {
        status: input.newStatus,
        reason: input.reason,
        toggledAt: at,
        toggledBy: input.actor,
      };

      events.unshift(event);
      return { state: currentState, event };
    },

    async history(limit: number): Promise<readonly GovernanceEvent[]> {
      return events.slice(0, limit);
    },
  };
}
