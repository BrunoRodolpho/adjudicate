/**
 * Ecosystem telemetry — local-first, opt-in, deterministic.
 *
 * Post-v1 the framework must evolve from evidence. This module gives
 * adopters a structured way to *locally* aggregate that evidence into
 * snapshots they can later choose to share. It is the substrate behind
 * "adoption telemetry hooks" without any of the substrate behind
 * "phone-home telemetry."
 *
 * Design invariants (enforced by the public surface, not by trust):
 *
 *   1. Opt-in only. The kernel never instantiates these aggregators;
 *      adopters must construct them explicitly.
 *   2. Local-first. The module contains zero network code, zero file
 *      I/O. A snapshot is a value the adopter chooses what to do with.
 *   3. Privacy-preserving. The aggregators record taxonomy entries
 *      (codes, kinds, categories) — never adopter payloads, never
 *      intent payloads, never personally identifiable strings.
 *   4. Deterministic. Same input sequence → identical snapshot. No
 *      clock, no RNG, no environmental capture inside the aggregator.
 *      Wall-clock attribution is the caller's responsibility.
 *   5. Bounded cardinality. Each category caps its key-space so a
 *      runaway Pack cannot inflate the snapshot.
 *
 * What the aggregators DON'T do:
 *
 *   - They do not export to any wire protocol.
 *   - They do not subscribe to kernel sinks automatically.
 *   - They do not coalesce across processes or hosts.
 *   - They never observe the envelope payload, the LLM history, or
 *     any string that originated from an LLM.
 *
 * If an adopter wires the snapshot to a metrics backend, that is their
 * production decision — and the snapshot shape is explicitly designed
 * to remain stable across minor versions so dashboards survive bumps.
 */

import type {
  AuditRecord,
  Decision,
  ReplayMismatch,
  Refusal,
} from "@adjudicate/core";

/**
 * Closed taxonomy of operational incident classes the runtime can
 * encounter. Mirrors the operator runbook categories so an incident
 * channel can route on a single key.
 *
 * Additions are MINOR. Removals are MAJOR (would invalidate downstream
 * alert rules).
 */
export type OperationalIncidentClass =
  | "kill_switch_storm"
  | "kill_switch_split_brain"
  | "audit_sink_outage"
  | "audit_event_bus_failure"
  | "replay_drift_mass"
  | "replay_drift_single"
  | "integrity_failure"
  | "deferred_resume_stuck"
  | "confirmation_token_loss"
  | "pack_signature_invalid"
  | "pack_signature_missing"
  | "rate_limit_threshold_breach"
  | "guard_panic_storm"
  | "shadow_divergence_spike";

/**
 * Closed taxonomy of replay-failure root causes. Distinct from
 * `ReplayMismatchKind` — that is the *shape* of the divergence; this
 * is the inferred *cause*. The classifier is purposefully conservative:
 * unknown shapes fall into `unclassified` rather than being guessed.
 *
 * Additions are MINOR.
 */
export type ReplayFailureClass =
  | "decision_kind_changed"
  | "basis_added"
  | "basis_removed"
  | "basis_swapped"
  | "refusal_code_changed"
  | "unclassified";

/**
 * Closed taxonomy of analyzer-diagnostic outcomes when adopters tag
 * them. The kernel never tags — only the adopter, after triage. Used to
 * separate true positives from noise without leaking the diagnostic
 * detail (which can carry source identifiers).
 *
 * Additions are MINOR.
 */
export type AnalyzerTriageOutcome =
  | "true_positive"
  | "false_positive"
  | "by_design"
  | "wont_fix"
  | "deferred";

/**
 * One slot of a Pack-ecosystem snapshot. Tracks how many *unique*
 * Pack ids the local process has observed, bucketed by the Pack's
 * `contract` field. Never records the Pack id itself — the bucket
 * counter alone is the carry-out value.
 */
export interface PackEcosystemSnapshot {
  /** Number of distinct Pack ids observed, by contract version. */
  readonly packsByContract: Readonly<Record<string, number>>;
  /** Distribution of declared quality tiers across observed manifests. */
  readonly qualityTiers: Readonly<Record<string, number>>;
  /** Distribution of signature algorithms seen on verified packs. */
  readonly signatureAlgorithms: Readonly<Record<string, number>>;
  /** Pack trust verifications classified by outcome. */
  readonly trustOutcomes: Readonly<Record<string, number>>;
}

/**
 * One slot of a decision distribution snapshot. Maps `Decision.kind` to
 * a count. Refusal codes (when present) are nested under a closed
 * vocabulary bucket; basis codes are reported as a `category` bucket
 * only (never the per-code key) to keep cardinality bounded.
 */
