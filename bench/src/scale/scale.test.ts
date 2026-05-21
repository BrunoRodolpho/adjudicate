/**
 * CI smoke test for the v1.0-RC production simulation harnesses.
 *
 * Runs the "light" variant of each scenario so the harnesses execute
 * on every push and any framework regression that breaks the
 * fan-out, propagation, or invariant story trips the build.
 *
 * The "heavy" variants live behind CLI scripts in `bench/package.json`
 * and feed `docs/perf/scale-baselines.json` for the release-candidate
 * evidence record.
 */

import { describe, expect, it } from "vitest";
import { runAuditEventBusScale } from "./audit-event-bus-scale.js";
import { runKillSwitchScale } from "./kill-switch-scale.js";

describe("AuditEventBus scale (CI light)", () => {
  it("delivers every record to every subscriber with no ordering violation", async () => {
    const artifact = await runAuditEventBusScale({
      subscribers: 16,
      records: 64,
      burstSize: 16,
      slowFraction: 0,
      slowConsumerMs: 0,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 0,
      dropRate: 0,
      reconnectCycles: 0,
      malformedInjections: 0,
      seed: 1,
      scenario: "audit-bus-ci",
    });

    const failed = artifact.invariants.filter((i) => !i.passed);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(artifact.measurements.dropped).toBe(0);
    expect(artifact.measurements.orderingViolations).toBe(0);
    expect(artifact.measurements.totalReceived).toBe(
      artifact.measurements.expectedDeliveries,
    );
  }, 30_000);

  it("survives malformed injections + reconnect storm without ordering loss", async () => {
    const artifact = await runAuditEventBusScale({
      subscribers: 16,
      records: 64,
      burstSize: 16,
      slowFraction: 0.25,
      slowConsumerMs: 0,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 1,
      dropRate: 0,
      reconnectCycles: 1,
      malformedInjections: 8,
      seed: 2,
      scenario: "audit-bus-ci-chaos",
    });

    const failed = artifact.invariants.filter((i) => !i.passed);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    // Reconnect storm naturally drops in-flight records — we only assert
    // ordering, not loss-free delivery.
    expect(artifact.measurements.orderingViolations).toBe(0);
  }, 30_000);
});

describe("Distributed kill-switch v2 scale (CI light)", () => {
  it("converges every replica on every transition", async () => {
    const artifact = await runKillSwitchScale({
      replicas: 6,
      transitions: 8,
      pollMs: 50,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 1,
      dropRate: 0,
      partitionMs: 0,
      reconnectCycles: 0,
      crashes: 0,
      lateBoots: 0,
      seed: 7,
      scenario: "kill-ci",
    });
    const failed = artifact.invariants.filter((i) => !i.passed);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(artifact.measurements.splitBrainResidual).toBe(0);
    expect(artifact.measurements.convergedTransitions).toBe(
      artifact.measurements.transitions,
    );
  }, 30_000);

  it("recovers from partition + reconnect without split-brain", async () => {
    const artifact = await runKillSwitchScale({
      replicas: 8,
      transitions: 12,
      pollMs: 50,
      pubsubLatencyMs: 0,
      pubsubJitterMs: 2,
      dropRate: 0,
      partitionMs: 40,
      reconnectCycles: 1,
      crashes: 1,
      lateBoots: 1,
      seed: 11,
      scenario: "kill-ci-chaos",
    });
    const splitBrain = artifact.invariants.find(
      (i) => i.id === "kill-no-split-brain",
    );
    expect(splitBrain?.passed, JSON.stringify(splitBrain)).toBe(true);
    expect(artifact.measurements.splitBrainResidual).toBe(0);
  }, 30_000);
});
