/**
 * `createPostgresAuditStore` — implements the SDK's `AuditStore` contract
 * against the existing `intent_audit` table.
 *
 * Reuses `rowToRecord` from `replay.ts` (single source of truth for the
 * row→AuditRecord conversion) and translates the SDK's filter shape into
 * parameterized SQL.
 *
 * **Pagination is keyset, not offset.** The SDK's `cursor: string` is
 * opaque — we encode `(recorded_at, intent_hash)` of the last seen row
 * as base64url(JSON). Subsequent pages add a strict-less-than predicate
 * against that tuple. Result: O(log N) page latency at any depth — page
 * 100,000 of a 10M-row table runs in the same time as page 2. Offset
 * pagination would scan linearly.
 *
 * **Tiebreaker direction matches the primary sort.** ORDER BY
 * `recorded_at DESC, intent_hash DESC` and the cursor predicate uses
 * tuple < — both DESC. Mismatching directions causes row skipping
 * during millisecond-burst inserts (webhook fan-out is the canonical
 * trigger).
 */

import type { AuditRecord } from "@adjudicate/core";
import type {
  AuditQuery,
  AuditQueryResult,
  AuditStore,
} from "@adjudicate/admin-sdk";
import type { PostgresReader } from "./pg-reader.js";
import type { IntentAuditRow } from "./postgres-sink.js";
import { rowToRecord } from "./replay.js";

const SELECT_COLUMNS = `
  intent_hash, session_id, kind, principal, taint, decision_kind,
  refusal_kind, refusal_code, decision_basis, resource_version,
  envelope_jsonb, decision_jsonb, recorded_at, duration_ms,
  partition_month, record_version, plan_jsonb
`.trim();

interface CursorPayload {
  readonly at: string;
  readonly hash: string;
}

export function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), "utf-8").toString("base64url");
}

export function decodeCursor(s: string): CursorPayload | null {
  try {
    const json = Buffer.from(s, "base64url").toString("utf-8");
    const p = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof p.at === "string" && typeof p.hash === "string") {
      return { at: p.at, hash: p.hash };
    }
    return null;
  } catch {
    return null;
  }
}

interface SqlFragment {
  readonly clauses: readonly string[];
  readonly params: readonly unknown[];
}

/**
 * Builds the WHERE clause set from the SDK's filter shape. Parameter
 * indices are monotonic ($1, $2, ...). Each provided filter contributes
 * one clause; absent filters contribute none. AND-composed.
 */
export function buildWhereClauses(q: AuditQuery): SqlFragment {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (q.intentKind !== undefined) {
    clauses.push(`kind = $${i++}`);
    params.push(q.intentKind);
  }
  if (q.decisionKind !== undefined) {
    clauses.push(`decision_kind = $${i++}`);
    params.push(q.decisionKind);
  }
  if (q.refusalCode !== undefined) {
    // refusal_code is NULL except on REFUSE rows (CHECK constraint
    // intent_audit_refusal_pair guarantees this). Filtering by code
    // implicitly narrows to REFUSE.
    clauses.push(`refusal_code = $${i++}`);
    params.push(q.refusalCode);
  }
  if (q.taint !== undefined) {
    clauses.push(`taint = $${i++}`);
    params.push(q.taint);
  }
  if (q.intentHash !== undefined) {
    clauses.push(`intent_hash = $${i++}`);
    params.push(q.intentHash);
  }
  if (q.since !== undefined) {
    clauses.push(`recorded_at >= $${i++}`);
    params.push(q.since);
  }
  if (q.until !== undefined) {
    clauses.push(`recorded_at <= $${i++}`);
    params.push(q.until);
  }

  return { clauses, params };
}

/** Normalize TIMESTAMPTZ values that pg drivers may return as Date. */
function normalizeAt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  throw new Error(
    `audit-postgres: unexpected TIMESTAMPTZ value type ${typeof value}`,
  );
}

export interface CreatePostgresAuditStoreDeps {
  readonly reader: PostgresReader;
}

export function createPostgresAuditStore(
  deps: CreatePostgresAuditStoreDeps,
): AuditStore {
  return {
    async query(q: AuditQuery): Promise<AuditQueryResult> {
      const { clauses, params } = buildWhereClauses(q);
      const allParams: unknown[] = [...params];
      let i = allParams.length + 1;

      // Keyset pagination — strict-less-than on (recorded_at, intent_hash).
      // Tuple comparison is lexicographic in Postgres, which is exactly
      // what we want: walks the index in DESC order without OFFSET.
      const cursor = q.cursor ? decodeCursor(q.cursor) : null;
      let cursorClause = "";
      if (cursor) {
        cursorClause = `(recorded_at, intent_hash) < ($${i++}, $${i++})`;
        allParams.push(cursor.at, cursor.hash);
      }

      const allClauses = [...clauses, ...(cursorClause ? [cursorClause] : [])];
      const whereClause =
        allClauses.length > 0 ? `WHERE ${allClauses.join(" AND ")}` : "";

      // +1 to detect "is there a next page" without a separate COUNT.
      allParams.push(q.limit + 1);
      const limitParam = i;

      const sql = `
        SELECT ${SELECT_COLUMNS}
        FROM intent_audit
        ${whereClause}
        ORDER BY recorded_at DESC, intent_hash DESC
        LIMIT $${limitParam}
      `.replace(/\s+/g, " ").trim();

      const rawRows = await deps.reader.query<IntentAuditRow>(sql, allParams);

      // Normalize recorded_at to string in case the pg driver returned Date.
      const rows = rawRows.map((row) => ({
        ...row,
        recorded_at: normalizeAt(row.recorded_at),
      }));

      const hasMore = rows.length > q.limit;
      const slice = hasMore ? rows.slice(0, q.limit) : rows;
      const records = slice.map(rowToRecord);

      // nextCursor encodes the LAST row in the slice (not the n+1-th
      // sentinel). Operators paginating forward see continuous coverage.
      const nextCursor =
        hasMore && slice.length > 0
          ? encodeCursor({
              at: slice[slice.length - 1]!.recorded_at,
              hash: slice[slice.length - 1]!.intent_hash,
            })
          : undefined;

      return {
        records,
        ...(nextCursor !== undefined ? { nextCursor } : {}),
      };
    },

    async getByIntentHash(intentHash: string): Promise<AuditRecord | null> {
      // ORDER BY recorded_at DESC LIMIT 1 because intent_hash is the
      // partition-aware deduplication key but a hash CAN appear in
      // multiple rows under degenerate replay (two writers race on the
      // same intent). Returning the most recent one is the safe choice.
      const sql = `
        SELECT ${SELECT_COLUMNS}
        FROM intent_audit
        WHERE intent_hash = $1
        ORDER BY recorded_at DESC
        LIMIT 1
      `.replace(/\s+/g, " ").trim();

      const rawRows = await deps.reader.query<IntentAuditRow>(sql, [intentHash]);
      if (rawRows.length === 0) return null;
      const row = {
        ...rawRows[0]!,
        recorded_at: normalizeAt(rawRows[0]!.recorded_at),
      };
      return rowToRecord(row);
    },
  };
}
