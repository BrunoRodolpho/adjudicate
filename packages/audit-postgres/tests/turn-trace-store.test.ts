import { describe, expect, it } from "vitest";
import { createPostgresTurnTraceStore } from "../src/turn-trace-store.js";
import type { PostgresReader } from "../src/pg-reader.js";

interface CapturedCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function mockReader(rows: readonly Record<string, unknown>[]): {
  reader: PostgresReader;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const reader: PostgresReader = {
    async query<R>(sql: string, params: readonly unknown[]) {
      calls.push({ sql, params });
      return rows as readonly R[];
    },
  };
  return { reader, calls };
}

const ROW = {
  turn_id: "turn-A",
  call_index: 1,
  conversation_id: "conv-1",
  intent_hash: "deadbeef",
  model: "claude-sonnet-4-6",
  temperature: 0,
  input_tokens: 20,
  output_tokens: 8,
  prompt_manifest: ["ibatexas/responder.grounded@def456def456"],
  completion: "Cancelei seu pedido.",
  duration_ms: 30,
  recorded_at: "2026-06-14T00:00:01.000Z",
  schema_version: 1,
};

describe("createPostgresTurnTraceStore", () => {
  it("byTurn queries WHERE turn_id ORDER BY call_index and maps the row", async () => {
    const { reader, calls } = mockReader([ROW]);
    const store = createPostgresTurnTraceStore({ reader });
    const result = await store.byTurn("turn-A");

    expect(calls[0]!.sql).toContain("WHERE turn_id = $1");
    expect(calls[0]!.sql).toContain("ORDER BY call_index ASC");
    expect(calls[0]!.params).toEqual(["turn-A"]);

    expect(result).toHaveLength(1);
    const c = result[0]!;
    expect(c.turnId).toBe("turn-A");
    expect(c.callIndex).toBe(1);
    expect(c.intentHash).toBe("deadbeef");
    expect(c.promptManifest).toEqual(["ibatexas/responder.grounded@def456def456"]);
    expect(c.recordedAt).toBe("2026-06-14T00:00:01.000Z");
  });

  it("byConversation orders chronologically and caps the limit to [1,500]", async () => {
    const { reader, calls } = mockReader([ROW]);
    const store = createPostgresTurnTraceStore({ reader });
    await store.byConversation("conv-1", 9999);

    expect(calls[0]!.sql).toContain("WHERE conversation_id = $1");
    expect(calls[0]!.sql).toContain("ORDER BY recorded_at ASC, call_index ASC");
    expect(calls[0]!.params).toEqual(["conv-1", 500]); // capped
  });

  it("tolerates a jsonb prompt_manifest delivered as a string", async () => {
    const { reader } = mockReader([
      { ...ROW, prompt_manifest: '["ibatexas/planner.persona@abc123abc123"]' },
    ]);
    const store = createPostgresTurnTraceStore({ reader });
    const [c] = await store.byTurn("turn-A");
    expect(c!.promptManifest).toEqual(["ibatexas/planner.persona@abc123abc123"]);
  });
});
