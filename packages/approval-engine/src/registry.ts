import type { Taint } from "@adjudicate/core";

export type ApprovalStatus = "pending" | "approved" | "declined" | "expired";

/**
 * Display projection of a pending confirmation — held in the engine's own
 * registry, NOT in adapter-core's `ConfirmationStore` (which is single-use
 * `put`/`take` and must not be enumerated). The authoritative envelope blob
 * stays in the ConfirmationStore; this is a lossy, read-optimized view.
 */
export interface ApprovalRequest {
  readonly token: string;
  readonly sessionId: string;
  readonly intentHash: string;
  readonly intentKind: string;
  readonly prompt: string;
  readonly taint: Taint;
  readonly channel: string;
  readonly channelRef?: string;
  readonly status: ApprovalStatus;
  readonly requestedAt: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: { readonly id: string; readonly displayName?: string };
  /**
   * Optional provenance tag stamped by a multiplexing reader (e.g. the adjutant
   * reading both checkout and agent keyspaces). Never persisted by `put` — it is
   * a read-side display hint only, never a security boundary.
   */
  readonly source?: "checkout" | "agent";
}

export interface ApprovalRegistry {
  put(req: ApprovalRequest, ttlSeconds: number): Promise<void>;
  get(token: string): Promise<ApprovalRequest | null>;
  list(filter?: {
    status?: ApprovalStatus;
    sessionId?: string;
    limit?: number;
  }): Promise<ReadonlyArray<ApprovalRequest>>;
  markResolved(
    token: string,
    status: "approved" | "declined" | "expired",
    by?: { id: string; displayName?: string },
    now?: string,
  ): Promise<ApprovalRequest | null>;
}

interface Entry {
  req: ApprovalRequest;
  expiresAtMs: number;
}

/** In-memory reference registry. `nowMs`/`nowIso` injectable for deterministic tests. */
export function createInMemoryApprovalRegistry(opts: {
  readonly maxEntries?: number;
  readonly nowMs?: () => number;
  readonly nowIso?: () => string;
} = {}): ApprovalRegistry {
  const entries = new Map<string, Entry>();
  const nowMs = opts.nowMs ?? (() => Date.now());
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());
  const maxEntries = opts.maxEntries;

  function sweep(): void {
    const t = nowMs();
    for (const [k, e] of entries) if (e.expiresAtMs <= t) entries.delete(k);
  }

  return {
    async put(req, ttlSeconds) {
      sweep();
      if (maxEntries !== undefined && !entries.has(req.token) && entries.size >= maxEntries) {
        // Evict the oldest by insertion order (Map preserves it).
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(req.token, { req, expiresAtMs: nowMs() + ttlSeconds * 1000 });
    },
    async get(token) {
      sweep();
      return entries.get(token)?.req ?? null;
    },
    async list(filter) {
      sweep();
      let rows = Array.from(entries.values()).map((e) => e.req);
      if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
      if (filter?.sessionId) rows = rows.filter((r) => r.sessionId === filter.sessionId);
      rows.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)); // newest first
      if (filter?.limit !== undefined) rows = rows.slice(0, filter.limit);
      return rows;
    },
    async markResolved(token, status, by, now) {
      const e = entries.get(token);
      if (e === undefined) return null;
      const resolved: ApprovalRequest = {
        ...e.req,
        status,
        resolvedAt: now ?? nowIso(),
        ...(by ? { resolvedBy: by } : {}),
      };
      entries.set(token, { ...e, req: resolved });
      return resolved;
    },
  };
}
