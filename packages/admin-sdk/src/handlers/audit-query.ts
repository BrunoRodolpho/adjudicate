import type { AuditQuery, AuditQueryResult } from "../schemas/query.js";
import type { AuditStore } from "../store/index.js";

export interface CreateAuditQueryHandlerDeps {
  readonly store: AuditStore;
}

/**
 * Framework-agnostic audit-query handler.
 *
 * Adopters mount this in any HTTP framework (Express, Fastify, Hono, Next
 * Route Handler) by wrapping the returned function. The handler does NOT
 * parse the request — it expects the caller to have already validated
 * input via `AuditQuerySchema`.
 *
 *   - tRPC procedures validate automatically via `.input(AuditQuerySchema)`.
 *   - Raw HTTP callers must run `AuditQuerySchema.parse(body)` first.
 *
 * Returning the handler from a factory (rather than exporting the function
 * directly) keeps the dependency injection explicit: the store is bound
 * once at mount time, not per-request.
 */
export function createAuditQueryHandler(
  deps: CreateAuditQueryHandlerDeps,
): (input: AuditQuery) => Promise<AuditQueryResult> {
  return async (input: AuditQuery): Promise<AuditQueryResult> => {
    return deps.store.query(input);
  };
}
