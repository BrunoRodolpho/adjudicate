/**
 * `createRedisEmergencyStateStore` — Redis-backed `EmergencyStateStore`
 * implementation that coordinates with the kernel's `DistributedKillSwitch`.
 *
 * # The wire contract
 *
 * The kernel's `startDistributedKillSwitch` polls a Redis key and parses
 * the JSON value with `Partial<{active, reason}>` followed by explicit
 * type narrowing. Extra fields are silently ignored. This module
 * leverages that permissiveness to write an EXTENDED payload that the
 * kernel reads correctly while the SDK gains structured metadata:
 *
 *   {
 *     "active": boolean,                 // kernel reads this
 *     "reason": string,                  // kernel reads this
 *     "toggledAt": "2026-04-28T...",     // SDK extension; kernel ignores
 *     "toggledBy": {"id":"op-1",...}     // SDK extension; kernel ignores
 *   }
 *
 * Bit-perfect kernel compatibility achieved with zero kernel changes.
 *
 * # Timestamp consistency
 *
 * `toggledAt` (in the Redis payload) and the corresponding governance
 * event's `at` field are computed ONCE per transition from the same
 * `new Date().toISOString()` call. Cross-referencing the live Redis
 * state and the Postgres governance log aligns to the millisecond.
 *
 * # Idempotency
 *
 * `update` is idempotent on `newStatus === currentStatus`: no Redis SET,
 * no event emitted. Matches both the kernel's polling semantics
 * (`current.active !== parsed.active || current.reason !== parsed.reason`
 * gate at `distributed-kill-switch.ts:127`) and the in-memory store's
 * Phase 2a contract.
 *
 * # Concurrency
 *
 * GET-then-SET is not atomic. Two operators in different replicas could
 * both read NORMAL, both decide to engage DENY_ALL, both SET. Last
 * writer wins on the Redis state; both governance events are recorded
 * (which is correct — both operators DID act). Acceptable for
 * kill-switch semantics. WATCH/MULTI/EXEC or Lua for stricter atomicity
 * is a future enhancement.
 *
 * # History
 *
 * `history()` delegates to the optional `historyLog`. Without one, this
 * store returns an empty array — Redis isn't natively shaped for log
 * queries. The reference console wires this store as a "state-only"
 * component inside `createDurableEmergencyStore`, which composes Redis
 * state + Postgres governance log for the full `EmergencyStateStore`
 * contract.
 */

import type {
  Actor,
  EmergencyState,
  EmergencyStateStore,
  EmergencyUpdateRequest,
  EmergencyUpdateResult,
  GovernanceEvent,
} from "@adjudicate/admin-sdk";
import type { RedisLedgerClient } from "./ledger-redis.js";

/** Optional adopter-supplied governance log backend. */
export interface EmergencyHistoryLog {
  insert(event: GovernanceEvent): Promise<void>;
  history(limit: number): Promise<readonly GovernanceEvent[]>;
}

export interface CreateRedisEmergencyStateStoreOptions {
  /** Reuses the existing minimal `set`/`get` interface. */
  readonly redis: RedisLedgerClient;
  /**
   * Same key the kernel's `startDistributedKillSwitch` polls. Adopter-
   * chosen (e.g. "adjudicate:kill-switch" for global,
   * "adjudicate:tenant:abc:kill-switch" per-tenant).
   */
  readonly key: string;
  /**
   * Optional governance log backend. When provided, `update` writes
   * events here (fire-and-forget) and `history` delegates here. When
   * omitted, the store is purely state-coordinated; the consuming
   * `createDurableEmergencyStore` composite handles history layering.
   */
  readonly historyLog?: EmergencyHistoryLog;
}

const SYSTEM_ACTOR: Actor = {
  id: "system",
  displayName: "system",
};

const DEFAULT_STATE: EmergencyState = {
  status: "NORMAL",
  reason: "Initial state — Redis key absent.",
  toggledAt: new Date(0).toISOString(),
  toggledBy: SYSTEM_ACTOR,
};

