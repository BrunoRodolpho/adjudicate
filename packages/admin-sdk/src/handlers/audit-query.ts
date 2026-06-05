import { TRPCError } from "@trpc/server";
import type { AuditQuery, AuditQueryResult } from "../schemas/query.js";
import type { AuditStore } from "../store/index.js";

export interface CreateAuditQueryHandlerDeps {
  readonly store: AuditStore;
}

/**
 * Structural match for `@adjudicate/audit-postgres`'s `InvalidCursorError`
 * (APIReviewer-007 item 3). admin-sdk is the BASE package — `audit-postgres`
 * declares admin-sdk as a peer dependency, so importing the concrete class
 * here would invert that dependency into a cycle. Matching on `err.name`
 * (which the class sets to `"InvalidCursorError"`) keeps the two packages
 * decoupled while still mapping a malformed pagination cursor to a client
 * error (BAD_REQUEST / 400) instead of a 500.
 */
function isInvalidCursorError(err: unknown): boolean {
  return (
    err instanceof Error && err.name === "InvalidCursorError"
  );
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
    try {
      return await deps.store.query(input);
    } catch (err) {
      // A malformed/tampered pagination cursor is a client error, not a 500.
      if (isInvalidCursorError(err)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Invalid cursor.",
        });
      }
      throw err;
    }
  };
}
