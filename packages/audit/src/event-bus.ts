/**
 * `AuditEventBus` — provider-neutral fan-out for real-time audit
 * observers.
 *
 * The kernel emits each `AuditRecord` through `AuditSink.emit(...)`. That
 * sink contract is durable-write-shaped: it returns on persistence
 * success and throws on failure. It is NOT a real-time fan-out: the
 * operator console can't `await sink.emit` to learn about new records.
 *
 * `AuditEventBus` is the orthogonal fan-out primitive. It is opt-in,
 * lossy-by-design, and explicitly NOT a substitute for the durable sink:
 *
 *   - The durable sink stays the source of truth. Replay reads from it.
 *   - The event bus is best-effort — subscribers that disconnect miss
 *     records. The bus is for *live observation*, not governance.
 *   - Subscribers receive records in the order they were emitted (within
 *     a single bus instance). Across replicas, ordering is preserved by
 *     the underlying transport (Redis pub/sub preserves order within a
 *     channel).
 *
 * # Wiring shape
 *
 * Adopters compose `bridgeAuditSinkToBus(sink, bus)` so each successful
 * emit also publishes on the bus:
 *
 *   const sink = multiSink(consoleSink, postgresSink);   // durable
 *   const bus  = createInMemoryAuditEventBus();          // real-time
 *   const wired = bridgeAuditSinkToBus(sink, bus);       // both
 *
 * The wrapped sink emits to the durable sink first, awaits success, then
 * publishes on the bus. A bus failure does NOT roll back the durable
 * write — operator observation is strictly secondary to governance.
 *
 * # Replay safety
 *
 * The bus does not change replay determinism. Subscribers observe the
 * stream; they do not feed into adjudication. The kernel never reads the
 * bus. Audit-record hash + ledger semantics are unchanged.
 */

import type { AuditRecord, AuditSink } from "@adjudicate/core";

export type AuditEventHandler = (record: AuditRecord) => void;

export interface AuditEventBus {
  /** Publish a record. Fan-out is fire-and-forget per the bus contract. */
  publish(record: AuditRecord): Promise<void>;
  /**
   * Subscribe a handler. Returns an unsubscribe callback. The handler
   * MUST NOT throw — implementations guard against it but adopters are
   * expected to keep handlers cheap (no I/O, no synchronous fetch).
   */
  subscribe(handler: AuditEventHandler): () => void;
  /**
   * Number of currently-registered subscribers. Useful for tests and
   * health endpoints.
   */
  subscriberCount(): number;
}

export interface InMemoryAuditEventBusOptions {
  /**
   * Maximum number of concurrent subscribers allowed. When a subscribe
   * call would exceed this limit, an error is thrown. Prevents unbounded
   * subscriber growth in environments where unsubscribe is not reliably
   * called (e.g., leaked handlers in tests or long-running servers).
   * Default: unlimited.
   */
  readonly maxSubscribers?: number;
  /**
   * Optional callback invoked when a handler throws during fan-out, or
   * when an unsubscribe callback fails. Default: no-op (the bus remains
   * best-effort by contract — this is an observability hook, not a way
   * to change dispatch semantics).
   */
  readonly onHandlerFailure?: (err: unknown, record: AuditRecord) => void;
}

interface BusEntry {
  readonly token: symbol;
  readonly handler: AuditEventHandler;
}

/**
 * In-memory `AuditEventBus`. Synchronous fan-out, bounded memory:
 * handlers are invoked in the order they were registered. Single-process
 * only — for multi-replica deployments, layer a Redis or NATS bus on top.
 *
 * Suitable for tests, the quickstart, and single-replica adopters.
 */
export function createInMemoryAuditEventBus(
  opts: InMemoryAuditEventBusOptions = {},
): AuditEventBus {
  // Map keyed by a unique symbol token for O(1) unsubscribe.
  const entries = new Map<symbol, BusEntry>();
  return {
    async publish(record: AuditRecord) {
      // Snapshot the map values — handlers added/removed mid-iteration must
      // not affect the current fan-out.
      const snapshot = Array.from(entries.values());
      for (const e of snapshot) {
        try {
          e.handler(record);
        } catch (err) {
          // Handler errors must not affect siblings. The bus is best-effort.
          // Route through onHandlerFailure if provided for observability.
          opts.onHandlerFailure?.(err, record);
        }
      }
    },
    subscribe(handler: AuditEventHandler) {
      if (
        opts.maxSubscribers !== undefined &&
        entries.size >= opts.maxSubscribers
      ) {
        throw new Error(
          `AuditEventBus: maxSubscribers limit (${opts.maxSubscribers}) reached — refusing new subscription`,
        );
      }
      const token = Symbol();
      const entry: BusEntry = { token, handler };
      entries.set(token, entry);
      // O(1) removal: delete by unique token, not by value-scan.
      return () => {
        entries.delete(token);
      };
    },
    subscriberCount() {
      return entries.size;
    },
  };
}

/**
 * Bus-publish failure callback. Default behaviour swallows errors (the
 * bus is best-effort by contract); adopters can pass a callback to route
 * failures into telemetry without changing the durable-write semantics.
 */
export type BridgeBusFailure = (event: {
  readonly intentHash: string;
  readonly error: Error;
}) => void;

export interface BridgeAuditSinkToBusOptions {
  readonly onBusFailure?: BridgeBusFailure;
}

