import { describe, expect, it, vi } from "vitest";
import {
  createApprovalEngine,
  createConsoleLogChannel,
  createInMemoryApprovalRegistry,
  ApprovalError,
} from "../src/index.js";
import { baseRequest, fakeAgent } from "./helpers.js";

function makeEngine(confirmImpl?: Parameters<typeof fakeAgent>[0]) {
  const { agent, confirmCalls } = fakeAgent(confirmImpl);
  const channel = createConsoleLogChannel();
  const engine = createApprovalEngine<unknown, unknown, string[]>({
    agent,
    registry: createInMemoryApprovalRegistry(),
    channels: [channel],
    resolveStateContext: async () => ({ state: { fresh: true }, context: { c: 1 } }),
    now: () => "2026-04-29T12:00:00.000Z",
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
