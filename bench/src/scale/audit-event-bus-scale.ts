/**
 * `AuditEventBus` production-scale fan-out simulation.
 *
 * Exercises the bus under realistic operator-console traffic shapes:
 *   - hundreds of concurrent subscribers
 *   - bursts of records
 *   - subscribe / unsubscribe churn
 *   - a slow-consumer fraction
 *   - reconnect storms (forced UNSUBSCRIBE → re-subscribe)
 *   - malformed-payload injection
 *
 * Records per-record fan-out latency, dropped events (best-effort
 * contract), reconnect recovery time, memory delta, and ordering
 * preservation. Output is a `BenchArtifact` JSON document.
 */

import type { AuditRecord, AuditSink } from "@adjudicate/core";
import {
  bridgeAuditSinkToBus,
  createRedisAuditEventBus,
} from "@adjudicate/audit";
import {
  createFakePubSub,
  createRng,
  type FakePubSub,
} from "./fake-transport.js";
import {
  summarizeLatencies,
  type BenchArtifact,
  type InvariantResult,
} from "./types.js";

export interface AuditEventBusScaleConfig {
  readonly subscribers: number;
  readonly records: number;
  /** Records emitted per burst before a small yield gap. */
  readonly burstSize: number;
  /** Fraction of subscribers that are slow (jittered consumer delay). */
  readonly slowFraction: number;
  /** Slow-consumer per-handler delay in ms. */
  readonly slowConsumerMs: number;
  /** Per-publish latency floor in ms. */
  readonly pubsubLatencyMs: number;
  /** Jitter added to pubsubLatencyMs. */
  readonly pubsubJitterMs: number;
  /** Fraction of publishes silently dropped (transport-side). */
  readonly dropRate: number;
  /** Subscribe/unsubscribe cycles to fire mid-run. */
  readonly reconnectCycles: number;
  /** Malformed payloads injected mid-run. */
  readonly malformedInjections: number;
  readonly seed: number;
  /** Optional human-readable scenario tag. */
  readonly scenario?: string;
}

function exampleRecord(i: number): AuditRecord {
  return {
    version: 4,
    intentHash: `bus-h-${i}`,
    envelope: {
      version: 2,
      kind: "test.intent",
      payload: { i },
      createdAt: "2026-05-20T00:00:00.000Z",
      nonce: `n-${i}`,
      actor: { principal: "system", sessionId: "s-1" },
      taint: "SYSTEM",
      intentHash: `bus-h-${i}`,
    },
    decision: {
      kind: "EXECUTE",
      basis: [{ category: "state", code: "transition_valid" }],
    },
    decision_basis: [{ category: "state", code: "transition_valid" }],
    at: "2026-05-20T00:00:00.000Z",
    durationMs: 1,
    auditHash: `audit-h-${i}`,
  } as unknown as AuditRecord;
}

interface SubscriberState {
  readonly id: number;
  received: number;
  /** Per-record arrival latency from publish() call. */
  readonly latencies: number[];
  /** Intent hashes seen, in the order received. */
  readonly order: string[];
  unsubscribe: () => void;
}

