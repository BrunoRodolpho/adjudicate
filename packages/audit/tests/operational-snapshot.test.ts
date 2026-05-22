/**
 * Operational survivability snapshots — deterministic, portable, and
 * tamper-evident.
 *
 * Asserts:
 *   - same input -> byte-identical output (determinism)
 *   - digest re-derives correctly on `verify*`
 *   - mutating any field after build -> digest mismatch
 *   - JSON.parse(JSON.stringify(snapshot)) is round-trip clean
 */

import { describe, expect, it } from "vitest";
import {
  type AuditRecord,
  buildAuditRecord,
  buildEnvelope,
} from "@adjudicate/core";
import {
  buildOperationalSnapshot,
  buildIncidentBundle,
  buildOperatorHandoff,
  verifyOperationalSnapshot,
  verifyIncidentBundle,
  verifyOperatorHandoff,
  OPERATIONAL_SNAPSHOT_SCHEMA_VERSION,
  type DeploymentIdentity,
  type SinkHealthSummary,
  type LedgerStatsSummary,
  type KillSwitchSnapshot,
  type ReplaySnapshot,
  type DeploymentConfigSummary,
  type OperationalSnapshot,
} from "../src/index.js";
import { replayWithIntegrity } from "../src/replay-integrity.js";
import { classifyReplayDrift } from "../src/replay-drift.js";
import { buildSupersessionChains } from "../src/supersession-chain.js";
import { analyzeKillSwitchTimeline } from "../src/kill-switch-timeline.js";

function makeDeployment(): DeploymentIdentity {
  return {
    id: "prod-us-east-1",
    kernelVersion: "1.0.0",
    environment: "prod",
    mode: "multi_replica",
    replicaCount: 8,
  };
}

function makeSink(): SinkHealthSummary {
  return {
    status: "healthy",
    emitted: 12500,
    failed: 0,
    spillDepth: 0,
    note: "audit-postgres",
  };
}

function makeLedger(): LedgerStatsSummary {
  return {
    fresh: 12000,
    hit: 500,
    errors: 0,
    hitRate: 500 / 12500,
  };
}

function makeKillSwitch(): KillSwitchSnapshot {
  return {
    state: "normal",
    lastTransitionAt: "2026-05-15T12:00:00.000Z",
    timeline: analyzeKillSwitchTimeline([
      { at: "2026-05-15T12:00:00.000Z", kind: "snapshot", state: "normal" },
    ]),
  };
}

