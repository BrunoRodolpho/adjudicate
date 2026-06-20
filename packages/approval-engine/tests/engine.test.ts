import { describe, expect, it, vi } from "vitest";
import { confirmationBindingMatches } from "@adjudicate/core";
import {
  createApprovalEngine,
  createConsoleLogChannel,
  createInMemoryApprovalRegistry,
  ApprovalError,
} from "../src/index.js";
import { baseRequest, fakeAgent } from "./helpers.js";

function makeEngine(
  confirmImpl?: Parameters<typeof fakeAgent>[0],
  extra: Partial<Parameters<typeof createApprovalEngine<unknown, unknown, string[]>>[0]> = {},
) {
  const { agent, confirmCalls } = fakeAgent(confirmImpl);
  const channel = createConsoleLogChannel();
  const engine = createApprovalEngine<unknown, unknown, string[]>({
    agent,
    registry: createInMemoryApprovalRegistry(),
    channels: [channel],
    resolveStateContext: async () => ({ state: { fresh: true }, context: { c: 1 } }),
    now: () => "2026-04-29T12:00:00.000Z",
    ...extra,
  });
  return { engine, channel, confirmCalls };
}

describe("createApprovalEngine — request", () => {
  it("records a projection and fans out to the channel", async () => {
    const { engine, channel } = makeEngine();
    const req = await engine.request(baseRequest);
    expect(req.status).toBe("pending");
    expect(req.channel).toBe("console-log");
    expect(channel.delivered.length).toBe(1);
    expect((await engine.list({ status: "pending" })).length).toBe(1);
  });
});

describe("createApprovalEngine — resolve", () => {
  it("approve calls agent.confirm with accepted:true and fresh state/context", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    const { request, turn } = await engine.resolve({ token: "tok-1", accepted: true, by: { id: "alice" } });
    expect(confirmCalls[0]).toMatchObject({ confirmationToken: "tok-1", accepted: true, state: { fresh: true } });
    expect(request.status).toBe("approved");
    expect(turn.outcome.kind).toBe("completed");
  });

  it("decline calls agent.confirm with accepted:false", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    const { request } = await engine.resolve({ token: "tok-1", accepted: false });
    expect(confirmCalls[0]!.accepted).toBe(false);
    expect(request.status).toBe("declined");
  });

  // ── 071 — approver/channel binding threaded into the forwarded receipt ──────
  it("071: an accepted resolve forwards (approver, channel) binding into agent.confirm", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest); // routed to console-log → req.channel = "console-log"
    await engine.resolve({ token: "tok-1", accepted: true, by: { id: "alice" } });

    expect(confirmCalls[0]!.binding).toEqual({
      // approver carries no `requested` value (proposer surface is plan 072) —
      // recorded forensically, not gated.
      approver: { confirmed: "alice" },
      // channel is BOTH the issued-against value and the resolved value: a
      // forwarded resolve cannot retroactively change the request's channel.
      channel: { confirmed: "console-log", requested: "console-log" },
    });
  });

  it("071: a declined resolve forwards NO binding (a decline never overrides)", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: false, by: { id: "alice" } });
    // The `binding` key is omitted entirely on the decline path.
    expect(confirmCalls[0]).not.toHaveProperty("binding");
  });

  it("071: an accepted resolve without an approver still binds the channel", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true });
    expect(confirmCalls[0]!.binding).toEqual({
      channel: { confirmed: "console-log", requested: "console-log" },
    });
    expect(confirmCalls[0]!.binding).not.toHaveProperty("approver");
  });

  // ── H7 — channel-binding gate is meaningful (not tautological) ──────────────
  // Pre-fix the engine sourced BOTH `requested` and `confirmed` from
  // `existing.channel`, so the kernel gate `confirmationBindingMatches` always
  // saw requested === confirmed and could NEVER refuse a confirmation arriving
  // on a different channel than the request was minted on. After the fix
  // `confirmed` comes from the CONFIRM-time `resolve({ channel })` while
  // `requested` stays the REQUEST-time channel (`existing.channel`), so a
  // cross-channel confirmation produces requested !== confirmed and the kernel
  // gate REFUSES it (fail-closed). These tests feed the engine-produced binding
  // straight into the real kernel gate to prove it is now non-vacuous.
  it("H7: a confirm-time channel that DIFFERS from the request channel ⇒ kernel gate REFUSES (binding mismatch)", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest); // request minted on "console-log"
    // The confirmation arrives on a DIFFERENT channel than the request.
    await engine.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "alice" },
      channel: "email",
    });
    // The forwarded binding records the real, DISTINCT pair (not tautological).
    expect(confirmCalls[0]!.binding).toEqual({
      approver: { confirmed: "alice" },
      channel: { confirmed: "email", requested: "console-log" },
    });
    // The kernel gate the engine feeds this into now REFUSES (requested !== confirmed).
    expect(
      confirmationBindingMatches(confirmCalls[0]!.binding),
    ).toBe(false);
  });

  it("H7: a confirm-time channel that MATCHES the request channel ⇒ kernel gate PASSES", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest); // request minted on "console-log"
    await engine.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "alice" },
      channel: "console-log", // same channel the request was issued on
    });
    expect(confirmCalls[0]!.binding).toEqual({
      approver: { confirmed: "alice" },
      channel: { confirmed: "console-log", requested: "console-log" },
    });
    expect(
      confirmationBindingMatches(confirmCalls[0]!.binding),
    ).toBe(true);
  });

  it("H7: an OMITTED confirm-time channel falls back to the request channel (back-compat, gate PASSES)", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true, by: { id: "alice" } });
    // No `channel` supplied → confirmed falls back to existing.channel, so the
    // pre-H7 byte-identical binding is preserved and the gate still passes.
    expect(confirmCalls[0]!.binding).toEqual({
      approver: { confirmed: "alice" },
      channel: { confirmed: "console-log", requested: "console-log" },
    });
    expect(
      confirmationBindingMatches(confirmCalls[0]!.binding),
    ).toBe(true);
  });
});

