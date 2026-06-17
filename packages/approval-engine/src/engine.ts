import type { Taint } from "@adjudicate/core";
import type { AdjudicatedAgent, AgentTurnResult } from "@adjudicate/adapter-core";
import type { ApprovalChannel, ApprovalChannelContext } from "./channel.js";
import { ApprovalError } from "./errors.js";
import type { ApprovalRegistry, ApprovalRequest, ApprovalStatus } from "./registry.js";
import { quorumMet, type Attestation, type AttestationVerifier, type QuorumPolicy } from "./governance.js";

export interface ApprovalEngineOptions<S, C, H> {
  /** The adapter-core agent whose confirm() owns the replay-safe resume. */
  readonly agent: AdjudicatedAgent<string, unknown, S, C, H>;
  readonly registry: ApprovalRegistry;
  readonly channels: ReadonlyArray<ApprovalChannel>;
  /** Route a request to channel ids. Defaults to all channels. */
  readonly route?: (ctx: ApprovalChannelContext) => ReadonlyArray<string>;
  /** Fetched FRESH at resolve time — keeps state OUT of the engine + intentHash. */
  readonly resolveStateContext: (sessionId: string) => Promise<{ state: S; context: C }>;
  /** Build operator-facing approve/decline deep links (optional). */
  readonly buildLinks?: (token: string) => { approveUrl?: string; declineUrl?: string };
  /** Registry TTL; defaults to 24h (matches ConfirmationStore.put). */
  readonly ttlSeconds?: number;
  readonly now?: () => string;
  /**
   * Multi-approver quorum (ADR-143). When set, an accepted `resolve` accumulates
   * the approver and only runs the underlying confirm() once `minApprovals` is
   * reached (returning `turn: null` while still awaiting more). A single decline
   * resolves immediately. Absent → single-approver (legacy) behavior.
   */
  readonly quorum?: QuorumPolicy;
  /**
   * Approver attestation (ADR-143). When set, `resolve` REQUIRES a valid
   * `attestation` (a signature over the token by the approver), replacing the
   * forgeable `resolvedBy` claim. Verification failure rejects the resolve.
   */
  readonly attestationVerifier?: AttestationVerifier;
}

export interface ApprovalEngine<S, C, H> {
  request(input: {
    token: string;
    sessionId: string;
    intentHash: string;
    intentKind: string;
    prompt: string;
    taint: Taint;
    escalation?: { afterMs: number; to: "human" | "supervisor" };
  }): Promise<ApprovalRequest>;
  resolve(input: {
    token: string;
    accepted: boolean;
    by?: { id: string; displayName?: string };
    attestation?: Attestation;
  }): Promise<{ request: ApprovalRequest; turn: AgentTurnResult<H> | null }>;
  list(filter?: { status?: ApprovalStatus; sessionId?: string; limit?: number }): Promise<ReadonlyArray<ApprovalRequest>>;
  get(token: string): Promise<ApprovalRequest | null>;
}