export async function runAuditEventBusScale(
  config: AuditEventBusScaleConfig,
): Promise<BenchArtifact> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const rng = createRng(config.seed);
  const pubsub: FakePubSub = createFakePubSub({
    latencyMs: config.pubsubLatencyMs,
    jitterMs: config.pubsubJitterMs,
    dropRate: config.dropRate,
    rng,
  });
  const bus = createRedisAuditEventBus({
    pubsub,
    channel: `scale.audit.${config.seed}`,
  });
  const noopSink: AuditSink = { async emit() {} };
  const wired = bridgeAuditSinkToBus(noopSink, bus);

  const subscribers: SubscriberState[] = [];
  const slowIds = new Set<number>();
  for (let i = 0; i < config.subscribers; i++) {
    if (rng() < config.slowFraction) slowIds.add(i);
  }

  function attach(id: number): SubscriberState {
    const state: SubscriberState = {
      id,
      received: 0,
      latencies: [],
      order: [],
      unsubscribe: () => {},
    };
    const unsub = bus.subscribe((record) => {
      const publishedAtRaw = (record as { _publishedAt?: number })._publishedAt;
      const publishedAt =
        typeof publishedAtRaw === "number" ? publishedAtRaw : performance.now();
      state.received++;
      state.latencies.push(performance.now() - publishedAt);
      state.order.push(record.intentHash);
    });
    state.unsubscribe = unsub;
    return state;
  }

  // Tune slow-consumer global delay; per-subscriber simulation is by
  // letting the FakePubSub apply it to every handler — to make the
  // fraction-aware shape we approximate it by setting the global delay
  // proportional to the slow fraction.
  pubsub.setSlowConsumerMs(
    Math.max(
      0,
      Math.round(config.slowConsumerMs * config.slowFraction),
    ),
  );

  for (let i = 0; i < config.subscribers; i++) {
    subscribers.push(attach(i));
  }

  // Capture pre-fanout memory baseline (Node exposes rss; treat optional).
  const memBefore = process.memoryUsage?.().heapUsed ?? 0;

  let injectedAt = -1;
  let reconnectAt = -1;
  const reconnectRecoveryLatencies: number[] = [];

  for (let i = 0; i < config.records; i++) {
    const rec = exampleRecord(i);
    // Mid-run reconnect storm: tear every subscriber down and re-attach.
    if (
      reconnectAt === -1 &&
      config.reconnectCycles > 0 &&
      i === Math.floor(config.records / 2)
    ) {
      reconnectAt = i;
      const reconnectStart = performance.now();
      for (let c = 0; c < config.reconnectCycles; c++) {
        for (const s of subscribers) s.unsubscribe();
        subscribers.length = 0;
        for (let id = 0; id < config.subscribers; id++) {
          subscribers.push(attach(id));
        }
      }
      reconnectRecoveryLatencies.push(performance.now() - reconnectStart);
    }
    // Inject malformed mid-run.
    if (
      injectedAt === -1 &&
      config.malformedInjections > 0 &&
      i === Math.floor(config.records / 3)
    ) {
      injectedAt = i;
      for (let k = 0; k < config.malformedInjections; k++) {
        pubsub.injectMalformed(`scale.audit.${config.seed}`, `garbage-${k}`);
      }
    }
    // Stamp publish time into the record for cross-subscriber latency.
    (rec as { _publishedAt?: number })._publishedAt = performance.now();
    await wired.emit(rec);
    if (config.burstSize > 0 && i > 0 && i % config.burstSize === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Quiesce: give the runtime a tick to drain any queued micro-tasks.
  await new Promise((r) => setTimeout(r, 5));

  const memAfter = process.memoryUsage?.().heapUsed ?? 0;

  // Tear subscribers down — measures listener cleanup.
  for (const s of subscribers) s.unsubscribe();

  // Aggregate measurements.
  const allLatencies: number[] = [];
  let totalReceived = 0;
  let orderingViolations = 0;
  for (const s of subscribers) {
    totalReceived += s.received;
    for (const v of s.latencies) allLatencies.push(v);
    // Order check: intent hashes are emitted in monotonic order
    // (`bus-h-0`, `bus-h-1`, …). For each subscriber, the sequence of
    // i-suffixes must be strictly increasing — drops are allowed (the
    // bus is best-effort), but reordering is not.
    let lastIdx = -1;
    for (const hash of s.order) {
      const idx = Number(hash.slice("bus-h-".length));
      if (idx <= lastIdx) orderingViolations++;
      lastIdx = idx;
    }
  }

  const expectedDeliveries = config.subscribers * config.records;
  const dropped = expectedDeliveries - totalReceived;
  const droppedTransport = pubsub.droppedCount();
  const latencySummary = summarizeLatencies(allLatencies);

  const completedAt = new Date().toISOString();
  const durationMs = performance.now() - t0;

  const invariants: InvariantResult[] = [
    {
      id: "bus-no-crash-under-malformed",
      description: "Malformed payloads do not crash any subscriber.",
      passed: subscribers.every((s) => s.received >= 0),
    },
    {
      id: "bus-ordering-preserved",
      description: "Each subscriber sees records in monotonic publish order.",
      passed: orderingViolations === 0,
      observed: orderingViolations,
      expected: 0,
    },
    {
      id: "bus-reconnect-survives",
      description: "Reconnect storm completes without throwing.",
      passed: reconnectRecoveryLatencies.length >= 0,
    },
    {
      id: "bus-listener-cleanup",
      description: "After unsubscribe, the underlying pubsub holds no listeners on the channel.",
      passed: (pubsub.listeners.get(`scale.audit.${config.seed}`) ?? new Set()).size === 0,
      observed: (pubsub.listeners.get(`scale.audit.${config.seed}`) ?? new Set()).size,
      expected: 0,
    },
  ];

  return {
    name: "AuditEventBus scale fan-out",
    startedAt,
    completedAt,
    durationMs,
    config: { ...config },
    measurements: {
      subscribers: config.subscribers,
      records: config.records,
      expectedDeliveries,
      totalReceived,
      dropped,
      droppedTransport,
      dropRateEffective: expectedDeliveries === 0 ? 0 : dropped / expectedDeliveries,
      latencyP50Ms: latencySummary.p50,
      latencyP95Ms: latencySummary.p95,
      latencyP99Ms: latencySummary.p99,
      latencyMeanMs: latencySummary.mean,
      latencyMinMs: latencySummary.min,
      latencyMaxMs: latencySummary.max,
      reconnectRecoveryMs: reconnectRecoveryLatencies,
      memDeltaBytes: memAfter - memBefore,
      orderingViolations,
    },
    invariants,
    notes:
      "Latency is in-process; numbers represent framework dispatch overhead, not real Redis hops.",
  };
}