// ── 072 — separation-of-duty (four-eyes / maker-checker) ─────────────────────
describe("createApprovalEngine — separation-of-duty (072)", () => {
  it("rejects a self-approve (approver === proposer) fail-closed and never calls agent.confirm", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
    });
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    await expect(
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "alice" } }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    // The maker's own request stays pending — the guard runs BEFORE confirm().
    expect(confirmCalls.length).toBe(0);
    expect((await engine.get("tok-1"))?.status).toBe("pending");
  });

  it("allows a DIFFERENT approver to approve (approver !== proposer)", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
    });
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    const { request } = await engine.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "bob" },
    });
    expect(request.status).toBe("approved");
    expect(confirmCalls.length).toBe(1);
  });

  it("rejects the configured agent identity self-approving its own proposal", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
      agentIdentity: "the-agent",
    });
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    await expect(
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "the-agent" } }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    expect(confirmCalls.length).toBe(0);
  });

  it("fail-closed: rejects when the approver identity is missing under enforcement", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
    });
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    await expect(
      engine.resolve({ token: "tok-1", accepted: true }), // no `by`
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    expect(confirmCalls.length).toBe(0);
  });

  it("fail-closed: rejects when the request captured no proposer (requestedBy) under enforcement", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
    });
    await engine.request(baseRequest); // no requestedBy
    await expect(
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "bob" } }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    expect(confirmCalls.length).toBe(0);
  });

  it("a maker may still DECLINE their own request (a decline never authorizes)", async () => {
    const { engine, confirmCalls } = makeEngine(undefined, {
      enforceSeparationOfDuty: true,
    });
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    const { request } = await engine.resolve({
      token: "tok-1",
      accepted: false,
      by: { id: "alice" }, // proposer declining is fine
    });
    expect(request.status).toBe("declined");
    expect(confirmCalls.length).toBe(1); // confirm runs the decline path
  });

  it("default OFF (rollback flag, §7): a self-approve is permitted when enforcement is not enabled", async () => {
    const { engine, confirmCalls } = makeEngine(); // no enforceSeparationOfDuty
    await engine.request({ ...baseRequest, requestedBy: { id: "alice" } });
    const { request } = await engine.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "alice" },
    });
    expect(request.status).toBe("approved"); // pre-072 behavior preserved
    expect(confirmCalls.length).toBe(1);
  });
});

describe("createApprovalEngine — adversarial", () => {
  it("unknown token → UNKNOWN_TOKEN", async () => {
    const { engine } = makeEngine();
    await expect(engine.resolve({ token: "nope", accepted: true })).rejects.toBeInstanceOf(ApprovalError);
  });

  it("double-resolve → ALREADY_RESOLVED, no second confirm", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true });
    await expect(engine.resolve({ token: "tok-1", accepted: true })).rejects.toMatchObject({
      code: "ALREADY_RESOLVED",
    });
    expect(confirmCalls.length).toBe(1);
  });

  it("a tampered/single-use confirm rejection marks the projection expired (not approved)", async () => {
    const { engine } = makeEngine(async () => {
      throw new Error("confirmation_blob_tampered");
    });
    await engine.request(baseRequest);
    await expect(engine.resolve({ token: "tok-1", accepted: true })).rejects.toMatchObject({
      code: "CONFIRM_REJECTED",
    });
    expect((await engine.get("tok-1"))?.status).toBe("expired");
  });

  it("a channel failure surfaces CHANNEL_FAILED but still records the projection", async () => {
    const { agent } = fakeAgent();
    const failing = {
      id: "boom",
      request: vi.fn(async () => {
        throw new Error("delivery failed");
      }),
    };
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [failing],
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    await expect(engine.request(baseRequest)).rejects.toMatchObject({ code: "CHANNEL_FAILED" });
    expect((await engine.get("tok-1"))?.status).toBe("pending");
  });
});

