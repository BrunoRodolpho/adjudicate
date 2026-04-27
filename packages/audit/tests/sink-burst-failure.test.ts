import { describe, expect, it, vi } from "vitest";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
} from "@adjudicate/core";
import {
  createNatsSink,
  NatsSinkError,
  type NatsPublisher,
} from "../src/sink-nats.js";

function record() {
  const env = buildEnvelope({
    kind: "order.tool.propose",
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint: "TRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([]),
    durationMs: 1,
  });
}

describe("NatsSink — burst-failure detection (P0-g)", () => {
  it("resets the counter on success", async () => {
    let attempts = 0;
    const publisher: NatsPublisher = {
      async publish() {
        attempts++;
        if (attempts <= 3) throw new Error("nats down");
      },
    };
    const sink = createNatsSink({ publisher, failureThreshold: 5 });
    // 3 failures
    await expect(sink.emit(record())).rejects.toThrow("nats down");
    await expect(sink.emit(record())).rejects.toThrow("nats down");
    await expect(sink.emit(record())).rejects.toThrow("nats down");
    // Now success — counter resets
    await expect(sink.emit(record())).resolves.toBeUndefined();
    // 4 more failures should NOT trip the threshold (5)
    attempts = 0; // reset for failure cycle
    publisher.publish = async () => {
      throw new Error("again down");
    };
    for (let i = 0; i < 4; i++) {
      await expect(sink.emit(record())).rejects.toThrow("again down");
    }
  });

  it("throws NatsSinkError after N consecutive failures", async () => {
    const publisher: NatsPublisher = {
      async publish() {
        throw new Error("offline");
      },
    };
    const sink = createNatsSink({ publisher, failureThreshold: 3 });
    await expect(sink.emit(record())).rejects.toThrow("offline");
    await expect(sink.emit(record())).rejects.toThrow("offline");
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
  });

  it("invokes onFailure callback on each failure", async () => {
    const onFailure = vi.fn();
    const publisher: NatsPublisher = {
      async publish() {
        throw new Error("oops");
      },
    };
    const sink = createNatsSink({ publisher, onFailure });
    await expect(sink.emit(record())).rejects.toThrow();
    await expect(sink.emit(record())).rejects.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.calls[0]![0]).toMatchObject({
      subject: "audit.intent.decision.v1",
      errorClass: "Error",
      consecutiveFailures: 1,
    });
    expect(onFailure.mock.calls[1]![0]!.consecutiveFailures).toBe(2);
  });

  it("default threshold is 10", async () => {
    const publisher: NatsPublisher = {
      async publish() {
        throw new Error("oops");
      },
    };
    const sink = createNatsSink({ publisher });
    // 9 failures should still throw the inner error, not NatsSinkError
    for (let i = 0; i < 9; i++) {
      await expect(sink.emit(record())).rejects.not.toThrow(NatsSinkError);
    }
    // 10th failure throws NatsSinkError
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
  });
});

describe("NatsSink — T3 half-open close (no 9-failure blind spot)", () => {
  it("after threshold trip, every failed emit throws NatsSinkError immediately", async () => {
    const publisher: NatsPublisher = {
      async publish() {
        throw new Error("offline");
      },
    };
    const sink = createNatsSink({ publisher, failureThreshold: 3 });
    // Trip the breaker.
    await expect(sink.emit(record())).rejects.toThrow("offline");
    await expect(sink.emit(record())).rejects.toThrow("offline");
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
    // Pre-T3: counter reset after trip; next 2 failures swallow into inner
    // error. T3 half-open: every subsequent failure throws NatsSinkError.
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
  });

  it("a successful emit while half-open closes the breaker", async () => {
    let attempts = 0;
    const publisher: NatsPublisher = {
      async publish() {
        attempts++;
        // First 3 fail (trip), 4th succeeds (close), 5th fails (start counting again).
        if (attempts <= 3) throw new Error("offline");
        if (attempts === 4) return; // success closes
        throw new Error("offline-again");
      },
    };
    const sink = createNatsSink({ publisher, failureThreshold: 3 });
    await expect(sink.emit(record())).rejects.toThrow();
    await expect(sink.emit(record())).rejects.toThrow();
    await expect(sink.emit(record())).rejects.toThrow(NatsSinkError);
    // Half-open + success → closed.
    await expect(sink.emit(record())).resolves.toBeUndefined();
    // Counter is back to 0; next failure is the first of a new cycle.
    await expect(sink.emit(record())).rejects.toThrow("offline-again");
    await expect(sink.emit(record())).rejects.toThrow("offline-again");
  });
});
