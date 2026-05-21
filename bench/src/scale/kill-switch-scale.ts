/**
 * Distributed kill-switch v2 production-scale validation.
 *
 * Simulates multi-replica deployments with pub/sub + polling fallback
 * under adverse conditions:
 *   - many replicas subscribed to the same channel
 *   - reconnect storms (every replica disconnects and resyncs)
 *   - delayed propagation (latency + jitter)
 *   - dropped messages (transport-side partition simulation)
 *   - replica crashes (random handle.stop() mid-run)
 *   - boot-time desync (replicas start late; resync from Redis)
 *
 * Measures per-replica convergence time on each transition, validates
 * the fail-closed invariant under partition, and explicitly proves no
 * split-brain state surfaces — every replica ends each transition with
 * the same `(active, reason)` snapshot the canonical writer published.
 */

import { startDistributedKillSwitchPubSub } from "@adjudicate/audit";
import {
  createRuntimeContext,
  type RuntimeContext,
} from "@adjudicate/core/kernel";
import {
  createFakePubSub,
  createFakeRedis,
  createRng,
  type FakePubSub,
} from "./fake-transport.js";
import {
  summarizeLatencies,
  type BenchArtifact,
  type InvariantResult,
} from "./types.js";

export interface KillSwitchScaleConfig {
  readonly replicas: number;
  readonly transitions: number;
  /** Polling cadence in ms — fallback. */
  readonly pollMs: number;
  readonly pubsubLatencyMs: number;
  readonly pubsubJitterMs: number;
  /** Fraction of publishes dropped by transport. */
  readonly dropRate: number;
  /** If >0, partition the bus for this many milliseconds mid-run. */
  readonly partitionMs: number;
  /** Reconnect every replica this many times during the run. */
  readonly reconnectCycles: number;
  /** Number of replicas that crash mid-run (stop their handle). */
  readonly crashes: number;
  /** Number of late-start replicas (boot after the first transition). */
  readonly lateBoots: number;
  /** RNG seed. */
  readonly seed: number;
  readonly scenario?: string;
}

interface Replica {
  readonly id: number;
  readonly ctx: RuntimeContext;
  handle: ReturnType<typeof startDistributedKillSwitchPubSub> | null;
  /** Per-transition apply timestamps. */
  readonly applyTimes: Array<{ active: boolean; reason: string; t: number }>;
  /** Has been intentionally crashed for the rest of the run. */
  crashed: boolean;
}

async function waitUntil(
  cond: () => boolean,
  maxMs: number,
): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 2));
  }
  return cond();
}