// ── 073 — deterministic multi-modal fallback routing (first-successful-wins) ──
describe("createApprovalEngine — channel fallback routing (073)", () => {
  it("first successful channel wins: a failed channel falls through to the next", async () => {
    const { agent } = fakeAgent();
    const slackTry = vi.fn(async () => {
      throw new Error("slack down");
    });
    const emailTry = vi.fn(async () => ({ channelRef: "msg-99" }));
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      // declared order is the fallback order: slack first, then email.
      channels: [
        { id: "slack", request: slackTry },
        { id: "email", request: emailTry },
      ],
      resolveStateContext: async () => ({ state: {}, context: {} }),
      now: () => "2026-06-19T12:00:00.000Z",
    });

    const req = await engine.request(baseRequest);
    // slack was tried and failed; email succeeded and is the recorded channel.
    expect(slackTry).toHaveBeenCalledTimes(1);
    expect(emailTry).toHaveBeenCalledTimes(1);
    expect(req.channel).toBe("email");
    expect(req.channelRef).toBe("msg-99");
    expect(req.status).toBe("pending");
  });

  it("stops at the FIRST success — a later channel is never tried", async () => {
    const { agent } = fakeAgent();
    const slackTry = vi.fn(async () => ({ channelRef: "slack-ref" }));
    const emailTry = vi.fn(async () => ({ channelRef: "email-ref" }));
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [
        { id: "slack", request: slackTry },
        { id: "email", request: emailTry },
      ],
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    const req = await engine.request(baseRequest);
    expect(slackTry).toHaveBeenCalledTimes(1);
    expect(emailTry).not.toHaveBeenCalled(); // first success wins
    expect(req.channel).toBe("slack");
    expect(req.channelRef).toBe("slack-ref");
  });

  it("records the projection (status pending) when EVERY channel fails, then surfaces CHANNEL_FAILED", async () => {
    const { agent } = fakeAgent();
    const a = vi.fn(async () => {
      throw new Error("a down");
    });
    const b = vi.fn(async () => {
      throw new Error("b down");
    });
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [
        { id: "a", request: a },
        { id: "b", request: b },
      ],
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    await expect(engine.request(baseRequest)).rejects.toMatchObject({ code: "CHANNEL_FAILED" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // The display projection is still recorded so an out-of-band scheduler can act.
    const stored = await engine.get("tok-1");
    expect(stored?.status).toBe("pending");
    expect(stored?.channel).toBe("b"); // the last-attempted channel id
  });

  it("route() picks which channels (in order) are attempted", async () => {
    const { agent } = fakeAgent();
    const slackTry = vi.fn(async () => ({ channelRef: "slack-ref" }));
    const emailTry = vi.fn(async () => ({ channelRef: "email-ref" }));
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [
        { id: "slack", request: slackTry },
        { id: "email", request: emailTry },
      ],
      // route email-only.
      route: () => ["email"],
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    const req = await engine.request(baseRequest);
    expect(slackTry).not.toHaveBeenCalled();
    expect(emailTry).toHaveBeenCalledTimes(1);
    expect(req.channel).toBe("email");
  });

  it("threads adopter-built approve/decline deep links into the channel context", async () => {
    const { agent } = fakeAgent();
    const seen: Array<{ approveUrl?: string; declineUrl?: string }> = [];
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [
        {
          id: "spy",
          request: async (ctx) => {
            seen.push({ approveUrl: ctx.approveUrl, declineUrl: ctx.declineUrl });
            return { channelRef: "r" };
          },
        },
      ],
      buildLinks: (token) => ({
        approveUrl: `https://app.test/approve/${token}`,
        declineUrl: `https://app.test/decline/${token}`,
      }),
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    await engine.request(baseRequest);
    expect(seen[0]).toEqual({
      approveUrl: "https://app.test/approve/tok-1",
      declineUrl: "https://app.test/decline/tok-1",
    });
  });

  it("invokes notifyResolved on the resolving channel with the outcome + approver", async () => {
    const { agent } = fakeAgent();
    const notifyResolved = vi.fn(async () => {});
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [
        {
          id: "slack",
          request: async () => ({ channelRef: "msg-1" }),
          notifyResolved,
        },
      ],
      resolveStateContext: async () => ({ state: {}, context: {} }),
      now: () => "2026-06-19T12:00:00.000Z",
    });
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true, by: { id: "alice", displayName: "Alice" } });

    expect(notifyResolved).toHaveBeenCalledTimes(1);
    const [ctxArg, outcomeArg] = notifyResolved.mock.calls[0]!;
    // notifyResolved gets the original display context (NOT the binding/receipt).
    expect(ctxArg).toMatchObject({ token: "tok-1", intentKind: "deploy.request" });
    expect(ctxArg).not.toHaveProperty("approveUrl"); // built fresh from display fields only
    expect(outcomeArg).toEqual({ status: "approved", by: { id: "alice", displayName: "Alice" } });
  });

  it("a declined resolve still notifies the channel with status declined", async () => {
    const { agent } = fakeAgent();
    const notifyResolved = vi.fn(async () => {});
    const engine = createApprovalEngine<unknown, unknown, string[]>({
      agent,
      registry: createInMemoryApprovalRegistry(),
      channels: [{ id: "slack", request: async () => ({ channelRef: "m" }), notifyResolved }],
      resolveStateContext: async () => ({ state: {}, context: {} }),
    });
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: false, by: { id: "bob" } });
    expect(notifyResolved.mock.calls[0]![1]).toMatchObject({ status: "declined" });
  });
});
