import { sha256Canonical } from "@adjudicate/canonical";
import type { GenerateOptions, RedTeamPack } from "./scenario.js";
import { generateAllVectors } from "./vectors.js";
import { runRedTeam, type RedTeamReport, type RedTeamSummary } from "./runner.js";

/**
 * Red-team run-history surface (ADR-133).
 *
 * Three additive, PURE helpers turn the single-shot `runRedTeam` report into a
 * trend an operator can read over time:
 *
 *   - `digestRedTeamReport(report)` — a deterministic CONTENT digest over the
 *     report's meaningful fields (pack id, per-result name+vector+status,
 *     summary counts), EXCLUDING any timestamp. Two identical-policy runs
 *     collide to one digest regardless of when they ran, so a "trend" point
 *     appears only when the *content* changes (a regression or a fix), never on
 *     a cold-start replay.
 *   - `runRedTeamAcrossPacks(packs, opts)` — run the full suite against many
 *     packs (map over `runRedTeam(pack, generateAllVectors(pack, opts))`),
 *     returning one report per pack in input order.
 *   - `createInMemoryRedTeamHistoryStore({ capacity? })` — a bounded,
 *     deterministic run-history store keyed by `(packId, digest)`, idempotent on
 *     re-record, with a derived `trend` series for charting.
 *
 * Determinism (ADR-118 discipline, preserved): NO wall-clock and NO RNG on any
 * path. `digestRedTeamReport` reads only report content; the store takes the
 * `at` timestamp explicitly from the caller (`record(report, at)`). The kernel
 * never reads any of this — it is in-process telemetry, never a system of
 * record.
 */

/** "0x…" content digest of a report (canonical-JSON sha256, timing excluded). */
export function digestRedTeamReport(report: RedTeamReport): string {
  // A canonical PROJECTION over the report's meaningful content. Results are
  // sorted by (name, vector) so insertion order never perturbs the digest, and
  // only (name, vector, status) participate — `basisCodes`/`decision`/`error`
  // are evidence of HOW a scenario resolved, not WHETHER the pack's posture
  // changed; folding them in would make the digest needlessly brittle. No `at`
  // / timestamp anywhere, by construction.
  const projection = {
    pack: report.pack.id,
    results: report.results
      .map((r) => ({ name: r.name, vector: r.vector, status: r.status }))
      .sort((a, b) =>
        a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : a.vector < b.vector
              ? -1
              : a.vector > b.vector
                ? 1
                : 0,
      ),
    summary: {
      total: report.summary.total,
      defended: report.summary.defended,
      escaped: report.summary.escaped,
      errors: report.summary.errors,
      escapesByVector: report.summary.escapesByVector,
    },
  };
  return `0x${sha256Canonical(projection)}`;
}

/**
 * Run the full red-team suite (all three vectors) against many packs.
 * Deterministic over `(packs, opts)`: maps `runRedTeam(pack,
 * generateAllVectors(pack, opts))` in input order. No wall-clock / RNG.
 */
export function runRedTeamAcrossPacks(
  packs: ReadonlyArray<RedTeamPack>,
  opts: GenerateOptions = {},
): RedTeamReport[] {
  return packs.map((pack) => runRedTeam(pack, generateAllVectors(pack, opts)));
}

/** One immutable history row — a single recorded run of one pack. */
export interface RedTeamRunRecord {
  /** "0x…" content digest from `digestRedTeamReport` — the run identity. */
  readonly digest: string;
  /** ISO-8601, CALLER-SUPPLIED — the package never reads a clock. */
  readonly at: string;
  /** The pack this run exercised. */
  readonly packId: string;
  /** The run's outcome counts (the full producer summary, structurally). */
  readonly summary: RedTeamSummary;
}

/** One point on a pack's defended/escaped/error trend over runs. */
export interface RedTeamTrendPoint {
  /** ISO-8601 of the recorded run (matches the source record's `at`). */
  readonly at: string;
  /** The pack the point belongs to. */
  readonly packId: string;
  readonly total: number;
  readonly defended: number;
  readonly escaped: number;
  readonly errors: number;
}

