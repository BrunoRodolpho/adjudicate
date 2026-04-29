import type {
  Actor,
  EmergencyState,
  EmergencyUpdateInput,
  GovernanceEvent,
} from "../schemas/emergency.js";
import type {
  EmergencyStateStore,
  EmergencyUpdateResult,
} from "../store/emergency-store.js";

export interface CreateEmergencyHandlerDeps {
  readonly stateStore: EmergencyStateStore;
}

/**
 * Framework-agnostic emergency handler.
 *
 * Like `createAuditQueryHandler`, this exists so adopters using
 * Express/Fastify/Hono can wire emergency endpoints without touching
 * tRPC. The tRPC procedures in `src/trpc/index.ts` delegate to this
 * handler under the hood.
 *
 * Validation is layered:
 *   - `EmergencyUpdateInputSchema.refine(...)` rejects bad
 *     `confirmationPhrase` at the wire (Zod → BAD_REQUEST).
 *   - The tRPC procedure rejects missing `actor` (UNAUTHORIZED).
 *   - This handler trusts both — its job is to call the store with
 *     the resolved actor identity.
 */
export function createEmergencyHandler(deps: CreateEmergencyHandlerDeps) {
  return {
    async getState(): Promise<EmergencyState> {
      return deps.stateStore.getState();
    },

    async update(
      input: EmergencyUpdateInput,
      actor: Actor,
    ): Promise<EmergencyUpdateResult> {
      return deps.stateStore.update({
        newStatus: input.newStatus,
        reason: input.reason,
        actor,
      });
    },

    async history(limit: number): Promise<readonly GovernanceEvent[]> {
      return deps.stateStore.history(limit);
    },
  };
}
