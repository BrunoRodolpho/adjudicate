/**
 * `AuditEventBus` — in-memory + Redis pub/sub backed real-time fan-out.
 *
 * Tests cover the load-bearing semantics:
 *   - Subscribe → publish → handler invocation order
 *   - Handler errors do not affect siblings
 *   - bridgeAuditSinkToBus: durable-first, bus-second; bus failure
 *     does NOT roll back durable write
 *   - Unsubscribe stops further notifications
 *   - subscriberCount tracks lifecycle
 *   - Redis bus: SUBSCRIBE on first handler, UNSUBSCRIBE on last
 */

import { describe, expect, it, vi } from "vitest";
import type { AuditRecord, AuditSink } from "@adjudicate/core";
import {
  bridgeAuditSinkToBus,
  createInMemoryAuditEventBus,
  createRedisAuditEventBus,
} from "../src/event-bus.js";
import type { RedisPubSubClient } from "../src/kill-switch-pubsub.js";
import type { InMemoryAuditEventBusOptions } from "../src/event-bus.js";

function recordOf(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    version: 4,
    auditRecordVersion: 4,
    intentHash: "test-hash",
    at: "2026-05-20T00:00:00.000Z",
    durationMs: 1,
    envelope: {
      version: 2,
      kind: "test.intent",
      payload: {},
      createdAt: "2026-05-20T00:00:00.000Z",
      nonce: "n-1",
      actor: { principal: "test", sessionId: "s-1" },
      taint: "UNTRUSTED",
      intentHash: "test-hash",
    },
    decision: {
      kind: "EXECUTE",
      basisCodes: ["state:transition_valid"],
    },
    decision_basis: [{ category: "state", code: "transition_valid" }],
    ...overrides,
  } as AuditRecord;
}

function fakePubSub(): RedisPubSubClient & {
  publishedCount: number;
  subscribedChannels: string[];
} {
  const listeners = new Map<string, Set<(m: string) => void>>();
  return {
    publishedCount: 0,
    subscribedChannels: [],
    async publish(channel, message) {
      this.publishedCount++;
      const set = listeners.get(channel);
      if (set === undefined) return 0;
      for (const h of set) {
        try {
          h(message);
        } catch {}
      }
      return set.size;
    },
    async subscribe(channel, handler) {
      this.subscribedChannels.push(channel);
      const set = listeners.get(channel) ?? new Set();
      set.add(handler);
      listeners.set(channel, set);
      return async () => {
        set.delete(handler);
      };
    },
  };
}

