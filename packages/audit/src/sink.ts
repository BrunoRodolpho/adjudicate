/**
 * AuditSink fan-out and decoration helpers.
 *
 * The AuditSink interface itself lives in `@adjudicate/core` so the kernel-
 * side audit emitter (`adjudicateAndAudit`) can depend on it without
 * inverting the package dependency. This module re-exports the type and
 * adds the fan-out + decoration wrappers.
 *
 * **T3 default flip:** `multiSink` is now strict (fails closed). Adopters
 * who want the previous fail-open behaviour call `multiSinkLossy`. The
 * old `multiSinkStrict` name is preserved as an alias for `multiSink` so
 * call sites that already opted in keep working.
 *
 * Decorators:
 *   - `bufferedSink`     — in-memory only, bounded replay queue.
 *     Lossy on overflow. For tests + lightweight adopters.
 *   - `persistentBufferedSink` (NEW, see ./persistent-buffered-sink.ts)
 *     — spills to durable storage on capacity / inner failure. Records
 *     survive process restart.
 */

import type { AuditRecord, AuditSink } from "@adjudicate/core";
import { recordSinkFailure } from "@adjudicate/core/kernel";

export type { AuditSink } from "@adjudicate/core";

/**
 * Aggregated error thrown by `multiSink` (and `multiSinkStrict`) when one
 * or more inner sinks rejected. Carries the originating errors so callers
 * can route per-sink failures to telemetry.
 */
export class AuditSinkError extends Error {
  constructor(
    public readonly failures: ReadonlyArray<{
      readonly index: number;
      readonly error: Error;
    }>,
  ) {
    super(
      `multiSink: ${failures.length} sink${failures.length === 1 ? "" : "s"} failed`,
    );
    this.name = "AuditSinkError";
  }
}

function fanOutStrict(sinks: readonly AuditSink[]): AuditSink {
  return {
    async emit(record) {
      const settled = await Promise.allSettled(
        sinks.map((s) => s.emit(record)),
      );
      const failures: Array<{ index: number; error: Error }> = [];
      settled.forEach((r, index) => {
        if (r.status === "rejected") {
          const error =
            r.reason instanceof Error
              ? r.reason
              : new Error(String(r.reason));
          failures.push({ index, error });
          // T3 second-order observability: a sink-of-sinks failure is now
          // visible via recordSinkFailure even when the throw is swallowed
          // upstream.
          recordSinkFailure({
            sink: "console",
            subject: `multiSink[${index}]`,
            errorClass: error.name,
            consecutiveFailures: 1,
          });
        }
      });
      if (failures.length > 0) {
        throw new AuditSinkError(failures);
      }
    },
  };
}

/**
 * Strict fan-out (T3 default). Awaits all sinks (does not short-circuit on
 * first failure) so successful sinks still land before the caller learns
 * about the failure. Rejects with `AuditSinkError` if any inner sink
 * rejected. Recommended composition for governance-grade audit.
 *
 * The previous `multiSink` semantic (fail-open) lives at `multiSinkLossy`.
 */
export function multiSink(...sinks: readonly AuditSink[]): AuditSink {
  return fanOutStrict(sinks);
}

/**
 * Alias for `multiSink` — the explicit-strict spelling existed before T3
 * for adopters who already wanted the strict semantics. Now both names
 * resolve to the same implementation.
 */
export function multiSinkStrict(...sinks: readonly AuditSink[]): AuditSink {
  return fanOutStrict(sinks);
}

/**
 * Lossy fan-out (the pre-T3 default). One sink's failure does not block
 * the others, and the caller does not learn about it. The replay harness
 * is the safety net.
 *
 * Use when you have explicitly accepted that audit completeness is not
 * load-bearing for the call site. **Not recommended for financial,
 * regulated, or kernel-enforced intent paths.** Each rejection is still
 * visible via `recordSinkFailure` for observability — the difference vs
 * `multiSink` is that `multiSinkLossy` does not throw.
 */
export function multiSinkLossy(...sinks: readonly AuditSink[]): AuditSink {
  return {
    async emit(record) {
      const settled = await Promise.allSettled(
        sinks.map((s) => s.emit(record)),
      );
      settled.forEach((r, index) => {
        if (r.status === "rejected") {
          const error =
            r.reason instanceof Error
              ? r.reason
              : new Error(String(r.reason));
          recordSinkFailure({
            sink: "console",
            subject: `multiSinkLossy[${index}]`,
            errorClass: error.name,
            consecutiveFailures: 1,
          });
        }
      });
    },
  };
}

export interface BufferedSinkOptions {
  readonly inner: AuditSink;
  /** Maximum records held in the replay queue. */
  readonly capacity: number;
  /**
   * Called once per record evicted because the queue was at capacity when a
   * new failure occurred. Wire to telemetry (`recordSinkFailure`) so dropped
   * records are visible. The callback MUST NOT throw — it is invoked from the
   * sink's emit path.
   */
  readonly onOverflow?: (record: AuditRecord) => void;
}

/**
 * Bounded in-memory replay queue. On `inner.emit` failure, enqueues the
 * failing record and rethrows. On the next successful emit, drains the queue
 * in FIFO order. When the queue is at `capacity` and another failure occurs,
 * the oldest queued record is evicted via `onOverflow` to make room.
 *
 * **Lossy under sustained outage** — when capacity is exceeded the oldest
 * record is dropped and `onOverflow` is invoked. For governance-grade
 * audit that must survive process restart and sustained outages, use
 * `persistentBufferedSink` (see ./persistent-buffered-sink.ts).
 */
export function bufferedSink(opts: BufferedSinkOptions): AuditSink {
  const queue: AuditRecord[] = [];
  return {
    async emit(record) {
      // Try to drain backlog first — even if `record` itself succeeds, we
      // want the buffer to clear in FIFO order.
      while (queue.length > 0) {
        const head = queue[0]!;
        try {
          await opts.inner.emit(head);
          queue.shift();
        } catch (drainErr) {
          enqueue(queue, record, opts);
          throw drainErr;
        }
      }
      try {
        await opts.inner.emit(record);
      } catch (err) {
        enqueue(queue, record, opts);
        throw err;
      }
    },
  };
}

function enqueue(
  queue: AuditRecord[],
  record: AuditRecord,
  opts: BufferedSinkOptions,
): void {
  if (queue.length >= opts.capacity) {
    const evicted = queue.shift();
    if (evicted !== undefined && opts.onOverflow) {
      try {
        opts.onOverflow(evicted);
      } catch {
        // onOverflow callback failures cannot prevent enqueue — swallow.
      }
    }
  }
  queue.push(record);
}