/**
 * Compose a durable sink and an event bus into a single sink. The
 * returned sink awaits the durable emit first; on success, publishes to
 * the bus. A bus failure is reported via `onBusFailure` and otherwise
 * swallowed — the durable write has already committed, so re-throwing
 * would be deceptive (the durable governance record exists, only the
 * real-time observer missed it).
 *
 * Order matters: bus failures NEVER propagate up. Durable failures
 * propagate as usual (the underlying sink's contract is unchanged).
 */
export function bridgeAuditSinkToBus(
  sink: AuditSink,
  bus: AuditEventBus,
  options: BridgeAuditSinkToBusOptions = {},
): AuditSink {
  return {
    async emit(record: AuditRecord) {
      await sink.emit(record);
      try {
        await bus.publish(record);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onBusFailure?.({
          intentHash: record.intentHash,
          error,
        });
      }
    },
  };
}

/**
 * Optional shape for a Redis-pub/sub-backed event bus. The
 * implementation is left to adopters because real Redis clients require
 * a separate subscriber connection — see `RedisPubSubClient` in
 * `./kill-switch-pubsub.ts`.
 *
 * Reference implementation lives in `createRedisAuditEventBus` which
 * wraps the same `RedisPubSubClient` surface the kill-switch v2 uses.
 */
export interface RedisAuditEventBusOptions {
  readonly pubsub: import("./kill-switch-pubsub.js").RedisPubSubClient;
  /** Pub/sub channel to fan out on. Default: `audit.event.v1`. */
  readonly channel?: string;
  /**
   * JSON serializer for outbound records. Defaults to `JSON.stringify`.
   * Adopters with custom canonicalization can plug in their own
   * (the bus does NOT canonicalize on its own — that's the audit-record
   * hash's job).
   */
  readonly serialize?: (record: AuditRecord) => string;
  /** Optional logger for parse failures on inbound messages. */
  readonly logger?: {
    warn: (event: { reason: string }) => void;
  };
  /**
   * Optional callback invoked when a handler throws during fan-out, or
   * when the late-stage Redis unsubscribe call fails. Default: no-op
   * (the bus remains best-effort by contract — this is an observability
   * hook, not a way to change dispatch semantics).
   */
  readonly onHandlerFailure?: (err: unknown, record: AuditRecord) => void;
}

/**
 * Redis-pub/sub-backed `AuditEventBus`. Multi-replica fan-out:
 * publishing from one replica fans out to every subscriber on every
 * replica subscribed to the channel.
 *
 * Subscribe lifecycle is lazy: the underlying Redis SUBSCRIBE is issued
 * only when the first handler registers and torn down when the last
 * handler unsubscribes. Adopters who keep the bus instance alive across
 * many subscriptions pay the SUBSCRIBE cost once.
 */
export function createRedisAuditEventBus(
  opts: RedisAuditEventBusOptions,
): AuditEventBus {
  const channel = opts.channel ?? "audit.event.v1";
  const serialize = opts.serialize ?? JSON.stringify;
  // Map keyed by a unique symbol token for O(1) unsubscribe.
  const entries = new Map<symbol, BusEntry>();
  let unsubscribe: (() => Promise<void>) | null = null;
  let subscribingPromise: Promise<void> | null = null;

  async function ensureSubscribed(): Promise<void> {
    if (unsubscribe !== null) return;
    if (subscribingPromise !== null) {
      await subscribingPromise;
      return;
    }
    subscribingPromise = (async () => {
      const unsub = await opts.pubsub.subscribe(channel, (message) => {
        let parsed: AuditRecord;
        try {
          parsed = JSON.parse(message) as AuditRecord;
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          opts.logger?.warn({ reason: `parse: ${e.message}` });
          return;
        }
        const snapshot = Array.from(entries.values());
        for (const e of snapshot) {
          try {
            e.handler(parsed);
          } catch (handlerErr) {
            // Same best-effort handler contract as in-memory bus.
            // Route through onHandlerFailure if provided for observability.
            opts.onHandlerFailure?.(handlerErr, parsed);
          }
        }
      });
      unsubscribe = unsub;
    })();
    try {
      await subscribingPromise;
    } finally {
      subscribingPromise = null;
    }
  }

  return {
    async publish(record: AuditRecord) {
      await opts.pubsub.publish(channel, serialize(record));
    },
    subscribe(handler: AuditEventHandler) {
      const token = Symbol();
      const entry: BusEntry = { token, handler };
      entries.set(token, entry);
      // Fire-and-forget the subscription dance; if it fails the handler
      // simply never sees messages. Adopters wanting a hard guarantee
      // should await `ensureSubscribed` externally.
      void ensureSubscribed();
      // O(1) removal: delete by unique token, not by value-scan.
      return () => {
        entries.delete(token);
        if (entries.size === 0 && unsubscribe !== null) {
          const u = unsubscribe;
          unsubscribe = null;
          void u().catch((err: unknown) => {
            // Late-stage unsubscribe failure: route through onHandlerFailure
            // so the error is visible via the caller's observability hook
            // rather than being silently dropped.
            opts.onHandlerFailure?.(err, {} as AuditRecord);
            opts.logger?.warn({
              reason: `redis-audit-bus: unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          });
        }
      };
    },
    subscriberCount() {
      return entries.size;
    },
  };
}
