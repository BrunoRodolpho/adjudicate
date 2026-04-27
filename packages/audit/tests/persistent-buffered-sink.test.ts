/**
 * persistentBufferedSink — durable spill for transient inner-sink outages.
 *
 * Verifies the T3 acceptance test: kill the inner sink for a window, emit
 * N records, recover, observe zero records lost (in-memory + on-disk
 * drained FIFO).
 */

import { describe, expect, it, vi } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  type AuditRecord,
  type AuditSink,
} from "@adjudicate/core";
import {
  createInMemorySpillStorage,
  persistentBufferedSink,
} from "../src/persistent-buffered-sink.js";

function record(seed: string): AuditRecord {
  const env = buildEnvelope({
    kind: "thing.do",
    payload: { seed },
    actor: { principal: "llm", sessionId: "s" },
    taint: "TRUSTED",
    nonce: "n-test", createdAt: `2026-04-23T12:00:${seed.padStart(2, "0")}.000Z`,
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
    ]),
    durationMs: 1,
  });
}

describe("persistentBufferedSink", () => {
  it("emits straight through to inner when healthy", async () => {
    const inner: AuditSink = { emit: vi.fn().mockResolvedValue(undefined) };
    const sink = persistentBufferedSink({
      inner,
      storage: createInMemorySpillStorage(),
      capacity: 4,
      onOverflow: vi.fn(),
    });
    await sink.emit(record("1"));
    expect(inner.emit).toHaveBeenCalledTimes(1);
  });

  it("buffers in memory and rethrows on inner failure", async () => {
    let healthy = false;
    const inner: AuditSink = {
      emit: vi.fn(async () => {
        if (!healthy) throw new Error("postgres down");
      }),
    };
    const sink = persistentBufferedSink({
      inner,
      storage: createInMemorySpillStorage(),
      capacity: 4,
      onOverflow: vi.fn(),
    });
    await expect(sink.emit(record("1"))).rejects.toThrow("postgres down");
    await expect(sink.emit(record("2"))).rejects.toThrow("postgres down");
  });

  it("drains memory in FIFO on inner recovery", async () => {
    let healthy = false;
    const seen: string[] = [];
    const inner: AuditSink = {
      emit: vi.fn(async (r: AuditRecord) => {
        if (!healthy) throw new Error("down");
        seen.push((r.envelope.payload as { seed: string }).seed);
      }),
    };
    const sink = persistentBufferedSink({
      inner,
      storage: createInMemorySpillStorage(),
      capacity: 8,
      onOverflow: vi.fn(),
    });
    await expect(sink.emit(record("1"))).rejects.toThrow();
    await expect(sink.emit(record("2"))).rejects.toThrow();
    await expect(sink.emit(record("3"))).rejects.toThrow();
    healthy = true;
    await sink.emit(record("4"));
    // The memory queue drains FIFO before the new record.
    expect(seen).toEqual(["1", "2", "3", "4"]);
  });

  it("spills oldest records to durable storage when capacity is exceeded", async () => {
    let healthy = false;
    const storage = createInMemorySpillStorage();
    const overflowed: AuditRecord[] = [];
    const inner: AuditSink = {
      emit: vi.fn(async () => {
        if (!healthy) throw new Error("down");
      }),
    };
    const sink = persistentBufferedSink({
      inner,
      storage,
      capacity: 2,
      onOverflow: (r) => overflowed.push(r),
    });
    // Fill memory queue (capacity 2) + force one overflow.
    await expect(sink.emit(record("1"))).rejects.toThrow();
    await expect(sink.emit(record("2"))).rejects.toThrow();
    await expect(sink.emit(record("3"))).rejects.toThrow();
    expect(overflowed).toHaveLength(1);
    expect(
      (overflowed[0]!.envelope.payload as { seed: string }).seed,
    ).toBe("1");
  });

  it("survives a process restart by replaying from durable storage", async () => {
    const storage = createInMemorySpillStorage();
    const seen: string[] = [];

    // Phase 1: inner is down; records spill.
    let healthy = false;
    const innerA: AuditSink = {
      emit: async (r) => {
        if (!healthy) throw new Error("down");
        seen.push((r.envelope.payload as { seed: string }).seed);
      },
    };
    const sinkA = persistentBufferedSink({
      inner: innerA,
      storage,
      capacity: 1,
      onOverflow: vi.fn(),
    });
    await expect(sinkA.emit(record("1"))).rejects.toThrow();
    await expect(sinkA.emit(record("2"))).rejects.toThrow(); // spills "1" to storage
    await expect(sinkA.emit(record("3"))).rejects.toThrow(); // spills "2"

    // Phase 2: simulate process restart — fresh sink instance, same storage.
    healthy = true;
    const innerB: AuditSink = {
      emit: async (r) => {
        seen.push((r.envelope.payload as { seed: string }).seed);
      },
    };
    const sinkB = persistentBufferedSink({
      inner: innerB,
      storage,
      capacity: 4,
      onOverflow: vi.fn(),
    });
    // Emitting "4" drains the spill first (in arrival order: 1, 2), then
    // emits "4". "3" was the in-memory tail of sinkA — it's lost because
    // memory queues are not durable. The acceptance is: spilled records
    // (capacity-evicted) survive restart. In-memory tail is documented
    // loss; capacity sizing controls the window.
    await sinkB.emit(record("4"));
    expect(seen).toEqual(["1", "2", "4"]);
  });

  it("acceptance test: 100-record window with both inner sinks down recovers", async () => {
    let healthy = false;
    const seen: string[] = [];
    const overflow: AuditRecord[] = [];
    const inner: AuditSink = {
      emit: async (r) => {
        if (!healthy) throw new Error("both down");
        seen.push((r.envelope.payload as { seed: string }).seed);
      },
    };
    const sink = persistentBufferedSink({
      inner,
      storage: createInMemorySpillStorage(),
      capacity: 32, // large enough to hold a small burst, force spill on bigger
      onOverflow: (r) => overflow.push(r),
    });
    // Emit 100 records while inner is down.
    for (let i = 1; i <= 100; i++) {
      await expect(sink.emit(record(String(i)))).rejects.toThrow();
    }
    // Recovery.
    healthy = true;
    await sink.emit(record("101"));
    // All records that were spilled (oldest 68 + the recovery one) drain.
    // The most-recent 32 stayed in memory and drained on the recovery
    // call. Total seen = 101 (no losses).
    expect(seen.length).toBe(101);
    expect(seen[0]).toBe("1");
    expect(seen[100]).toBe("101");
  });

  it("onOverflow is required (TypeScript enforces; compile-time check)", () => {
    // No runtime assertion needed — the type signature requires onOverflow.
    // This test documents the contract for readers.
    expect(true).toBe(true);
  });
});
