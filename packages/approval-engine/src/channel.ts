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

type WebhookFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean }>;

function summarize(ctx: ApprovalChannelContext): string {
  const links = [ctx.approveUrl ? `approve: ${ctx.approveUrl}` : "", ctx.declineUrl ? `decline: ${ctx.declineUrl}` : ""]
    .filter(Boolean)
    .join("  ");
  return `Approval needed — ${ctx.intentKind} (${ctx.taint})\n${ctx.prompt}${links ? `\n${links}` : ""}`;
}

/** Slack incoming-webhook channel. POSTs a Slack message payload. `fetchImpl` injectable. */
export function createSlackChannel(opts: {
  readonly id?: string;
  readonly webhookUrl: string;
  readonly fetchImpl?: WebhookFetch;
}): ApprovalChannel {
  const id = opts.id ?? "slack";
  return {
    id,
    async request(ctx) {
      if (!opts.fetchImpl) return {};
      const res = await opts.fetchImpl(opts.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: summarize(ctx) }),
      });
      if (!res.ok) throw new Error(`slack channel ${id}: non-ok response`);
      return { channelRef: ctx.token };
    },
  };
}

/** Microsoft Teams incoming-webhook channel. POSTs a Teams MessageCard. `fetchImpl` injectable. */
export function createTeamsChannel(opts: {
  readonly id?: string;
  readonly webhookUrl: string;
  readonly fetchImpl?: WebhookFetch;
}): ApprovalChannel {
  const id = opts.id ?? "teams";
  return {
    id,
    async request(ctx) {
      if (!opts.fetchImpl) return {};
      const res = await opts.fetchImpl(opts.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          summary: `Approval: ${ctx.intentKind}`,
          text: summarize(ctx),
        }),
      });
      if (!res.ok) throw new Error(`teams channel ${id}: non-ok response`);
      return { channelRef: ctx.token };
    },
  };
}

/** Email channel. Adopter injects a `send` transport (SMTP/SES/etc.) — pure I/O, outside the kernel. */
export function createEmailChannel(opts: {
  readonly id?: string;
  readonly to: string | ((ctx: ApprovalChannelContext) => string);
  readonly subject?: (ctx: ApprovalChannelContext) => string;
  readonly send?: (msg: { to: string; subject: string; body: string }) => Promise<{ ok: boolean }>;
}): ApprovalChannel {
  const id = opts.id ?? "email";
  return {
    id,
    async request(ctx) {
      if (!opts.send) return {};
      const to = typeof opts.to === "function" ? opts.to(ctx) : opts.to;
      const subject = opts.subject ? opts.subject(ctx) : `Approval needed: ${ctx.intentKind}`;
      const res = await opts.send({ to, subject, body: summarize(ctx) });
      if (!res.ok) throw new Error(`email channel ${id}: send failed`);
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