export interface DecisionDistributionSnapshot {
  readonly byKind: Readonly<Record<string, number>>;
  readonly refusalByCode: Readonly<Record<string, number>>;
  readonly basisByCategory: Readonly<Record<string, number>>;
}

export interface ReplayFailureSnapshot {
  readonly byClass: Readonly<Record<ReplayFailureClass, number>>;
  readonly total: number;
}

export interface AnalyzerTriageSnapshot {
  readonly byDiagnosticCode: Readonly<Record<string, Readonly<Record<AnalyzerTriageOutcome, number>>>>;
  readonly totals: Readonly<Record<AnalyzerTriageOutcome, number>>;
}

export interface SemconvAdoptionSnapshot {
  /** Number of times each `adjudicate.*` attribute was emitted locally. */
  readonly emissionsByAttribute: Readonly<Record<string, number>>;
  /**
   * Number of attributes that were emitted but are *not* in the local
   * `SEMCONV` constant — a signal that an adopter or extension is
   * minting their own keys. Bucket only; never the attribute string.
   */
  readonly unknownAttributeCount: number;
}

export interface MigrationPainSnapshot {
  /** Codemod name → number of files visited. */
  readonly codemodVisits: Readonly<Record<string, number>>;
  /** Codemod name → number of files modified. */
  readonly codemodModifications: Readonly<Record<string, number>>;
  /** Codemod name → number of files where the rule did not apply (no-op). */
  readonly codemodNoops: Readonly<Record<string, number>>;
}

export interface IncidentSnapshot {
  readonly byClass: Readonly<Record<OperationalIncidentClass, number>>;
  readonly total: number;
}

/**
 * The top-level snapshot. JSON-serializable. Stable shape across
 * minor versions. Adopters who ship snapshots to a backend should
 * version-pin to the `schemaVersion`.
 */
export interface EcosystemTelemetrySnapshot {
  readonly schemaVersion: 1;
  readonly pack: PackEcosystemSnapshot;
  readonly decisions: DecisionDistributionSnapshot;
  readonly replayFailures: ReplayFailureSnapshot;
  readonly analyzerTriage: AnalyzerTriageSnapshot;
  readonly semconvAdoption: SemconvAdoptionSnapshot;
  readonly migrationPain: MigrationPainSnapshot;
  readonly incidents: IncidentSnapshot;
}

/**
 * Per-aggregator cardinality caps. When exceeded, additional keys are
 * absorbed into a designated `__overflow__` bucket so the snapshot
 * shape stays bounded. The defaults are intentionally generous for
 * single-process aggregation; adopters running shared aggregators
 * should tighten them.
 */
export interface EcosystemTelemetryOptions {
  readonly maxPackKeys?: number;
  readonly maxBasisCategories?: number;
  readonly maxRefusalCodes?: number;
  readonly maxAttributeKeys?: number;
  readonly maxDiagnosticCodes?: number;
  readonly maxCodemodKeys?: number;
}

const DEFAULTS: Required<EcosystemTelemetryOptions> = {
  maxPackKeys: 256,
  maxBasisCategories: 64,
  maxRefusalCodes: 128,
  maxAttributeKeys: 256,
  maxDiagnosticCodes: 128,
  maxCodemodKeys: 64,
};

const OVERFLOW = "__overflow__" as const;

/**
 * Bounded-key counter. Increment never throws; over-cap keys land in
 * the overflow bucket so the snapshot's cardinality is provably
 * bounded regardless of input.
 */
class BoundedCounter {
  private readonly map = new Map<string, number>();
  constructor(private readonly cap: number) {}

  add(key: string, delta = 1): void {
    if (this.map.has(key)) {
      this.map.set(key, (this.map.get(key) ?? 0) + delta);
      return;
    }
    if (this.map.size >= this.cap) {
      this.map.set(OVERFLOW, (this.map.get(OVERFLOW) ?? 0) + delta);
      return;
    }
    this.map.set(key, delta);
  }

  snapshot(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    const keys = [...this.map.keys()].sort();
    for (const key of keys) {
      out[key] = this.map.get(key) ?? 0;
    }
    return out;
  }
}

class PackUniqueSet {
  private readonly seen = new Set<string>();
  private readonly byContract = new BoundedCounter(32);
  constructor(private readonly cap: number) {}

  observe(packId: string, contract: string): void {
    if (this.seen.has(packId)) return;
    if (this.seen.size >= this.cap) return;
    this.seen.add(packId);
    this.byContract.add(contract);
  }

  snapshot(): Readonly<Record<string, number>> {
    return this.byContract.snapshot();
  }
}

