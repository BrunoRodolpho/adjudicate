import { describe, expect, it, vi } from "vitest";
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
