import type { Taint } from "@adjudicate/core";

/** Context handed to a channel when delivering an approval request. */
export interface ApprovalChannelContext {
  readonly token: string;
  readonly sessionId: string;
  readonly intentHash: string;
  readonly intentKind: string;
  readonly prompt: string;
  readonly taint: Taint;
  /** Adopter-built deep links the channel renders into its message. */
  readonly approveUrl?: string;
  readonly declineUrl?: string;
}

/** Pluggable delivery channel (Slack/Teams/email/webhook). Pure I/O — outside the kernel. */
export interface ApprovalChannel {
  readonly id: string;
  /** Deliver the request. Returns an optional ref for later edit/cleanup. */
  request(ctx: ApprovalChannelContext): Promise<{ channelRef?: string }>;
  /** Optional: update the delivered message once resolved. */
  notifyResolved?(
    ctx: ApprovalChannelContext,
    outcome: { status: "approved" | "declined"; by?: { id: string; displayName?: string } },
  ): Promise<void>;
}

/** Reference webhook channel — POSTs the request as JSON. `fetchImpl` injectable for tests. */
export function createWebhookChannel(opts: {
  readonly id?: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;
}): ApprovalChannel {
  const id = opts.id ?? "webhook";
  const doFetch = opts.fetchImpl;
  return {
    id,
    async request(ctx) {
      if (!doFetch) {
        // No transport injected — the channel is declarative only.
        return {};
      }
      const res = await doFetch(opts.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
        body: JSON.stringify({ type: "approval.request", ...ctx }),
      });
      if (!res.ok) throw new Error(`webhook channel ${id}: non-ok response`);
      return { channelRef: ctx.token };
    },
  };
}

/** Zero-dependency reference channel for quickstart/tests — records deliveries in memory. */
export function createConsoleLogChannel(): ApprovalChannel & { readonly delivered: ApprovalChannelContext[] } {
  const delivered: ApprovalChannelContext[] = [];
  return {
    id: "console-log",
    delivered,
    async request(ctx) {
      delivered.push(ctx);
      return { channelRef: `log-${ctx.token}` };
    },
    async notifyResolved() {
      /* no-op for the log channel */
    },
  };
}