function makeReplay(): ReplaySnapshot {
  const env = buildEnvelope({
    kind: "test.intent",
    payload: { x: 1 },
    actor: { principal: "user", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-05-20T00:00:00.000Z",
  });
  const decision = {
    kind: "EXECUTE" as const,
    basis: [{ category: "state" as const, code: "transition_valid" as const }],
  };
  const record = buildAuditRecord({
    envelope: env,
    decision,
    durationMs: 1,
    at: "2026-05-20T00:00:01.000Z",
  });
  const integrity = replayWithIntegrity([record], () => decision);
  const cleanReport = {
    total: 100,
    matched: 100,
    mismatches: [],
  } as const;
  const drift = classifyReplayDrift([
    { label: "2026-05-19", report: cleanReport },
    { label: "2026-05-20", report: cleanReport },
    { label: "2026-05-21", report: cleanReport },
  ]);
  const supersession = buildSupersessionChains([record]);
  return { drift, integrity, supersession };
}

function makeConfig(): DeploymentConfigSummary {
  return {
    verifyParkedHashMode: "warn",
    killSwitchPollMs: 1000,
    packTrustMode: "require_fingerprint",
    replayDriftJobDeployed: true,
    auditEventBusDeployed: true,
    durableSinkKind: "postgres",
  };
}

describe("buildOperationalSnapshot", () => {
  it("is deterministic — same input produces byte-identical output", () => {
    const input = {
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    };
    const a = buildOperationalSnapshot(input);
    const b = buildOperationalSnapshot(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.digest).toBe(b.digest);
  });

  it("verifies the digest of an intact snapshot", () => {
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    expect(verifyOperationalSnapshot(snapshot)).toBe(true);
    expect(snapshot.schemaVersion).toBe(OPERATIONAL_SNAPSHOT_SCHEMA_VERSION);
  });

  it("rejects a snapshot whose body was mutated after build", () => {
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const tampered: OperationalSnapshot = {
      ...snapshot,
      ledger: { ...snapshot.ledger, hit: 9999 },
    };
    expect(verifyOperationalSnapshot(tampered)).toBe(false);
  });

  it("round-trips through JSON.stringify / JSON.parse", () => {
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const rehydrated = JSON.parse(JSON.stringify(snapshot)) as OperationalSnapshot;
    expect(verifyOperationalSnapshot(rehydrated)).toBe(true);
  });
});

describe("buildIncidentBundle", () => {
  function makeRecord(): AuditRecord {
    const env = buildEnvelope({
      kind: "test.intent",
      payload: { x: 2 },
      actor: { principal: "user", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-2",
      createdAt: "2026-05-21T01:00:00.000Z",
    });
    const decision = {
      kind: "EXECUTE" as const,
      basis: [{ category: "state" as const, code: "transition_valid" as const }],
    };
    return buildAuditRecord({
      envelope: env,
      decision,
      durationMs: 1,
      at: "2026-05-21T01:00:01.000Z",
    });
  }

  it("captures the incident window and integrity report", () => {
    const records = [makeRecord()];
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T01:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const integrity = replayWithIntegrity(records, (r) => r.decision);
    const bundle = buildIncidentBundle({
      incidentId: "INC-2026-05-21-001",
      startedAt: "2026-05-21T01:00:00.000Z",
      endedAt: "2026-05-21T02:00:00.000Z",
      headline: "elevated REFUSE rate on pix.charge",
      snapshotAtStart: snapshot,
      records,
      integrity,
    });
    expect(bundle.records).toHaveLength(1);
    expect(verifyIncidentBundle(bundle)).toBe(true);
  });

  it("supports an `ongoing` incident", () => {
    const records = [makeRecord()];
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T01:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const integrity = replayWithIntegrity(records, (r) => r.decision);
    const bundle = buildIncidentBundle({
      incidentId: "INC-2026-05-21-002",
      startedAt: "2026-05-21T01:00:00.000Z",
      endedAt: "ongoing",
      headline: "ongoing investigation",
      snapshotAtStart: snapshot,
      records,
      integrity,
    });
    expect(bundle.endedAt).toBe("ongoing");
    expect(verifyIncidentBundle(bundle)).toBe(true);
  });
});

describe("buildOperatorHandoff", () => {
  it("encodes outgoing/incoming + snapshot + config + open issues", () => {
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const handoff = buildOperatorHandoff({
      at: "2026-05-21T08:00:00.000Z",
      outgoing: "team-alpha",
      incoming: "team-beta",
      snapshot,
      config: makeConfig(),
      openIssues: ["replay-drift job lagging by 4h"],
      references: [
        { label: "runbook", value: "docs/ops/runbooks/01-stage-read-mutations.md" },
        { label: "oncall", value: "ops-pager-link" },
      ],
    });
    expect(handoff.openIssues).toHaveLength(1);
    expect(handoff.references).toHaveLength(2);
    expect(verifyOperatorHandoff(handoff)).toBe(true);
  });

  it("rejects mutation of references after construction", () => {
    const snapshot = buildOperationalSnapshot({
      at: "2026-05-21T00:00:00.000Z",
      deployment: makeDeployment(),
      sink: makeSink(),
      ledger: makeLedger(),
      killSwitch: makeKillSwitch(),
      replay: makeReplay(),
    });
    const handoff = buildOperatorHandoff({
      at: "2026-05-21T08:00:00.000Z",
      outgoing: "team-alpha",
      incoming: "team-beta",
      snapshot,
      config: makeConfig(),
      openIssues: [],
      references: [],
    });
    const tampered = {
      ...handoff,
      openIssues: ["fabricated issue"],
    };
    expect(verifyOperatorHandoff(tampered)).toBe(false);
  });
});
