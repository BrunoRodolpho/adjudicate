import { TRPCError } from "@trpc/server";
import type { AuditQuery, AuditQueryResult } from "../schemas/query.js";
import type { AuditStore } from "../store/index.js";

export interface CreateAuditQueryHandlerDeps {
  readonly store: AuditStore;
}

/**
 * 093 — compute per-stream inter-record HASH-CHAIN continuity over the returned
 * records. A "stream" is a session (`record.envelope.actor.sessionId`); records
 * within a session chain via `prevAuditHash` (the per-stream cryptographic tip).
 * A record whose `prevAuditHash` does not equal the immediately-preceding (by
 * `at`) record's `auditHash` in the same stream is a `break` (a deleted /
 * reordered record). This mirrors the `replayWithIntegrity` chain axis but is
 * computed standalone here (admin-sdk is the BASE package and must not depend on
 * `@adjudicate/audit`). It reads ONLY fields already on the record — no hashing.
 *
 * ORDER-INDEPENDENT: the cold-store list read returns records NEWEST-FIRST, so we
 * cannot rely on arrival order. We group by stream and sort each stream
 * CHRONOLOGICALLY (by `at`, then `intentHash` as a stable tiebreaker) before
 * walking the chain, so the result is identical regardless of the page's sort.
 *
 * Window-scoped: a record whose predecessor is OUT OF the returned window is NOT
 * flagged (its predecessor is simply absent from this page — `checked` excludes
 * it), so this is a continuity SIGNAL for the rendered page, not a global proof.
 */
function computeChainIntegrity(
  records: AuditQueryResult["records"],
): NonNullable<AuditQueryResult["chainIntegrity"]> {
  // Group by stream (session).
  const byStream = new Map<string, AuditQueryResult["records"][number][]>();
  for (const record of records) {
    const stream = record.envelope.actor.sessionId;
    const bucket = byStream.get(stream);
    if (bucket === undefined) byStream.set(stream, [record]);
    else bucket.push(record);
  }
  const breaks: {
    intentHash: string;
    prevAuditHash: string;
    predecessorAuditHash: string;
  }[] = [];
  let checked = 0;
  for (const bucket of byStream.values()) {
    // Chronological order within the stream (stable tiebreaker on intentHash).
    const ordered = [...bucket].sort((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : a.intentHash < b.intentHash ? -1 : 1,
    );
    let prevTip: string | undefined = undefined;
    for (const record of ordered) {
      const prevLink = record.prevAuditHash;
      // Only assessable when this record claims a link AND there is a prior
      // in-window record for the stream to compare against.
      if (prevLink !== undefined && prevTip !== undefined) {
        checked++;
        if (prevLink !== prevTip) {
          breaks.push({
            intentHash: record.intentHash,
            prevAuditHash: prevLink,
            predecessorAuditHash: prevTip,
          });
        }
      }
      prevTip = record.auditHash;
    }
  }
  return { checked, breaks };
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
 *
 * 092 — verify-on-read pass-through. When the underlying store verifies on read
 * (the Postgres cold-store does — `createPostgresAuditStore`), its
 * `AuditQueryResult.verifications` (per-record verdicts, index-aligned with
 * `records`) flows through this handler UNCHANGED so the tRPC route can render
 * tamper / signature status. Stores that do not verify (the in-memory reference)
 * omit it and the field is simply absent. The handler never strips, reorders, or
 * recomputes the verdicts — it only maps the InvalidCursorError to BAD_REQUEST.
 *
 * 093 — chain-integrity surfacing. The handler ALSO computes per-stream
 * inter-record hash-chain continuity over the returned records and attaches it as
 * `chainIntegrity` so the console can render "chain intact" vs "N broken links".
 * This is additive: it reads only fields already on each record and never alters
 * `records` / `verifications`.
 */
export function createAuditQueryHandler(
  deps: CreateAuditQueryHandlerDeps,
): (input: AuditQuery) => Promise<AuditQueryResult> {
  return async (input: AuditQuery): Promise<AuditQueryResult> => {
    try {
      const result = await deps.store.query(input);
      // 093: surface chain-continuity alongside the existing (untouched) records
      // + verifications. Additive — never strips or reorders the store's output.
      return { ...result, chainIntegrity: computeChainIntegrity(result.records) };
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