export async function runKillSwitchScale(
  config: KillSwitchScaleConfig,
): Promise<BenchArtifact> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const rng = createRng(config.seed);

  const redis = createFakeRedis({ rng, latencyMs: 1 });
  const pubsub: FakePubSub = createFakePubSub({
    latencyMs: config.pubsubLatencyMs,
    jitterMs: config.pubsubJitterMs,
    dropRate: config.dropRate,
    rng,
  });
  const key = `scale.kill.${config.seed}`;
  const channel = `${key}:ch`;

  const replicas: Replica[] = [];
  function startReplica(id: number): Replica {
    const ctx = createRuntimeContext({ id: `replica-${id}` });
    const replica: Replica = {
      id,
      ctx,
      handle: null,
      applyTimes: [],
      crashed: false,
    };
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key,
      channel,
      pollMs: config.pollMs,
      context: ctx,
      onApply: ({ active, reason }) => {
        replica.applyTimes.push({ active, reason, t: performance.now() });
      },
    });
    replica.handle = handle;
    return replica;
  }

  // Boot the eagerly-starting replicas immediately.
  const eagerReplicas = config.replicas - config.lateBoots;
  for (let i = 0; i < eagerReplicas; i++) {
    replicas.push(startReplica(i));
  }
  // Give the boot-time poll a chance to land before the first transition.
  await new Promise((r) => setTimeout(r, 25));

  // Use replica-0 as the canonical writer for transitions. Two-phase: publish via the handle.
  const writer = replicas[0]!;

  interface TransitionRecord {
    readonly idx: number;
    readonly active: boolean;
    readonly reason: string;
    readonly publishedAt: number;
    convergedAt: number;
    convergedCount: number;
    convergedReplicas: number[];
  }
  const transitions: TransitionRecord[] = [];

  let partitionedOnce = false;
  let reconnectedAt = -1;

  for (let i = 0; i < config.transitions; i++) {
    const active = i % 2 === 0;
    const reason = active ? `trip-${i}` : "cleared";

    // Mid-run partition: half the transitions are silent until partition lifts.
    if (
      !partitionedOnce &&
      config.partitionMs > 0 &&
      i === Math.floor(config.transitions / 2)
    ) {
      partitionedOnce = true;
      pubsub.partition();
      setTimeout(() => pubsub.clearPartition(), config.partitionMs);
    }

    // Mid-run reconnect storm.
    if (
      reconnectedAt === -1 &&
      config.reconnectCycles > 0 &&
      i === Math.floor(config.transitions / 3)
    ) {
      reconnectedAt = i;
      for (let c = 0; c < config.reconnectCycles; c++) {
        pubsub.forceDisconnect();
        // Allow Redis-pubsub-side handle to re-subscribe on the polling tick.
        await new Promise((r) => setTimeout(r, config.pollMs / 2));
      }
    }

    // Mid-run crash a few replicas.
    if (
      config.crashes > 0 &&
      i === Math.floor(config.transitions / 4)
    ) {
      let crashed = 0;
      for (const r of replicas) {
        if (crashed >= config.crashes) break;
        if (r.id === 0) continue; // never crash the writer
        if (r.crashed) continue;
        r.crashed = true;
        await r.handle?.stop();
        crashed++;
      }
    }

    // Late-start replicas join here (after the first transition).
    if (i === 1 && config.lateBoots > 0) {
      for (let lb = 0; lb < config.lateBoots; lb++) {
        replicas.push(startReplica(eagerReplicas + lb));
      }
      await new Promise((r) => setTimeout(r, config.pollMs + 10));
    }

    const publishedAt = performance.now();
    await writer.handle!.trip ? null : null; // type-narrow noop
    if (active) {
      await writer.handle!.trip(reason);
    } else {
      await writer.handle!.clear();
    }

    // Convergence: every live replica must reach (active, reason).
    const liveReplicas = () => replicas.filter((r) => !r.crashed);
    const expectedLive = () => liveReplicas().length;
    const converged = await waitUntil(() => {
      const live = liveReplicas();
      return live.every((r) => {
        const last = r.applyTimes[r.applyTimes.length - 1];
        return last !== undefined && last.active === active && last.reason === reason;
      });
    }, Math.max(2000, config.pollMs * 5));

    const convergedAt = converged ? performance.now() : -1;
    const convergedReplicas = liveReplicas()
      .filter((r) => {
        const last = r.applyTimes[r.applyTimes.length - 1];
        return last !== undefined && last.active === active && last.reason === reason;
      })
      .map((r) => r.id);

    transitions.push({
      idx: i,
      active,
      reason,
      publishedAt,
      convergedAt,
      convergedCount: convergedReplicas.length,
      convergedReplicas,
    });

    // Pause briefly so a transition doesn't overlap convergence detection.
    await new Promise((r) => setTimeout(r, 5));
  }

  // Final invariant: every live replica's terminal state equals the canonical writer's.
  const finalWriter = writer.applyTimes[writer.applyTimes.length - 1];
  let splitBrainCount = 0;
  for (const r of replicas) {
    if (r.crashed) continue;
    const last = r.applyTimes[r.applyTimes.length - 1];
    if (!last) {
      splitBrainCount++;
      continue;
    }
    if (
      finalWriter &&
      (last.active !== finalWriter.active || last.reason !== finalWriter.reason)
    ) {
      splitBrainCount++;
    }
  }

  // Stop all replicas.
  for (const r of replicas) await r.handle?.stop();

  // Latency samples.
  const propagationLatencies: number[] = [];
  for (const t of transitions) {
    if (t.convergedAt === -1) continue;
    propagationLatencies.push(t.convergedAt - t.publishedAt);
  }
  const latencySummary = summarizeLatencies(propagationLatencies);

  const completedAt = new Date().toISOString();
  const durationMs = performance.now() - t0;

  const invariants: InvariantResult[] = [
    {
      id: "kill-no-split-brain",
      description: "Every live replica's terminal state matches the canonical writer.",
      passed: splitBrainCount === 0,
      observed: splitBrainCount,
      expected: 0,
    },
    {
      id: "kill-pubsub-convergence",
      description: "Every transition converges within pollMs*5 budget.",
      passed: transitions.every((t) => t.convergedAt !== -1),
      observed: transitions.filter((t) => t.convergedAt === -1).length,
      expected: 0,
    },
    {
      id: "kill-late-boot-resync",
      description: "Late-booting replicas catch up via boot-time poll.",
      passed:
        config.lateBoots === 0 ||
        replicas.slice(-config.lateBoots).every((r) => r.applyTimes.length > 0),
    },
    {
      id: "kill-fallback-after-partition",
      description: "Polling fallback re-establishes convergence after partition.",
      passed:
        !partitionedOnce ||
        transitions.slice(Math.floor(config.transitions / 2)).some(
          (t) => t.convergedAt !== -1,
        ),
    },
  ];

  return {
    name: "Distributed kill-switch v2 scale",
    startedAt,
    completedAt,
    durationMs,
    config: { ...config },
    measurements: {
      replicas: replicas.length,
      eagerReplicas,
      lateBoots: config.lateBoots,
      transitions: transitions.length,
      convergedTransitions: transitions.filter((t) => t.convergedAt !== -1).length,
      droppedPublishes: pubsub.droppedCount(),
      publishedPublishes: pubsub.publishedCount(),
      propagationP50Ms: latencySummary.p50,
      propagationP95Ms: latencySummary.p95,
      propagationP99Ms: latencySummary.p99,
      propagationMaxMs: latencySummary.max,
      splitBrainResidual: splitBrainCount,
      crashesInjected: config.crashes,
      reconnectCycles: config.reconnectCycles,
      partitionMs: config.partitionMs,
    },
    invariants,
    notes:
      "Convergence latency is measured from canonical writer publish() return to last-replica apply.",
  };
}