/** A read over the retained history: per-pack records + a flat trend series. */
export interface RedTeamHistoryView {
  /** Retained run records, newest-first within each pack, then by pack order. */
  readonly runs: ReadonlyArray<RedTeamRunRecord>;
  /** Chronological (oldest → newest) trend points, one per retained run. */
  readonly trend: ReadonlyArray<RedTeamTrendPoint>;
}

/** Optional filter/window for a history `view()`. */
export interface RedTeamHistoryQuery {
  /** Restrict to a single pack's runs/trend. */
  readonly packId?: string;
  /** Cap the number of most-recent runs (per the resolved pack scope). */
  readonly limit?: number;
}

export interface RedTeamHistoryOptions {
  /** Per-pack ring-buffer bound. Defaults to 500. Must be a positive int. */
  readonly capacity?: number;
}

export interface RedTeamHistoryStore {
  /**
   * Append one immutable run, stamped with a caller-supplied time. Pure over its
   * inputs (no clock/RNG). IDEMPOTENT on `(packId, digest)` — re-recording the
   * same digest for the same pack is a no-op (no duplicate row). Evicts the
   * oldest entry for that pack (FIFO) when at capacity.
   */
  record(report: RedTeamReport, at: string): void;
  /** Read the retained history (optionally filtered/windowed). */
  view(query?: RedTeamHistoryQuery): RedTeamHistoryView;
  /** Clear all entries. */
  reset(): void;
}

const DEFAULT_CAPACITY = 500;

/** Derive a trend point from a stored run record. Pure. */
function toTrendPoint(rec: RedTeamRunRecord): RedTeamTrendPoint {
  return {
    at: rec.at,
    packId: rec.packId,
    total: rec.summary.total,
    defended: rec.summary.defended,
    escaped: rec.summary.escaped,
    errors: rec.summary.errors,
  };
}

/**
 * A bounded, deterministic red-team run-history store (ADR-133). Records are
 * partitioned per pack so each pack rings independently at `capacity`; the
 * insertion order across packs is preserved for a stable global trend.
 */
export function createInMemoryRedTeamHistoryStore(
  opts: RedTeamHistoryOptions = {},
): RedTeamHistoryStore {
  const rawCapacity = opts.capacity ?? DEFAULT_CAPACITY;
  // A non-positive / non-integer capacity is meaningless for a ring buffer;
  // floor to a usable bound rather than throw (telemetry must not fail closed).
  const capacity =
    Number.isFinite(rawCapacity) && rawCapacity >= 1
      ? Math.floor(rawCapacity)
      : DEFAULT_CAPACITY;

  // Per-pack ring buffers, each oldest → newest. A Map keeps pack insertion
  // order (first-seen) so the cross-pack view is deterministic.
  let byPack = new Map<string, RedTeamRunRecord[]>();

  return {
    record(report, at) {
      const packId = report.pack.id;
      const digest = digestRedTeamReport(report);
      const ring = byPack.get(packId) ?? [];
      // Idempotent on (packId, digest): a re-record of the same content is a
      // no-op, so a cold-start replay never duplicates a run.
      if (ring.some((r) => r.digest === digest)) return;
      const record: RedTeamRunRecord = {
        digest,
        at,
        packId,
        summary: report.summary,
      };
      ring.push(record);
      while (ring.length > capacity) ring.shift();
      byPack.set(packId, ring);
    },
    view(query = {}) {
      const limit =
        query.limit != null && Number.isFinite(query.limit) && query.limit >= 1
          ? Math.floor(query.limit)
          : undefined;

      const packEntries = [...byPack.entries()].filter(
        ([packId]) => query.packId == null || packId === query.packId,
      );

      // runs: newest-first per pack, windowed to `limit` most-recent per pack.
      const runs: RedTeamRunRecord[] = [];
      // trend: chronological (oldest → newest) over the SAME windowed set.
      const trend: RedTeamTrendPoint[] = [];
      for (const [, ring] of packEntries) {
        const windowed = limit != null ? ring.slice(-limit) : ring;
        for (let i = windowed.length - 1; i >= 0; i--) runs.push(windowed[i]!);
        for (const rec of windowed) trend.push(toTrendPoint(rec));
      }

      return { runs, trend };
    },
    reset() {
      byPack = new Map();
    },
  };
}