export function createApprovalEngine<S, C, H>(
  opts: ApprovalEngineOptions<S, C, H>,
): ApprovalEngine<S, C, H> {
  const ttl = opts.ttlSeconds ?? 24 * 60 * 60;
  const now = opts.now ?? (() => new Date().toISOString());
  const channelsById = new Map(opts.channels.map((c) => [c.id, c]));

  return {
    async request(input) {
      const links = opts.buildLinks?.(input.token) ?? {};
      const ctx: ApprovalChannelContext = {
        token: input.token,
        sessionId: input.sessionId,
        intentHash: input.intentHash,
        intentKind: input.intentKind,
        prompt: input.prompt,
        taint: input.taint,
        ...(links.approveUrl !== undefined ? { approveUrl: links.approveUrl } : {}),
        ...(links.declineUrl !== undefined ? { declineUrl: links.declineUrl } : {}),
      };
      const targetIds = opts.route ? opts.route(ctx) : opts.channels.map((c) => c.id);
      let channelRef: string | undefined;
      let channelUsed = "none";
      for (const id of targetIds) {
        const channel = channelsById.get(id);
        if (!channel) continue;
        try {
          const res = await channel.request(ctx);
          channelUsed = channel.id;
          channelRef = res.channelRef;
          break; // first successful channel wins
        } catch (err) {
          // try the next channel; if all fail we still record the projection.
          if (id === targetIds[targetIds.length - 1]) {
            // last one failed — record then surface
            const failed: ApprovalRequest = {
              token: input.token,
              sessionId: input.sessionId,
              intentHash: input.intentHash,
              intentKind: input.intentKind,
              prompt: input.prompt,
              taint: input.taint,
              channel: id,
              status: "pending",
              requestedAt: now(),
            };
            await opts.registry.put(failed, ttl);
            throw new ApprovalError("CHANNEL_FAILED", err instanceof Error ? err.message : String(err));
          }
        }
      }
      const req: ApprovalRequest = {
        token: input.token,
        sessionId: input.sessionId,
        intentHash: input.intentHash,
        intentKind: input.intentKind,
        prompt: input.prompt,
        taint: input.taint,
        channel: channelUsed,
        ...(channelRef !== undefined ? { channelRef } : {}),
        status: "pending",
        requestedAt: now(),
        ...(input.escalation ? { escalation: input.escalation } : {}),
      };
      await opts.registry.put(req, ttl);
      return req;
    },

    async resolve(input) {
      const existing = await opts.registry.get(input.token);
      if (existing === null) throw new ApprovalError("UNKNOWN_TOKEN", `unknown approval token ${input.token}`);
      if (existing.status !== "pending") {
        throw new ApprovalError("ALREADY_RESOLVED", `approval ${input.token} already ${existing.status}`);
      }

      // Attestation gate (ADR-143): when configured, require a verified approver
      // signature over the token — replaces the forgeable resolvedBy claim.
      if (opts.attestationVerifier) {
        const att = input.attestation;
        const ok =
          att !== undefined &&
          opts.attestationVerifier({ approverId: att.approverId, token: input.token, signature: att.signature });
        if (!ok) {
          throw new ApprovalError("ATTESTATION_INVALID", `approval ${input.token}: missing or invalid attestation`);
        }
      }

      // Quorum (ADR-143): an accepted vote under quorum accumulates and returns
      // turn:null until minApprovals is reached. A decline resolves immediately.
      if (opts.quorum && input.accepted) {
        const voter = input.attestation
          ? { id: input.attestation.approverId, ...(input.by?.displayName ? { displayName: input.by.displayName } : {}) }
          : input.by;
        if (!voter?.id) {
          throw new ApprovalError("QUORUM_VOTER_REQUIRED", `approval ${input.token}: quorum requires an identified approver`);
        }
        const distinct = opts.quorum.distinctApprovers !== false;
        const prior = existing.approvals ?? [];
        const approvals =
          distinct && prior.some((a) => a.id === voter.id)
            ? prior
            : [...prior, { id: voter.id, at: now(), ...(voter.displayName ? { displayName: voter.displayName } : {}) }];
        if (!quorumMet(approvals, opts.quorum)) {
          const updated: ApprovalRequest = { ...existing, approvals };
          await opts.registry.put(updated, ttl);
          return { request: updated, turn: null };
        }
        // Quorum reached — persist the accumulated approvals so the resolved
        // record carries them (markResolved spreads the stored req).
        await opts.registry.put({ ...existing, approvals }, ttl);
      }

      // Fetch state/context FRESH — never stored by the engine, never in intentHash.
      const { state, context } = await opts.resolveStateContext(existing.sessionId);
      let turn: AgentTurnResult<H>;
      try {
        turn = await opts.agent.confirm({
          confirmationToken: input.token,
          accepted: input.accepted,
          state,
          context,
        });
      } catch (err) {
        // The underlying confirm() rejected the token (single-use / tampered) —
        // the projection is no longer actionable.
        await opts.registry.markResolved(input.token, "expired", input.by);
        throw new ApprovalError("CONFIRM_REJECTED", err instanceof Error ? err.message : String(err));
      }
      const status = input.accepted ? "approved" : "declined";
      const effectiveBy = input.by ?? (input.attestation ? { id: input.attestation.approverId } : undefined);
      const request = (await opts.registry.markResolved(input.token, status, effectiveBy))!;
      const channel = channelsById.get(existing.channel);
      if (channel?.notifyResolved) {
        await channel.notifyResolved(
          {
            token: existing.token,
            sessionId: existing.sessionId,
            intentHash: existing.intentHash,
            intentKind: existing.intentKind,
            prompt: existing.prompt,
            taint: existing.taint,
          },
          { status, ...(effectiveBy ? { by: effectiveBy } : {}) },
        );
      }
      return { request, turn };
    },

    list(filter) {
      return opts.registry.list(filter);
    },
    get(token) {
      return opts.registry.get(token);
    },
  };
}
