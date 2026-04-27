/**
 * Coverage for the strict-audit primitives:
 *   - multiSinkStrict — at-least-once fan-out
 *   - bufferedSink    — bounded replay queue
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  basis,
  BASIS_CODES,
  type AuditRecord,
} from "@adjudicate/core";
import {
  AuditSinkError,
  bufferedSink,
  multiSinkStrict,
  type AuditSink,
} from "../src/sink.js";

function record(suffix = "1"): AuditRecord {
  const env = buildEnvelope({
    kind: "order.tool.propose",
    payload: { toolName: "add_item", suffix },
    actor: { principal: "llm", sessionId: `s-${suffix}` },
    taint: "UNTRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
    ]),
    durationMs: 5,
    at: "2026-04-23T12:00:01.000Z",
  });
}

describe("multiSinkStrict", () => {
  it("fans out to every sink", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const sink = multiSinkStrict({ emit: a }, { emit: b });
    await sink.emit(record());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("rejects with AuditSinkError when any sink rejects", async () => {
    const good = vi.fn(async () => {});
    const bad = vi.fn(async () => {
      throw new Error("nats down");
    });
    const sink = multiSinkStrict({ emit: good }, { emit: bad });
    await expect(sink.emit(record())).rejects.toBeInstanceOf(AuditSinkError);
  });

  it("awaits successful sinks even when another rejects", async () => {
    const good = vi.fn(async () => {});
    const bad = vi.fn(async () => {
      throw new Error("postgres down");
    });
    const sink = multiSinkStrict({ emit: good }, { emit: bad });
    await sink.emit(record()).catch(() => {});
    expect(good).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("AuditSinkError carries the index and inner error of every failure", async () => {
    const good = vi.fn(async () => {});
    const bad1 = vi.fn(async () => {
      throw new Error("a");
    });
    const bad2 = vi.fn(async () => {
      throw new Error("b");
    });
    const sink = multiSinkStrict({ emit: good }, { emit: bad1 }, { emit: bad2 });
    let caught: AuditSinkError | undefined;
    try {
      await sink.emit(record());
    } catch (err) {
      caught = err as AuditSinkError;
    }
    expect(caught).toBeInstanceOf(AuditSinkError);
    expect(caught!.failures).toHaveLength(2);
    expect(caught!.failures[0]!.index).toBe(1);
    expect(caught!.failures[0]!.error.message).toBe("a");
    expect(caught!.failures[1]!.index).toBe(2);
    expect(caught!.failures[1]!.error.message).toBe("b");
  });

  it("normalizes non-Error rejections into Error instances", async () => {
    const bad: AuditSink = { emit: () => Promise.reject("string-reason") };
    const sink = multiSinkStrict(bad);
    let caught: AuditSinkError | undefined;
    try {
      await sink.emit(record());
    } catch (err) {
      caught = err as AuditSinkError;
    }
    expect(caught!.failures[0]!.error).toBeInstanceOf(Error);
    expect(caught!.failures[0]!.error.message).toBe("string-reason");
  });
});

describe("bufferedSink", () => {
  it("passes through to inner when inner is healthy", async () => {
    const inner = vi.fn(async () => {});
    const sink = bufferedSink({ inner: { emit: inner }, capacity: 4 });
    await sink.emit(record("1"));
    await sink.emit(record("2"));
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("enqueues on inner failure and rethrows", async () => {
    let healthy = false;
    const inner = vi.fn(async () => {
      if (!healthy) throw new Error("down");
    });
    const sink = bufferedSink({ inner: { emit: inner }, capacity: 4 });
    await expect(sink.emit(record("1"))).rejects.toThrow("down");
  });

  it("drains the queue in FIFO order on next successful emit", async () => {
    let healthy = false;
    const seen: string[] = [];
    const inner: AuditSink = {
      async emit(r) {
        if (!healthy) throw new Error("down");
        seen.push(r.envelope.actor.sessionId);
      },
    };
    const sink = bufferedSink({ inner, capacity: 4 });

    // Three failed emits — they enqueue in order.
    await sink.emit(record("1")).catch(() => {});
    await sink.emit(record("2")).catch(() => {});
    await sink.emit(record("3")).catch(() => {});

    // Recovery — the next emit drains the backlog in FIFO order, then the new
    // record itself.
    healthy = true;
    await sink.emit(record("4"));
    expect(seen).toEqual(["s-1", "s-2", "s-3", "s-4"]);
  });

  it("evicts the oldest record and calls onOverflow when capacity is exceeded", async () => {
    const inner = vi.fn(async () => {
      throw new Error("down");
    });
    const overflow = vi.fn();
    const sink = bufferedSink({
      inner: { emit: inner },
      capacity: 2,
      onOverflow: overflow,
    });

    await sink.emit(record("1")).catch(() => {});
    await sink.emit(record("2")).catch(() => {});
    // Third failure forces eviction of "s-1".
    await sink.emit(record("3")).catch(() => {});

    expect(overflow).toHaveBeenCalledTimes(1);
    expect(overflow.mock.calls[0]![0].envelope.actor.sessionId).toBe("s-1");
  });

  it("onOverflow callback errors do not break enqueue", async () => {
    const inner = vi.fn(async () => {
      throw new Error("down");
    });
    const sink = bufferedSink({
      inner: { emit: inner },
      capacity: 1,
      onOverflow: () => {
        throw new Error("overflow handler exploded");
      },
    });
    await sink.emit(record("1")).catch(() => {});
    // Eviction occurs here; onOverflow throws but the new record is still
    // enqueued and the caller sees the inner error, not the handler error.
    await expect(sink.emit(record("2"))).rejects.toThrow("down");
  });

  it("propagates inner failure from drain even when the new record never gets a chance", async () => {
    let attempts = 0;
    const inner: AuditSink = {
      async emit() {
        attempts++;
        throw new Error("still down");
      },
    };
    const sink = bufferedSink({ inner, capacity: 4 });
    await sink.emit(record("1")).catch(() => {});
    await expect(sink.emit(record("2"))).rejects.toThrow("still down");
    // First call attempted the new record; second call attempted to drain
    // the head of the queue (s-1) and failed there before trying s-2.
    expect(attempts).toBe(2);
  });
});