/**
 * The aggregator. Adopters call observation methods; the aggregator
 * accumulates bounded counters. `snapshot()` returns a JSON-stable
 * value. `reset()` is provided for tests and for periodic flush-and-
 * reset rotations (e.g., snapshot-per-hour).
 *
 * Every observation method is synchronous and total: no I/O, no
 * throws, no allocations beyond the counter.
 */
export interface EcosystemTelemetry {
  observePackInstallation(packId: string, contract: string): void;
  observePackManifest(qualityTier: string | null): void;
  observePackTrust(outcome: "ok" | "missing" | "invalid" | "unverified"): void;
  observePackSignature(algorithm: string): void;
  observeDecision(decision: Decision): void;
  observeRefusal(refusal: Refusal): void;
  observeAuditRecord(record: AuditRecord): void;
  observeReplayMismatch(mismatch: ReplayMismatch): void;
  observeAnalyzerTriage(diagnosticCode: string, outcome: AnalyzerTriageOutcome): void;
  observeSemconvEmission(attribute: string, knownAttributes: ReadonlySet<string>): void;
  observeCodemod(name: string, outcome: "visited" | "modified" | "noop"): void;
  observeIncident(klass: OperationalIncidentClass): void;
  snapshot(): EcosystemTelemetrySnapshot;
  reset(): void;
}

const INCIDENT_CLASSES: readonly OperationalIncidentClass[] = [
  "kill_switch_storm",
  "kill_switch_split_brain",
  "audit_sink_outage",
  "audit_event_bus_failure",
  "replay_drift_mass",
  "replay_drift_single",
  "integrity_failure",
  "deferred_resume_stuck",
  "confirmation_token_loss",
  "pack_signature_invalid",
  "pack_signature_missing",
  "rate_limit_threshold_breach",
  "guard_panic_storm",
  "shadow_divergence_spike",
];

const TRIAGE_OUTCOMES: readonly AnalyzerTriageOutcome[] = [
  "true_positive",
  "false_positive",
  "by_design",
  "wont_fix",
  "deferred",
];

function emptyIncidentMap(): Record<OperationalIncidentClass, number> {
  const out = {} as Record<OperationalIncidentClass, number>;
  for (const klass of INCIDENT_CLASSES) out[klass] = 0;
  return out;
}

function emptyTriageMap(): Record<AnalyzerTriageOutcome, number> {
  const out = {} as Record<AnalyzerTriageOutcome, number>;
  for (const outcome of TRIAGE_OUTCOMES) out[outcome] = 0;
  return out;
}

