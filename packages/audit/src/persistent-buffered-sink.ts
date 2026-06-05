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

import { recordSinkFailure } from "@adjudicate/core/kernel";

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
  // ConcurrencyReviewer-004: `memQueue` (and the spill drain) are mutated
  // across multiple `await` points per emit. Concurrent emits would
  // interleave those mutations and corrupt FIFO order / drop records.
  // Serialize every emit onto a per-instance promise chain.
  const serialize = makeSerializer();

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
    emit(record) {
      return serialize(async () => {
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
      });
    },
  };
}

/**
 * ConcurrencyReviewer-004: per-instance serializer. Chains each unit of work
 * onto the previous so emits run strictly one-at-a-time. Callers get their
 * own task's resolution/rejection; the internal chain swallows rejections so
 * a single failed emit does not wedge subsequent emits.
 */
function makeSerializer(): (fn: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
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
    } catch (err) {
      // ErrorReviewer-002: storage append failed — the evicted record is
      // lost. Signal via recordSinkFailure so the operator knows the spill
      // storage is also broken. onOverflow below still fires unconditionally.
      recordSinkFailure({
        sink: "buffered",
        subject: "persistentBufferedSink.storage.append",
        errorClass: err instanceof Error ? err.name : "non_error",
        consecutiveFailures: 1,
      });
    }
    try {
      opts.onOverflow(evicted);
    } catch (err) {
      // ErrorReviewer-008: onOverflow must not throw (contract:
      // PersistentBufferedSinkOptions.onOverflow). Route the adopter bug
      // through recordSinkFailure so it is visible via the metrics pipeline
      // rather than silently lost. The swallow is preserved so a buggy
      // callback cannot wedge the emit path.
      recordSinkFailure({
        sink: "buffered",
        subject: "persistentBufferedSink.onOverflow",
        errorClass: err instanceof Error ? err.name : "non_error",
        consecutiveFailures: 1,
      });
    }
  }
  memQueue.push(record);
  opts.onSpill?.(record, reason);
}

// ── Reference: in-memory spill storage for tests ────────────────────────

/**
 * A tagged wrapper so the storage layer can track records by a unique
 * sequence id rather than by `intentHash`. This closes two bugs:
 *
 *   - ConcurrencyReviewer-005: `ack` previously used `findIndex` on
 *     `intentHash`, which would remove the FIRST matching record under
 *     duplicate-intentHash scenarios (e.g., retried emits). Now each
 *     appended record gets a monotone sequence id; `ack` removes by id.
 *
 *   - MemoryReviewer-007: the internal Map is bounded by `maxSize`
 *     (default: unlimited for the reference implementation — callers that
 *     need a hard cap pass it explicitly). `ack` is O(1) via Map delete.
 */
interface StorageEntry {
  readonly seqId: number;
  readonly record: AuditRecord;
}

export interface InMemorySpillStorageOptions {
  /**
   * Maximum number of records held in the spill store before the
   * oldest record is evicted (drop-oldest policy). Default: unlimited.
   * Wire a finite cap here when process memory is constrained; pair with
   * an `onOverflow` / telemetry sink at the `persistentBufferedSink`
   * level to observe the drop.
   */
  readonly maxSize?: number;
}

/**
 * In-memory `PersistentSpillStorage` for tests and lightweight adopters.
 * NOT durable — records are lost on process restart. Production deployments
 * supply a filesystem / SQLite / S3-backed implementation.
 *
 * Uses a monotone sequence id as the primary key so `ack` is O(1) and
 * duplicate-intentHash records are handled correctly (each append is a
 * distinct entry; `ack` removes the exact record, not the first match).
 */
export function createInMemorySpillStorage(
  opts: InMemorySpillStorageOptions = {},
): PersistentSpillStorage {
  // Ordered insertion via a Map keyed by seqId (insertion-order iteration
  // gives FIFO readAll without an extra array). Bounded by maxSize with a
  // drop-oldest eviction policy when the cap is exceeded.
  const store = new Map<number, StorageEntry>();
  let nextSeq = 0;

  function appendEntry(record: AuditRecord): void {
    if (opts.maxSize !== undefined && store.size >= opts.maxSize) {
      // Drop-oldest: remove the first (lowest seqId) entry.
      const firstKey = store.keys().next().value;
      if (firstKey !== undefined) store.delete(firstKey);
    }
    const seqId = nextSeq++;
    store.set(seqId, { seqId, record });
  }

  // The `PersistentSpillStorage.ack` signature accepts only an
  // `AuditRecord`, so we need a way to look up the seqId for the exact
  // entry that was yielded by `readAll`. We do this by attaching a
  // non-enumerable `__seqId` property to the yielded record reference.
  // The property is invisible to JSON serialisation and does not affect
  // the AuditRecord shape.
  const SEQ_KEY = Symbol("spill_seqId");

  return {
    async append(record) {
      appendEntry(record);
    },
    readAll(): AsyncIterable<AuditRecord> {
      // Snapshot entry list at iteration start so concurrent appends
      // during readAll don't cause us to yield freshly-appended records
      // in the same drain pass.
      const snapshot = Array.from(store.values());
      return (async function* () {
        for (const entry of snapshot) {
          // Tag the yielded record with its seqId so ack can find it in
          // O(1). We use a Symbol property to stay invisible to spread /
          // JSON and avoid mutating the original record shape.
          const tagged = Object.assign(Object.create(null) as object, entry.record, {
            [SEQ_KEY]: entry.seqId,
          }) as AuditRecord & { [SEQ_KEY]: number };
          yield tagged;
        }
      })();
    },
    async ack(record) {
      // Fast path: if the record was tagged with a seqId by readAll, use it.
      const tagged = record as AuditRecord & { [SEQ_KEY]?: number };
      const seqId = tagged[SEQ_KEY];
      if (seqId !== undefined) {
        store.delete(seqId);
        return;
      }
      // Fallback (e.g., record not tagged — shouldn't happen in normal
      // usage but handle defensively): scan for first match by intentHash.
      for (const [key, entry] of store) {
        if (entry.record.intentHash === record.intentHash) {
          store.delete(key);
          return;
        }
      }
    },
  };
}
