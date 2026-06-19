import { describe, expect, it, vi } from "vitest";
import {
  createConsoleLogChannel,
  createEmailChannel,
  createSlackChannel,
  createTeamsChannel,
  createWebhookChannel,
  type ApprovalChannelContext,
} from "../src/index.js";

const ctx: ApprovalChannelContext = {
  token: "t",
  sessionId: "s",
  intentHash: "h",
  intentKind: "deploy.request",
  prompt: "Approve?",
  taint: "UNTRUSTED",
};

/** Same context but carrying adopter-rendered approve/decline deep links. */
const ctxWithLinks: ApprovalChannelContext = {
  ...ctx,
  approveUrl: "https://app.test/approve/t",
  declineUrl: "https://app.test/decline/t",
};

describe("production approval channels (pure I/O, injectable transport)", () => {
  it("slack POSTs a text payload and returns a channelRef", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const res = await createSlackChannel({ webhookUrl: "https://slack/x", fetchImpl }).request(ctx);
    expect(res.channelRef).toBe("t");
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.text).toContain("deploy.request");
  });

  it("teams POSTs a MessageCard", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await createTeamsChannel({ webhookUrl: "https://teams/x", fetchImpl }).request(ctx);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body["@type"]).toBe("MessageCard");
  });

  it("email uses the injected send transport", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    await createEmailChannel({ to: "ops@x.test", send }).request(ctx);
    expect((send.mock.calls[0]![0] as { to: string }).to).toBe("ops@x.test");
  });

  it("throws on a non-ok webhook response", async () => {
    const ch = createSlackChannel({ webhookUrl: "u", fetchImpl: async () => ({ ok: false }) });
    await expect(ch.request(ctx)).rejects.toThrow(/non-ok/);
  });

  it("is declarative-only (returns {}) when no transport is injected", async () => {
    expect(await createSlackChannel({ webhookUrl: "u" }).request(ctx)).toEqual({});
    expect(await createEmailChannel({ to: "x@y.z" }).request(ctx)).toEqual({});
    expect(await createWebhookChannel({ url: "u" }).request(ctx)).toEqual({});
    expect(await createTeamsChannel({ webhookUrl: "u" }).request(ctx)).toEqual({});
  });
});

describe("webhook reference channel (POSTs the request as JSON)", () => {
  it("POSTs the request envelope and returns the token as channelRef", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const res = await createWebhookChannel({ url: "https://hook/x", fetchImpl }).request(ctx);
    expect(res.channelRef).toBe("t");
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe("https://hook/x");
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.type).toBe("approval.request");
    expect(body.token).toBe("t");
    expect(body.intentKind).toBe("deploy.request");
  });

  it("forwards the approve/decline deep links in the POST body (accessibility)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await createWebhookChannel({ url: "u", fetchImpl }).request(ctxWithLinks);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.approveUrl).toBe("https://app.test/approve/t");
    expect(body.declineUrl).toBe("https://app.test/decline/t");
  });

  it("merges custom headers and throws on a non-ok response", async () => {
    const ok = vi.fn(async () => ({ ok: true }));
    await createWebhookChannel({ url: "u", headers: { authorization: "Bearer x" }, fetchImpl: ok }).request(ctx);
    expect((ok.mock.calls[0]![1] as { headers: Record<string, string> }).headers.authorization).toBe("Bearer x");

    const ch = createWebhookChannel({ url: "u", fetchImpl: async () => ({ ok: false }) });
    await expect(ch.request(ctx)).rejects.toThrow(/non-ok/);
  });
});

// ── deep-link rendering through summarize() (accessibility / multi-modal) ─────
describe("approve/decline deep links render into the channel message body", () => {
  it("slack text includes both deep links when present", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await createSlackChannel({ webhookUrl: "u", fetchImpl }).request(ctxWithLinks);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.text).toContain("approve: https://app.test/approve/t");
    expect(body.text).toContain("decline: https://app.test/decline/t");
  });

  it("teams MessageCard text includes the deep links", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await createTeamsChannel({ webhookUrl: "u", fetchImpl }).request(ctxWithLinks);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.text).toContain("approve: https://app.test/approve/t");
    expect(body.text).toContain("decline: https://app.test/decline/t");
  });

  it("email body includes the deep links", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    await createEmailChannel({ to: "ops@x.test", send }).request(ctxWithLinks);
    const msg = send.mock.calls[0]![0] as { body: string };
    expect(msg.body).toContain("approve: https://app.test/approve/t");
    expect(msg.body).toContain("decline: https://app.test/decline/t");
  });

  it("renders NO link line when neither approveUrl nor declineUrl is supplied", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await createSlackChannel({ webhookUrl: "u", fetchImpl }).request(ctx); // no links
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.text).not.toContain("approve:");
    expect(body.text).not.toContain("decline:");
    // The prompt + header still render.
    expect(body.text).toContain("Approve?");
    expect(body.text).toContain("deploy.request");
  });
});

// ── console-log reference channel (zero-dependency, records deliveries) ───────
describe("console-log reference channel", () => {
  it("records each delivery in memory and returns a log channelRef", async () => {
    const channel = createConsoleLogChannel();
    expect(channel.id).toBe("console-log");
    expect(channel.delivered).toHaveLength(0);

    const res = await channel.request(ctxWithLinks);
    expect(res.channelRef).toBe("log-t");
    expect(channel.delivered).toHaveLength(1);
    // The full context (incl. the deep links) is captured for inspection.
    expect(channel.delivered[0]).toEqual(ctxWithLinks);
  });

  it("requires no transport injection (zero-dependency reference channel)", async () => {
    const channel = createConsoleLogChannel();
    await channel.request(ctx);
    await channel.request({ ...ctx, token: "t2" });
    expect(channel.delivered.map((d) => d.token)).toEqual(["t", "t2"]);
  });

  it("notifyResolved is a safe no-op (the log channel does not edit messages)", async () => {
    const channel = createConsoleLogChannel();
    await expect(
      channel.notifyResolved!(ctx, { status: "approved", by: { id: "alice" } }),
    ).resolves.toBeUndefined();
  });
});