interface RedisPayload {
  readonly active: boolean;
  readonly reason: string;
  readonly toggledAt?: string;
  readonly toggledBy?: Actor;
}

/** State → wire payload. Always emits the extended shape. */
function stateToPayload(state: EmergencyState): RedisPayload {
  return {
    active: state.status === "DENY_ALL",
    reason: state.reason,
    toggledAt: state.toggledAt,
    toggledBy: state.toggledBy,
  };
}

function isValidActor(value: unknown): value is Actor {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<Actor>;
  return typeof a.id === "string" && a.id.length > 0;
}

/**
 * Wire payload → state. Defensive: handles kernel-only payloads
 * (`{active, reason}` without metadata) by falling back to defaults
 * for `toggledAt` and `toggledBy`. This is the path when the kernel
 * (or a non-SDK admin tool) wrote the key.
 */
function payloadToState(payload: unknown): EmergencyState {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(
      "redis-emergency-store: payload is not an object",
    );
  }
  const p = payload as Partial<RedisPayload>;
  if (typeof p.active !== "boolean" || typeof p.reason !== "string") {
    throw new Error(
      "redis-emergency-store: malformed payload (missing active/reason)",
    );
  }
  return {
    status: p.active ? "DENY_ALL" : "NORMAL",
    reason: p.reason,
    toggledAt:
      typeof p.toggledAt === "string"
        ? p.toggledAt
        : new Date(0).toISOString(),
    toggledBy: isValidActor(p.toggledBy) ? p.toggledBy : SYSTEM_ACTOR,
  };
}

export function createRedisEmergencyStateStore(
  opts: CreateRedisEmergencyStateStoreOptions,
): EmergencyStateStore {
  async function getStateInternal(): Promise<EmergencyState> {
    const raw = await opts.redis.get(opts.key);
    if (raw === null) return DEFAULT_STATE;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `redis-emergency-store: malformed JSON at key "${opts.key}": ${e.message}`,
      );
    }
    return payloadToState(parsed);
  }

  return {
    async getState(): Promise<EmergencyState> {
      return getStateInternal();
    },

    async update(
      input: EmergencyUpdateRequest,
    ): Promise<EmergencyUpdateResult> {
      const current = await getStateInternal();

      // Idempotent no-op on same status.
      if (input.newStatus === current.status) {
        return { state: current, event: null };
      }

      // Single source of truth for "when this transition happened" —
      // used for BOTH the Redis payload's toggledAt AND the
      // GovernanceEvent's at. Cross-referencing Redis state and Postgres
      // governance log aligns to the millisecond.
      const at = new Date().toISOString();

      const event: GovernanceEvent = {
        id: globalThis.crypto.randomUUID(),
        at,
        kind: "emergency.update",
        actor: input.actor,
        previousStatus: current.status,
        newStatus: input.newStatus,
        reason: input.reason,
      };

      const newState: EmergencyState = {
        status: input.newStatus,
        reason: input.reason,
        toggledAt: at,
        toggledBy: input.actor,
      };

      // Write extended payload. Kernel parser reads {active, reason}
      // and silently ignores the metadata fields — verified by the
      // kernel-compat invariant test.
      await opts.redis.set(opts.key, JSON.stringify(stateToPayload(newState)));

      // Optional log delegation, fire-and-forget. Same operator-priority-
      // over-audit-completeness reasoning as the in-memory durable
      // composite from Phase 1.5c.
      if (opts.historyLog) {
        try {
          await opts.historyLog.insert(event);
        } catch (err) {
          console.error(
            "[redis-emergency-store] failed to write governance event:",
            err,
          );
        }
      }

      return { state: newState, event };
    },

    async history(limit: number): Promise<readonly GovernanceEvent[]> {
      if (!opts.historyLog) return [];
      return opts.historyLog.history(limit);
    },
  };
}
