/**
 * `createPostgresTurnTraceStore` — implements the SDK's `TurnTraceStore`
 * contract against the `turn_trace` table (responder-trace-admin C3).
 *
 * `turn_trace` is the kernel-shaped, redacted per-LLM-call store the adopter
 * (ibatexas) writes; the console reads it domain-agnostically here. The
 * completion is REDACTED at write time, so this read surface returns
 * already-redacted text. `@adjudicate/admin-sdk` is an OPTIONAL peer dependency
 * — adopters who only WRITE turn_trace don't pay for the SDK at runtime.
 */

import type {
  TurnTraceCall,
  TurnTraceStore,
} from "@adjudicate/admin-sdk";
import type { PostgresReader } from "./pg-reader.js";
import { normalizeTimestamptz } from "./pg-types.js";

const SELECT_COLUMNS = `
  turn_id, call_index, conversation_id, intent_hash, model, temperature,
  input_tokens, output_tokens, prompt_manifest, completion, duration_ms,
  recorded_at, schema_version
`.trim();

/** Row shape as read from Postgres (snake_case, pre-normalization). */
interface TurnTraceRow {
  turn_id: string;
  call_index: number;
  conversation_id: string;
  intent_hash: string | null;
  model: string;
  temperature: number;
  input_tokens: number;
  output_tokens: number;
  /** jsonb — the pg driver returns parsed JS, but tolerate a string too. */
  prompt_manifest: unknown;
  completion: string;
  duration_ms: number;
  recorded_at: string | Date;
  schema_version: number | null;
}

function toManifest(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToCall(row: TurnTraceRow): TurnTraceCall {
  return {
    turnId: row.turn_id,
    callIndex: Number(row.call_index),
    conversationId: row.conversation_id,
    intentHash: row.intent_hash,
    model: row.model,
    temperature: Number(row.temperature),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    promptManifest: toManifest(row.prompt_manifest),
    completion: row.completion,
    durationMs: Number(row.duration_ms),
    recordedAt: normalizeTimestamptz(row.recorded_at, "turn_trace.recorded_at"),
    schemaVersion: row.schema_version === null ? null : Number(row.schema_version),
  };
}

export interface CreatePostgresTurnTraceStoreDeps {
  readonly reader: PostgresReader;
}

export function createPostgresTurnTraceStore(
  deps: CreatePostgresTurnTraceStoreDeps,
): TurnTraceStore {
  return {
    async byTurn(turnId: string): Promise<readonly TurnTraceCall[]> {
      const sql = `
        SELECT ${SELECT_COLUMNS}
        FROM turn_trace
        WHERE turn_id = $1
        ORDER BY call_index ASC
      `
        .replace(/\s+/g, " ")
        .trim();
      const rows = await deps.reader.query<TurnTraceRow>(sql, [turnId]);
      return rows.map(rowToCall);
    },

    async byConversation(
      conversationId: string,
      limit = 200,
    ): Promise<readonly TurnTraceCall[]> {
      const capped = Math.max(1, Math.min(500, Math.floor(limit)));
      const sql = `
        SELECT ${SELECT_COLUMNS}
        FROM turn_trace
        WHERE conversation_id = $1
        ORDER BY recorded_at ASC, call_index ASC
        LIMIT $2
      `
        .replace(/\s+/g, " ")
        .trim();
      const rows = await deps.reader.query<TurnTraceRow>(sql, [
        conversationId,
        capped,
      ]);
      return rows.map(rowToCall);
    },
  };
}