describe("createInMemoryAuditEventBus", () => {
  it("delivers records to all subscribers in registration order", async () => {
    const bus = createInMemoryAuditEventBus();
    const log: string[] = [];
    bus.subscribe((r) => log.push(`a:${r.intentHash}`));
    bus.subscribe((r) => log.push(`b:${r.intentHash}`));

    await bus.publish(recordOf({ intentHash: "h-1" }));
    expect(log).toEqual(["a:h-1", "b:h-1"]);
  });

  it("subscriberCount reflects subscribe/unsubscribe", () => {
    const bus = createInMemoryAuditEventBus();
    expect(bus.subscriberCount()).toBe(0);
    const u1 = bus.subscribe(() => {});
    const u2 = bus.subscribe(() => {});
    expect(bus.subscriberCount()).toBe(2);
    u1();
    expect(bus.subscriberCount()).toBe(1);
    u2();
    expect(bus.subscriberCount()).toBe(0);
  });

  it("handler errors do NOT affect siblings", async () => {
    const bus = createInMemoryAuditEventBus();
    const log: string[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((r) => log.push(`alive:${r.intentHash}`));
    await bus.publish(recordOf({ intentHash: "h-1" }));
    expect(log).toEqual(["alive:h-1"]);
  });

  it("unsubscribe mid-fan-out preserves snapshot semantics", async () => {
    const bus = createInMemoryAuditEventBus();
    const log: string[] = [];
    const u1 = bus.subscribe((r) => {
      log.push(`a:${r.intentHash}`);
      u1(); // unsubscribe self
    });
    bus.subscribe((r) => log.push(`b:${r.intentHash}`));
    await bus.publish(recordOf({ intentHash: "h-1" }));
    // Snapshot semantics: 'a' fires once even though it unsubscribes mid-fanout
    expect(log).toEqual(["a:h-1", "b:h-1"]);
    await bus.publish(recordOf({ intentHash: "h-2" }));
    // After unsubscribe, 'a' no longer fires
    expect(log).toEqual(["a:h-1", "b:h-1", "b:h-2"]);
  });

  // ── PerformanceReviewer-006: O(1) unsubscribe via Map token ──────────────
  it("unsubscribe removes exactly the right handler (O(1), by token not value-scan)", async () => {
    const bus = createInMemoryAuditEventBus();
    const logA: string[] = [];
    const logB: string[] = [];
    const unsubA = bus.subscribe((r) => logA.push(r.intentHash));
    bus.subscribe((r) => logB.push(r.intentHash));

    await bus.publish(recordOf({ intentHash: "h-1" }));
    expect(logA).toEqual(["h-1"]);
    expect(logB).toEqual(["h-1"]);

    unsubA();
    expect(bus.subscriberCount()).toBe(1);

    await bus.publish(recordOf({ intentHash: "h-2" }));
    // A was unsubscribed — only B receives further records.
    expect(logA).toEqual(["h-1"]);
    expect(logB).toEqual(["h-1", "h-2"]);
  });

  it("registering the same handler function twice creates two distinct subscriptions", async () => {
    const bus = createInMemoryAuditEventBus();
    const log: string[] = [];
    const handler = (r: AuditRecord): void => { log.push(r.intentHash); };
    const u1 = bus.subscribe(handler);
    bus.subscribe(handler);
    expect(bus.subscriberCount()).toBe(2);
    await bus.publish(recordOf({ intentHash: "h-1" }));
    expect(log).toEqual(["h-1", "h-1"]);
    // Unsubscribing u1 removes exactly one of the two registrations.
    u1();
    expect(bus.subscriberCount()).toBe(1);
    await bus.publish(recordOf({ intentHash: "h-2" }));
    expect(log).toEqual(["h-1", "h-1", "h-2"]);
  });

  // ── MemoryReviewer-009: maxSubscribers cap ───────────────────────────────
  it("maxSubscribers: throws when limit is exceeded", () => {
    const opts: InMemoryAuditEventBusOptions = { maxSubscribers: 2 };
    const bus = createInMemoryAuditEventBus(opts);
    bus.subscribe(() => {});
    bus.subscribe(() => {});
    expect(() => bus.subscribe(() => {})).toThrow(/maxSubscribers limit/);
  });

  it("maxSubscribers: allows re-subscribe after unsubscribe frees a slot", () => {
    const opts: InMemoryAuditEventBusOptions = { maxSubscribers: 1 };
    const bus = createInMemoryAuditEventBus(opts);
    const unsub = bus.subscribe(() => {});
    expect(() => bus.subscribe(() => {})).toThrow(/maxSubscribers limit/);
    unsub();
    // Freed a slot — this must NOT throw.
    expect(() => bus.subscribe(() => {})).not.toThrow();
  });

  // ── ErrorReviewer-007: onHandlerFailure callback ─────────────────────────
  it("onHandlerFailure is invoked when a handler throws, without affecting siblings", async () => {
    const failures: Array<{ err: unknown; record: AuditRecord }> = [];
    const opts: InMemoryAuditEventBusOptions = {
      onHandlerFailure: (err, record) => failures.push({ err, record }),
    };
    const bus = createInMemoryAuditEventBus(opts);
    const log: string[] = [];
    bus.subscribe(() => { throw new Error("handler-boom"); });
    bus.subscribe((r) => log.push(r.intentHash));

    const rec = recordOf({ intentHash: "h-err" });
    await bus.publish(rec);

    expect(log).toEqual(["h-err"]); // sibling unaffected
    expect(failures).toHaveLength(1);
    expect(failures[0]!.err).toBeInstanceOf(Error);
    expect((failures[0]!.err as Error).message).toBe("handler-boom");
    expect(failures[0]!.record.intentHash).toBe("h-err");
  });
});

describe("bridgeAuditSinkToBus", () => {
  it("emits to durable sink first, then bus", async () => {
    const order: string[] = [];
    const sink: AuditSink = {
      async emit() {
        order.push("sink");
      },
    };
    const bus = createInMemoryAuditEventBus();
    bus.subscribe(() => order.push("bus"));

    const wired = bridgeAuditSinkToBus(sink, bus);
    await wired.emit(recordOf());
    expect(order).toEqual(["sink", "bus"]);
  });

  it("durable failure propagates and bus is NOT touched", async () => {
    const sink: AuditSink = {
      async emit() {
        throw new Error("durable failed");
      },
    };
    const bus = createInMemoryAuditEventBus();
    const publishSpy = vi.spyOn(bus, "publish");
    const wired = bridgeAuditSinkToBus(sink, bus);

    await expect(wired.emit(recordOf())).rejects.toThrow("durable failed");
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("bus failure does NOT propagate and does NOT roll back durable write", async () => {
    let sinkCalls = 0;
    const sink: AuditSink = {
      async emit() {
        sinkCalls++;
      },
    };
    const failures: Array<{ intentHash: string; error: Error }> = [];
    const bus = {
      async publish() {
        throw new Error("bus down");
      },
      subscribe() {
        return () => {};
      },
      subscriberCount() {
        return 0;
      },
    };
    const wired = bridgeAuditSinkToBus(sink, bus, {
      onBusFailure: (e) => failures.push(e),
    });

    await expect(wired.emit(recordOf({ intentHash: "h-1" }))).resolves.toBeUndefined();
    expect(sinkCalls).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.intentHash).toBe("h-1");
    expect(failures[0]!.error.message).toBe("bus down");
  });
});

describe("createRedisAuditEventBus", () => {
  it("publishes to the configured channel and delivers to subscribers", async () => {
    const pubsub = fakePubSub();
    const bus = createRedisAuditEventBus({
      pubsub,
      channel: "test.audit",
    });

    const received: AuditRecord[] = [];
    bus.subscribe((r) => received.push(r));
    // The subscribe is fire-and-forget — give it a tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(pubsub.subscribedChannels).toContain("test.audit");

    await bus.publish(recordOf({ intentHash: "h-1" }));
    expect(received).toHaveLength(1);
    expect(received[0]!.intentHash).toBe("h-1");
  });

  it("lazy-subscribes only when first handler registers", async () => {
    const pubsub = fakePubSub();
    const bus = createRedisAuditEventBus({ pubsub, channel: "test.audit" });

    // No subscribe yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(pubsub.subscribedChannels).toHaveLength(0);

    bus.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 10));
    expect(pubsub.subscribedChannels).toHaveLength(1);
  });

  it("survives malformed pub/sub messages without crashing", async () => {
    const listeners = new Map<string, Set<(m: string) => void>>();
    const pubsub: RedisPubSubClient = {
      async publish(channel, message) {
        const set = listeners.get(channel);
        if (set !== undefined) for (const h of set) h(message);
        return 0;
      },
      async subscribe(channel, handler) {
        const set = listeners.get(channel) ?? new Set();
        set.add(handler);
        listeners.set(channel, set);
        return async () => {
          set.delete(handler);
        };
      },
    };

    const warnings: Array<{ reason: string }> = [];
    const bus = createRedisAuditEventBus({
      pubsub,
      channel: "test.audit",
      logger: { warn: (e) => warnings.push(e) },
    });

    const received: AuditRecord[] = [];
    bus.subscribe((r) => received.push(r));
    await new Promise((r) => setTimeout(r, 10));

    // Send garbage directly through pub/sub.
    const set = listeners.get("test.audit")!;
    for (const h of set) h("not json");

    expect(received).toHaveLength(0);
    expect(warnings.some((w) => w.reason.startsWith("parse:"))).toBe(true);
  });
});
