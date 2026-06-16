/**
 * `TurnTraceStore` — adopter-implemented contract for reading the per-LLM-call
 * `turn_trace` records behind the console "Turn trace" view.
 *
 * A turn can produce multiple model calls (planner ×N + responder), so a trace
 * is PER-CALL, keyed `(turnId, callIndex)` and grouped by `turnId` for display.
 * The store is generic (a standard `turn_trace` shape); it never reaches into an
 * adopter's domain tables. The completion is REDACTED at WRITE time (the console
 * does not depend on the audit redactor), so this read surface only ever returns
 * already-redacted text.
 *
 * Reference implementations:
 *   - `createInMemoryTurnTraceStore` (this package; tests + console dev)
 *   - `createPostgresTurnTraceStore` (`@adjudicate/audit-postgres`)
 */

/** One persisted LLM-call trace (read shape). */
export interface TurnTraceCall {
  readonly turnId: string;
  readonly callIndex: number;
  readonly conversationId: string;
  /** Correlation key to intent_audit; null on planner-phase calls. */
  readonly intentHash: string | null;
  readonly model: string;
  readonly temperature: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Content-addressed fragment manifest (id@hash entries). */
  readonly promptManifest: readonly string[];
  /** Already-redacted completion text. */
  readonly completion: string;
  readonly durationMs: number;
  /** ISO-8601. */
  readonly recordedAt: string;
  readonly schemaVersion: number | null;
}

export interface TurnTraceStore {
  /** All calls for one turn, ordered by callIndex ASC (planner→responder). */
  byTurn(turnId: string): Promise<readonly TurnTraceCall[]>;
  /**
   * All calls in a conversation, ordered by recordedAt ASC then callIndex ASC,
   * so the caller can group into a per-turn timeline. `limit` caps the rows.
   */
  byConversation(
    conversationId: string,
    limit?: number,
  ): Promise<readonly TurnTraceCall[]>;
}

export interface InMemoryTurnTraceStoreOptions {
  readonly calls: readonly TurnTraceCall[];
}

/** Default page size for byConversation (matches the audit query cap posture). */
export const TURN_TRACE_DEFAULT_LIMIT = 200;

/**
 * Reference in-memory `TurnTraceStore`. Drives this package's tests and the
 * console dev mode. Adopters with real persistence implement `TurnTraceStore`
 * directly (see `createPostgresTurnTraceStore`).
 */
export function createInMemoryTurnTraceStore(
  opts: InMemoryTurnTraceStoreOptions,
): TurnTraceStore {
  const all = [...opts.calls];
  return {
    async byTurn(turnId: string): Promise<readonly TurnTraceCall[]> {
      return all
        .filter((c) => c.turnId === turnId)
        .sort((a, b) => a.callIndex - b.callIndex);
    },
    async byConversation(
      conversationId: string,
      limit: number = TURN_TRACE_DEFAULT_LIMIT,
    ): Promise<readonly TurnTraceCall[]> {
      return all
        .filter((c) => c.conversationId === conversationId)
        .sort((a, b) =>
          a.recordedAt === b.recordedAt
            ? a.callIndex - b.callIndex
            : a.recordedAt < b.recordedAt
              ? -1
              : 1,
        )
        .slice(0, Math.max(0, limit));
    },
  };
}
