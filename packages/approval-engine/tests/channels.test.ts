import { describe, expect, it, vi } from "vitest";
import {
  createEmailChannel,
  createSlackChannel,
  createTeamsChannel,
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
  });
});
