import { describe, expect, it } from "vitest";
import { createInMemoryApprovalRegistry, type ApprovalRequest } from "../src/index.js";

const base: ApprovalRequest = {
  token: "t1",
  sessionId: "s1",
  intentHash: "0x1",
  intentKind: "k",
  prompt: "p",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "pending",
  requestedAt: "2026-04-29T12:00:00.000Z",
};

describe("createInMemoryApprovalRegistry", () => {
  it("put/get round-trips and list filters by status/session", async () => {
    const r = createInMemoryApprovalRegistry();
    await r.put(base, 3600);
    await r.put({ ...base, token: "t2", sessionId: "s2", requestedAt: "2026-04-29T12:01:00.000Z" }, 3600);
    expect((await r.get("t1"))?.token).toBe("t1");
    expect((await r.list({ sessionId: "s2" })).length).toBe(1);
    expect((await r.list({ status: "pending" })).length).toBe(2);
  });

  it("markResolved transitions status and stamps resolvedBy", async () => {
    const r = createInMemoryApprovalRegistry({ nowIso: () => "2026-04-29T13:00:00.000Z" });
    await r.put(base, 3600);
    const resolved = await r.markResolved("t1", "approved", { id: "alice" });
    expect(resolved?.status).toBe("approved");
    expect(resolved?.resolvedBy?.id).toBe("alice");
    expect(resolved?.resolvedAt).toBe("2026-04-29T13:00:00.000Z");
  });

  it("expires entries past TTL", async () => {
    let t = 0;
    const r = createInMemoryApprovalRegistry({ nowMs: () => t });
    await r.put(base, 10); // expires at 10_000ms
    t = 11_000;
    expect(await r.get("t1")).toBeNull();
  });

  it("honors maxEntries by evicting the oldest", async () => {
    const r = createInMemoryApprovalRegistry({ maxEntries: 2 });
    await r.put({ ...base, token: "a" }, 3600);
    await r.put({ ...base, token: "b" }, 3600);
    await r.put({ ...base, token: "c" }, 3600);
    expect(await r.get("a")).toBeNull();
    expect((await r.list()).length).toBe(2);
  });
});
