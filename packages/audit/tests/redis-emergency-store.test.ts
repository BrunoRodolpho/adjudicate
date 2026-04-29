import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, GovernanceEvent } from "@adjudicate/admin-sdk";
import {
  createRedisEmergencyStateStore,
  type EmergencyHistoryLog,
} from "../src/redis-emergency-store.js";
import type { RedisLedgerClient } from "../src/ledger-redis.js";

/* ────────────────────────────────────────────────────────────────────────── */
/* Mocks                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

interface MockRedis extends RedisLedgerClient {
  store: Map<string, string>;
}

function createMockRedis(initial: Record<string, string> = {}): MockRedis {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
  };
}

function createMockHistoryLog(): {
  log: EmergencyHistoryLog;
  inserted: GovernanceEvent[];
  insertShouldFail: () => void;
} {
  const inserted: GovernanceEvent[] = [];
  let shouldFail = false;
  return {
    inserted,
    insertShouldFail: () => {
      shouldFail = true;
    },
    log: {
      async insert(event) {
        if (shouldFail) throw new Error("simulated history log failure");
        inserted.unshift(event);
      },
      async history(limit) {
        return inserted.slice(0, limit);
      },
    },
  };
}

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

const KEY = "test:adjudicate:kill-switch";

/* ────────────────────────────────────────────────────────────────────────── */
/* getState                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe("createRedisEmergencyStateStore — getState", () => {
  it("returns initial NORMAL state when Redis key is absent", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    const state = await store.getState();
    expect(state.status).toBe("NORMAL");
    expect(state.toggledBy.id).toBe("system");
    expect(state.toggledAt).toBe(new Date(0).toISOString());
  });

  it("reads kernel-only payload {active, reason} with default metadata fallbacks", async () => {
    const redis = createMockRedis({
      [KEY]: JSON.stringify({ active: true, reason: "kernel wrote this" }),
    });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    const state = await store.getState();
    expect(state.status).toBe("DENY_ALL");
    expect(state.reason).toBe("kernel wrote this");
    expect(state.toggledBy.id).toBe("system");
    expect(state.toggledAt).toBe(new Date(0).toISOString());
  });

  it("reads extended SDK payload with all four fields", async () => {
    const redis = createMockRedis({
      [KEY]: JSON.stringify({
        active: true,
        reason: "SDK wrote this",
        toggledAt: "2026-04-28T20:31:19.047Z",
        toggledBy: { id: "op-1", displayName: "Test Operator" },
      }),
    });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    const state = await store.getState();
    expect(state).toEqual({
      status: "DENY_ALL",
      reason: "SDK wrote this",
      toggledAt: "2026-04-28T20:31:19.047Z",
      toggledBy: { id: "op-1", displayName: "Test Operator" },
    });
  });

  it("throws helpful error on malformed JSON (NOT silent default)", async () => {
    const redis = createMockRedis({ [KEY]: "not-valid-json-{{{" });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    await expect(store.getState()).rejects.toThrow(
      /malformed JSON at key/,
    );
  });

  it("throws on payload missing active/reason", async () => {
    const redis = createMockRedis({ [KEY]: JSON.stringify({ foo: "bar" }) });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    await expect(store.getState()).rejects.toThrow(
      /missing active\/reason/,
    );
  });

  it("falls back to system actor when toggledBy is malformed", async () => {
    const redis = createMockRedis({
      [KEY]: JSON.stringify({
        active: false,
        reason: "ok",
        toggledBy: { displayName: "no id" }, // missing required id
      }),
    });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    const state = await store.getState();
    expect(state.toggledBy.id).toBe("system");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* update                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

describe("createRedisEmergencyStateStore — update", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T20:31:19.047Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions NORMAL → DENY_ALL: writes extended payload, emits event", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    const result = await store.update({
      newStatus: "DENY_ALL",
      reason: "Refund spike investigation",
      actor: operator,
    });

    expect(result.state.status).toBe("DENY_ALL");
    expect(result.state.reason).toBe("Refund spike investigation");
    expect(result.event).not.toBeNull();
    expect(result.event!.previousStatus).toBe("NORMAL");
    expect(result.event!.newStatus).toBe("DENY_ALL");

    // Verify Redis got the extended payload.
    const raw = redis.store.get(KEY);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.active).toBe(true);
    expect(parsed.reason).toBe("Refund spike investigation");
    expect(parsed.toggledAt).toBe("2026-04-28T20:31:19.047Z");
    expect(parsed.toggledBy).toEqual(operator);
  });

  it("timestamp consistency: state.toggledAt and event.at are byte-identical", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    const result = await store.update({
      newStatus: "DENY_ALL",
      reason: "Same instant guarantee",
      actor: operator,
    });

    // The user-flagged guardrail: state.toggledAt and event.at MUST match
    // byte-for-byte so cross-referencing Redis state and Postgres
    // governance log aligns to the millisecond.
    expect(result.state.toggledAt).toBe(result.event!.at);

    // And both match the Redis payload's toggledAt.
    const raw = redis.store.get(KEY)!;
    const parsed = JSON.parse(raw);
    expect(parsed.toggledAt).toBe(result.state.toggledAt);
  });

  it("is idempotent — same status returns no event, no Redis write", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    const result = await store.update({
      newStatus: "NORMAL",
      reason: "Already NORMAL — should be no-op",
      actor: operator,
    });

    expect(result.event).toBeNull();
    expect(redis.store.has(KEY)).toBe(false); // no SET
  });

  it("transitions DENY_ALL → NORMAL", async () => {
    const redis = createMockRedis({
      [KEY]: JSON.stringify({
        active: true,
        reason: "previously engaged",
        toggledAt: "2026-04-28T20:00:00.000Z",
        toggledBy: { id: "op-prev" },
      }),
    });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    const result = await store.update({
      newStatus: "NORMAL",
      reason: "Incident resolved at 20:31",
      actor: operator,
    });

    expect(result.state.status).toBe("NORMAL");
    expect(result.event!.previousStatus).toBe("DENY_ALL");
    expect(result.event!.newStatus).toBe("NORMAL");

    const raw = redis.store.get(KEY)!;
    const parsed = JSON.parse(raw);
    expect(parsed.active).toBe(false);
  });

  it("delegates to historyLog when provided (fire-and-forget on failure)", async () => {
    const redis = createMockRedis();
    const { log, inserted } = createMockHistoryLog();
    const store = createRedisEmergencyStateStore({
      redis,
      key: KEY,
      historyLog: log,
    });

    await store.update({
      newStatus: "DENY_ALL",
      reason: "Engagement recorded to log",
      actor: operator,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.previousStatus).toBe("NORMAL");
    expect(inserted[0]!.newStatus).toBe("DENY_ALL");
  });

  it("update succeeds even when historyLog.insert throws (fire-and-forget)", async () => {
    const redis = createMockRedis();
    const { log, insertShouldFail } = createMockHistoryLog();
    insertShouldFail();
    const store = createRedisEmergencyStateStore({
      redis,
      key: KEY,
      historyLog: log,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await store.update({
      newStatus: "DENY_ALL",
      reason: "log will fail but state must persist",
      actor: operator,
    });

    expect(result.state.status).toBe("DENY_ALL");
    expect(result.event).not.toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* The keystone: kernel-compat invariant                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("kernel-compat invariant — SDK-written payload parses under kernel parser", () => {
  it("kernel parser narrowing accepts extended SDK payload", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    await store.update({
      newStatus: "DENY_ALL",
      reason: "kernel-compat verification",
      actor: operator,
    });

    const raw = redis.store.get(KEY)!;
    const parsed = JSON.parse(raw) as Partial<{
      active: boolean;
      reason: string;
    }>;

    // This is the EXACT shape narrowing the kernel does at
    // distributed-kill-switch.ts:103–110. If this fails, the kernel
    // would reject the SDK's payload.
    expect(typeof parsed.active).toBe("boolean");
    expect(typeof parsed.reason).toBe("string");
    expect(parsed.active).toBe(true);
    expect(parsed.reason).toBe("kernel-compat verification");
  });

  it("active=false (NORMAL) also produces kernel-parseable payload", async () => {
    const redis = createMockRedis({
      [KEY]: JSON.stringify({
        active: true,
        reason: "starting in DENY_ALL",
      }),
    });
    const store = createRedisEmergencyStateStore({ redis, key: KEY });

    await store.update({
      newStatus: "NORMAL",
      reason: "back to normal — kernel-parseable too",
      actor: operator,
    });

    const raw = redis.store.get(KEY)!;
    const parsed = JSON.parse(raw) as Partial<{
      active: boolean;
      reason: string;
    }>;
    expect(typeof parsed.active).toBe("boolean");
    expect(typeof parsed.reason).toBe("string");
    expect(parsed.active).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* history                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

describe("createRedisEmergencyStateStore — history", () => {
  it("returns empty array when no historyLog provided", async () => {
    const redis = createMockRedis();
    const store = createRedisEmergencyStateStore({ redis, key: KEY });
    const events = await store.history(10);
    expect(events).toEqual([]);
  });

  it("delegates to historyLog when provided", async () => {
    const redis = createMockRedis();
    const { log } = createMockHistoryLog();
    const store = createRedisEmergencyStateStore({
      redis,
      key: KEY,
      historyLog: log,
    });

    await store.update({
      newStatus: "DENY_ALL",
      reason: "first transition",
      actor: operator,
    });
    await store.update({
      newStatus: "NORMAL",
      reason: "second transition",
      actor: operator,
    });

    const events = await store.history(10);
    expect(events).toHaveLength(2);
    expect(events[0]!.newStatus).toBe("NORMAL");
    expect(events[1]!.newStatus).toBe("DENY_ALL");
  });
});
