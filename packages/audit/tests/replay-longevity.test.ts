/**
 * Replay longevity — the cross-version replay corpus.
 *
 * Reads `docs/specs/replay-longevity-corpus.json` (the normative
 * cross-runtime fixture file) and asserts that every fixture still
 * replays as `IDENTICAL` under the current kernel and the current
 * canonical-hash recipe.
 *
 * This is the gate that enforces
 * `docs/specs/REPLAY_LONGEVITY_MODEL.md` §2.1 (IDENTICAL within a
 * MINOR) at the per-release CI gate. A failure here is a release-blocker:
 * either the canonicalisation algorithm drifted, the audit-record shape
 * mutated non-additively, or the basis vocabulary regressed.
 *
 * Adding fixtures: append to the JSON file. Never mutate existing
 * entries. See `REPLAY_LONGEVITY_MODEL.md` §4.3.
 *
 * The fixture file is also normative for any external (Rust/Go/Python)
 * runtime claiming interop — the same envelope must produce the listed
 * `expectedIntentHash`, and the same `(envelope, decision)` must replay
 * clean.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AuditRecord,
  type Decision,
  type IntentActor,
  type Taint,
  buildAuditRecord,
  buildEnvelope,
} from "@adjudicate/core";
import {
  isReplayIntegrityClean,
  replayWithIntegrity,
} from "../src/replay-integrity.js";

interface LongevityFixture {
  readonly label: string;
  readonly category: string;
  readonly since: string;
  readonly notes: string;
  readonly envelopeInput: {
    readonly kind: string;
    readonly payload: unknown;
    readonly actor: IntentActor;
    readonly taint: Taint;
    readonly nonce: string;
    readonly createdAt: string;
  };
  readonly expectedIntentHash?: string;
  readonly decision: Decision;
  readonly recordedAt: string;
  readonly durationMs: number;
}

interface LongevityCorpus {
  readonly title: string;
  readonly spec: string;
  readonly algorithmVersion: string;
  readonly since: string;
  readonly fixtures: readonly LongevityFixture[];
}

function loadCorpus(): LongevityCorpus {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const corpusPath = path.resolve(
    here,
    "..",
    "..",
    "..",
    "docs",
    "specs",
    "replay-longevity-corpus.json",
  );
  const raw = readFileSync(corpusPath, "utf8");
  return JSON.parse(raw) as LongevityCorpus;
}

function buildRecord(fixture: LongevityFixture): AuditRecord {
  const envelope = buildEnvelope({
    kind: fixture.envelopeInput.kind,
    payload: fixture.envelopeInput.payload,
    actor: fixture.envelopeInput.actor,
    taint: fixture.envelopeInput.taint,
    nonce: fixture.envelopeInput.nonce,
    createdAt: fixture.envelopeInput.createdAt,
  });
  return buildAuditRecord({
    envelope,
    decision: fixture.decision,
    durationMs: fixture.durationMs,
    at: fixture.recordedAt,
  });
}

describe("replay longevity corpus", () => {
  const corpus = loadCorpus();

  it("loads the corpus", () => {
    expect(corpus.fixtures.length).toBeGreaterThan(0);
    expect(corpus.spec).toBe("docs/specs/REPLAY_LONGEVITY_MODEL.md");
    expect(corpus.algorithmVersion).toBe("v2");
  });

  for (const fixture of corpus.fixtures) {
    describe(fixture.label, () => {
      it("preserves the envelope's intentHash across versions", () => {
        const envelope = buildEnvelope({
          kind: fixture.envelopeInput.kind,
          payload: fixture.envelopeInput.payload,
          actor: fixture.envelopeInput.actor,
          taint: fixture.envelopeInput.taint,
          nonce: fixture.envelopeInput.nonce,
          createdAt: fixture.envelopeInput.createdAt,
        });
        if (fixture.expectedIntentHash !== undefined) {
          // Pinned across releases — canonical-hash drift fails here.
          expect(envelope.intentHash).toBe(fixture.expectedIntentHash);
        }
        expect(envelope.intentHash).toMatch(/^[0-9a-f]{64}$/);
      });

      it("replays IDENTICAL with integrity intact", () => {
        const record = buildRecord(fixture);
        const adjudicator = () => fixture.decision;
        const report = replayWithIntegrity([record], adjudicator);
        expect(report.total).toBe(1);
        expect(report.matched).toBe(1);
        expect(report.mismatches).toHaveLength(0);
        expect(report.integrityFailures).toHaveLength(0);
        expect(report.preV4Records).toBe(0);
        expect(isReplayIntegrityClean(report)).toBe(true);
      });

      it("produces a v4 record with a valid auditHash", () => {
        const record = buildRecord(fixture);
        expect(record.version).toBe(4);
        expect(record.auditHash).toBeDefined();
        expect(record.auditHash).toMatch(/^[0-9a-f]{64}$/);
      });
    });
  }

  it("aggregates clean across the full corpus", () => {
    const records = corpus.fixtures.map(buildRecord);
    const fixtureIndex = new Map(
      corpus.fixtures.map((f, i) => [records[i]!.intentHash, f.decision]),
    );
    const adjudicator = (record: AuditRecord): Decision => {
      const decision = fixtureIndex.get(record.intentHash);
      if (!decision) {
        throw new Error(`No fixture for intentHash ${record.intentHash}`);
      }
      return decision;
    };
    const report = replayWithIntegrity(records, adjudicator);
    expect(report.total).toBe(corpus.fixtures.length);
    expect(report.matched).toBe(corpus.fixtures.length);
    expect(report.mismatches).toHaveLength(0);
    expect(report.integrityFailures).toHaveLength(0);
  });

  it("every fixture targets a distinct envelope", () => {
    const records = corpus.fixtures.map(buildRecord);
    const hashes = new Set(records.map((r) => r.intentHash));
    expect(hashes.size).toBe(records.length);
  });
});
