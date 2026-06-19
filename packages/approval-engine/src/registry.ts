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
  /**
   * 072 — separation-of-duty (four-eyes / maker-checker) proposer binding. The
   * identity that PROPOSED the intent (the maker), captured at request-creation
   * from the proposing `sessionId` actor. This is a DISPLAY / GOVERNANCE
   * PROJECTION field only — it is deliberately NOT carried on the kernel
   * `confirmationReceipt` (071's optional capability/approver/channel bindings
   * stay byte-identical when omitted) and NOT in the `intentHash` pre-image, so
   * §D-4 (intentHash recipe) and the additive-determinism fence are preserved.
   * It is compared engine-side at resolve time against the resolving approver so
   * a maker cannot self-approve their own request (`approver != proposer`). The
   * comparison is fail-closed: an unresolvable / missing identity rejects, never
   * approves (§C, §D-6). Optional/additive so persisted data stays
   * backward-compatible when the SoD guard is reverted.
   */
  readonly requestedBy?: { readonly id: string; readonly displayName?: string };
  readonly status: ApprovalStatus;
  readonly requestedAt: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: { readonly id: string; readonly displayName?: string };
  /**
   * Accumulated approvers for quorum (ADR-143). Each accepted vote is appended;
   * with `distinctApprovers` a repeat approver id is ignored. Quorum is reached
   * when this reaches `QuorumPolicy.minApprovals`.
   */
  readonly approvals?: ReadonlyArray<{ readonly id: string; readonly at: string; readonly displayName?: string }>;
  /**
   * Escalation policy carried from request() for an out-of-band scheduler
   * (`isEscalationDue` computes when it fires). Never read by the kernel.
   */
  readonly escalation?: { readonly afterMs: number; readonly to: "human" | "supervisor" };
  /**
   * Quorum policy stamped from the engine's config at request() so the
   * projection is self-describing — operator UIs can render N/`minApprovals`
   * progress without knowing the engine's global config. Mirrors `escalation`;
   * never read by the kernel.
   */
  readonly quorum?: { readonly minApprovals: number; readonly distinctApprovers?: boolean };
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
