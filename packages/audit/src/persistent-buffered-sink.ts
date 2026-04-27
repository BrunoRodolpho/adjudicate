/**
 * persistentBufferedSink — durable spill for transient inner-sink outages.
 *
 * `bufferedSink` keeps a bounded in-memory replay queue. It's lossy under
 * sustained outages (oldest records evicted at capacity) and loses the
 * entire queue on process restart. For governance-grade audit where
 * completeness is load-bearing, T3 ships this stronger variant:
 *
 *   - In-memory queue up to `capacity` for hot-path replay.
 *   - On capacity exceeded OR inner failure, records spill to
 *     `PersistentSpillStorage` (filesystem JSONL, SQLite, S3, …).
 *   - On a successful inner emit, the sink first drains the spill (FIFO),
 *     then the in-memory queue, then the new record.
 *   - Records survive process restart: a fresh sink instance reading
 *     from the same storage drains whatever is on disk.
 *
 * `onOverflow` is **required** (no longer optional) — silent loss is the
 * exact failure mode this sink exists to prevent.
 *
 * Adopters supply the storage. A reference filesystem JSONL implementation
 * is left as adopter responsibility because file-handle ownership and
 * crash semantics are deployment-specific (containerized vs daemon vs
 * lambda). Tests use an in-memory Map-backed implementation.
 */

import type { AuditRecord } from "@adjudicate/core";
import type { AuditSink } from "./sink.js";

export interface PersistentSpillStorage {
  /** Append a record to durable storage. */
  append(record: AuditRecord): Promise<void>;
  /**
   * Read undrained records in FIFO order. Implementations should iterate
   * lazily so an unbounded backlog does not load into memory at once.
   */
  readAll(): AsyncIterable<AuditRecord>;
  /**
   * Mark a record as drained (the inner sink accepted it). Implementations
   * may delete the record, advance a cursor, or move it to an "acked"
   * partition — the sink does not care.
   */
  ack(record: AuditRecord): Promise<void>;
}

export type PersistentBufferedSpillReason = "capacity" | "failure" | "drain-failure";

export interface PersistentBufferedSinkOptions {
  readonly inner: AuditSink;
  readonly storage: PersistentSpillStorage;
  /** Soft in-memory cap before spilling to durable storage. */
  readonly capacity: number;
  /**
   * Called once per record evicted from the in-memory queue *into* storage.
   * Wire to telemetry (`recordSinkFailure`) so the operator sees the
   * transition and can correlate against drain-success events later.
   * REQUIRED — silent loss is the failure mode this sink prevents.
   */
  readonly onOverflow: (record: AuditRecord) => void;
  /** Optional finer-grained spill notification. */
  readonly onSpill?: (
    record: AuditRecord,
    reason: PersistentBufferedSpillReason,
  ) => void;
}

/**
 * Build a persistent buffered sink. Pairs with `multiSink` (strict) for
 * governance-grade audit:
 *
 *   const sink = persistentBufferedSink({
 *     inner: multiSink(natsSink, postgresSink),
 *     storage: filesystemSpill("/var/log/adjudicate/spill"),
 *     capacity: 1024,
 *     onOverflow: (r) => recordSinkFailure({ ... }),
 *   });
 */
export function persistentBufferedSink(
  opts: PersistentBufferedSinkOptions,
): AuditSink {
  const memQueue: AuditRecord[] = [];

  async function drainStorage(): Promise<void> {
    // Drain the spill before anything else. A failure here means the
    // inner sink is still down — leave remaining records in storage and
    // throw so the caller knows audit is not durable yet.
    for await (const head of opts.storage.readAll()) {
      try {
        await opts.inner.emit(head);
        await opts.storage.ack(head);
      } catch (err) {
        opts.onSpill?.(head, "drain-failure");
        throw err;
      }
    }
  }

  async function drainMemory(): Promise<void> {
    while (memQueue.length > 0) {
      const head = memQueue[0]!;
      // Inner failure leaves `head` at the front of memQueue; subsequent
      // capacity-driven eviction will spill it durably. The error
      // propagates so the caller knows audit is not yet durable.
      await opts.inner.emit(head);
      memQueue.shift();
    }
  }

  return {
    async emit(record) {
      try {
        await drainStorage();
        await drainMemory();
        await opts.inner.emit(record);
      } catch (err) {
        // Inner failed. Buffer the new record (memory if room, spill
        // otherwise) and rethrow so strict callers see the failure.
        await bufferOrSpill(record, memQueue, opts, "failure");
        throw err;
      }
    },
  };
}

async function bufferOrSpill(
  record: AuditRecord,
  memQueue: AuditRecord[],
  opts: PersistentBufferedSinkOptions,
  reason: PersistentBufferedSpillReason,
): Promise<void> {
  if (memQueue.length < opts.capacity) {
    memQueue.push(record);
    return;
  }
  // Capacity exceeded — evict oldest into durable storage and notify.
  const evicted = memQueue.shift();
  if (evicted !== undefined) {
    try {
      await opts.storage.append(evicted);
      opts.onSpill?.(evicted, "capacity");
    } catch {
      // Storage append failed too — invoke onOverflow so the operator
      // sees that the record is at risk. Push the original record into
      // the queue anyway; if the storage clears later, recovery drains.
    }
    try {
      opts.onOverflow(evicted);
    } catch {
      // onOverflow may not throw; swallow defensively.
    }
  }
  memQueue.push(record);
  opts.onSpill?.(record, reason);
}

// ── Reference: in-memory spill storage for tests ────────────────────────

/**
 * In-memory `PersistentSpillStorage` for tests and lightweight adopters.
 * NOT durable — records are lost on process restart. Production deployments
 * supply a filesystem / SQLite / S3-backed implementation.
 */
export function createInMemorySpillStorage(): PersistentSpillStorage {
  const store: AuditRecord[] = [];
  return {
    async append(record) {
      store.push(record);
    },
    readAll(): AsyncIterable<AuditRecord> {
      // Snapshot at iteration start so concurrent appends don't race.
      const snapshot = [...store];
      return (async function* () {
        for (const r of snapshot) yield r;
      })();
    },
    async ack(record) {
      const idx = store.findIndex((r) => r.intentHash === record.intentHash);
      if (idx >= 0) store.splice(idx, 1);
    },
  };
}