export function createEcosystemTelemetry(
  options: EcosystemTelemetryOptions = {},
): EcosystemTelemetry {
  const opts = { ...DEFAULTS, ...options };

  let pack = makeState();

  function makeState() {
    return {
      packs: new PackUniqueSet(opts.maxPackKeys),
      qualityTiers: new BoundedCounter(16),
      signatureAlgorithms: new BoundedCounter(8),
      trustOutcomes: new BoundedCounter(8),
      decisionKinds: new BoundedCounter(8),
      refusalCodes: new BoundedCounter(opts.maxRefusalCodes),
      basisCategories: new BoundedCounter(opts.maxBasisCategories),
      replayByClass: emptyReplayMap(),
      replayTotal: 0,
      analyzerByCode: new Map<string, Record<AnalyzerTriageOutcome, number>>(),
      analyzerTotals: emptyTriageMap(),
      semconvEmissions: new BoundedCounter(opts.maxAttributeKeys),
      semconvUnknown: 0,
      codemodVisits: new BoundedCounter(opts.maxCodemodKeys),
      codemodModifications: new BoundedCounter(opts.maxCodemodKeys),
      codemodNoops: new BoundedCounter(opts.maxCodemodKeys),
      incidents: emptyIncidentMap(),
      incidentTotal: 0,
    };
  }

  function emptyReplayMap(): Record<ReplayFailureClass, number> {
    return {
      decision_kind_changed: 0,
      basis_added: 0,
      basis_removed: 0,
      basis_swapped: 0,
      refusal_code_changed: 0,
      unclassified: 0,
    };
  }

  return {
    observePackInstallation(packId, contract) {
      pack.packs.observe(packId, contract);
    },
    observePackManifest(qualityTier) {
      pack.qualityTiers.add(qualityTier ?? "unset");
    },
    observePackTrust(outcome) {
      pack.trustOutcomes.add(outcome);
    },
    observePackSignature(algorithm) {
      pack.signatureAlgorithms.add(algorithm);
    },
    observeDecision(decision) {
      pack.decisionKinds.add(decision.kind);
      for (const b of decision.basis) {
        pack.basisCategories.add(b.category);
      }
      if (decision.kind === "REFUSE") {
        pack.refusalCodes.add(decision.refusal.code);
      }
    },
    observeRefusal(refusal) {
      pack.refusalCodes.add(refusal.code);
    },
    observeAuditRecord(record) {
      pack.decisionKinds.add(record.decision.kind);
      for (const b of record.decision.basis) {
        pack.basisCategories.add(b.category);
      }
      if (record.decision.kind === "REFUSE") {
        pack.refusalCodes.add(record.decision.refusal.code);
      }
    },
    observeReplayMismatch(mismatch) {
      pack.replayTotal++;
      pack.replayByClass[classifyReplayFailure(mismatch)]++;
    },
    observeAnalyzerTriage(diagnosticCode, outcome) {
      pack.analyzerTotals[outcome]++;
      let bucket = pack.analyzerByCode.get(diagnosticCode);
      if (!bucket) {
        if (pack.analyzerByCode.size >= opts.maxDiagnosticCodes) {
          bucket = pack.analyzerByCode.get(OVERFLOW);
          if (!bucket) {
            bucket = emptyTriageMap();
            pack.analyzerByCode.set(OVERFLOW, bucket);
          }
        } else {
          bucket = emptyTriageMap();
          pack.analyzerByCode.set(diagnosticCode, bucket);
        }
      }
      bucket[outcome]++;
    },
    observeSemconvEmission(attribute, knownAttributes) {
      pack.semconvEmissions.add(attribute);
      if (!knownAttributes.has(attribute)) {
        pack.semconvUnknown++;
      }
    },
    observeCodemod(name, outcome) {
      if (outcome === "visited") pack.codemodVisits.add(name);
      if (outcome === "modified") pack.codemodModifications.add(name);
      if (outcome === "noop") pack.codemodNoops.add(name);
    },
    observeIncident(klass) {
      pack.incidents[klass]++;
      pack.incidentTotal++;
    },
    snapshot(): EcosystemTelemetrySnapshot {
      const analyzerByDiagnosticCode: Record<string, Record<AnalyzerTriageOutcome, number>> = {};
      const codeKeys = [...pack.analyzerByCode.keys()].sort();
      for (const key of codeKeys) {
        const value = pack.analyzerByCode.get(key);
        if (value !== undefined) analyzerByDiagnosticCode[key] = { ...value };
      }
      return {
        schemaVersion: 1,
        pack: {
          packsByContract: pack.packs.snapshot(),
          qualityTiers: pack.qualityTiers.snapshot(),
          signatureAlgorithms: pack.signatureAlgorithms.snapshot(),
          trustOutcomes: pack.trustOutcomes.snapshot(),
        },
        decisions: {
          byKind: pack.decisionKinds.snapshot(),
          refusalByCode: pack.refusalCodes.snapshot(),
          basisByCategory: pack.basisCategories.snapshot(),
        },
        replayFailures: {
          byClass: { ...pack.replayByClass },
          total: pack.replayTotal,
        },
        analyzerTriage: {
          byDiagnosticCode: analyzerByDiagnosticCode,
          totals: { ...pack.analyzerTotals },
        },
        semconvAdoption: {
          emissionsByAttribute: pack.semconvEmissions.snapshot(),
          unknownAttributeCount: pack.semconvUnknown,
        },
        migrationPain: {
          codemodVisits: pack.codemodVisits.snapshot(),
          codemodModifications: pack.codemodModifications.snapshot(),
          codemodNoops: pack.codemodNoops.snapshot(),
        },
        incidents: {
          byClass: { ...pack.incidents },
          total: pack.incidentTotal,
        },
      };
    },
    reset() {
      pack = makeState();
    },
  };
}

/**
 * Classify a single replay mismatch into a closed taxonomy entry. Pure;
 * useful both inside the aggregator and standalone for adopters who
 * want to bucket their own replay report into operational categories.
 */
export function classifyReplayFailure(mismatch: ReplayMismatch): ReplayFailureClass {
  if (mismatch.kind === "DECISION_KIND") return "decision_kind_changed";
  if (mismatch.kind === "REFUSAL_CODE_DRIFT") return "refusal_code_changed";
  if (mismatch.kind === "BASIS_DRIFT") {
    const missing = mismatch.basisDelta?.missing.length ?? 0;
    const extra = mismatch.basisDelta?.extra.length ?? 0;
    if (missing > 0 && extra === 0) return "basis_removed";
    if (missing === 0 && extra > 0) return "basis_added";
    if (missing > 0 && extra > 0) return "basis_swapped";
  }
  return "unclassified";
}

/**
 * Canonical JSON serialization of a snapshot. Useful when an adopter
 * wants byte-identical snapshots across processes (e.g., for diffing
 * weekly aggregates). Sorts every object key recursively.
 */
export function serializeEcosystemSnapshot(
  snapshot: EcosystemTelemetrySnapshot,
): string {
  return canonicalJson(snapshot);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}
