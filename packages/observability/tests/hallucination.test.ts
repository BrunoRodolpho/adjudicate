import { describe, expect, it } from "vitest";
import type { AuditRecord } from "@adjudicate/core";
import {
  bucketHallucinationScore,
  createHallucinationMetadataProvider,
  createLexicalGroundednessScorer,
} from "../src/hallucination.js";
import { createInMemoryExporter } from "../src/exporter.js";
import { SEMCONV } from "../src/semconv.js";

const record = {
  intentHash: "0xabc",
  at: "2026-04-29T12:00:00.000Z",
  envelope: { kind: "x.do" },
} as unknown as AuditRecord;

describe("bucketHallucinationScore", () => {
  it("buckets by thresholds and clamps out-of-range", () => {
    expect(bucketHallucinationScore(0)).toBe("grounded");
    expect(bucketHallucinationScore(0.5)).toBe("uncertain");
    expect(bucketHallucinationScore(0.9)).toBe("hallucinated");
    expect(bucketHallucinationScore(-1)).toBe("grounded");
    expect(bucketHallucinationScore(2)).toBe("hallucinated");
    expect(bucketHallucinationScore(Number.NaN)).toBe("grounded");
  });
});

describe("createHallucinationMetadataProvider", () => {
  it("returns metadata and emits the semconv attribute", () => {
    const exp = createInMemoryExporter();
    const { metadataProvider } = createHallucinationMetadataProvider({
      scorer: { score: () => 0.8 },
      exporter: exp.exporter,
    });
    const meta = metadataProvider(record);
    expect(meta).toEqual({ hallucination_score: 0.8, hallucination_bucket: "hallucinated" });
    expect(exp.events).toHaveLength(1);
    expect(exp.events[0]!.attributes[SEMCONV.HALLUCINATION_SCORE]).toBe(0.8);
    expect(exp.events[0]!.attributes[SEMCONV.HALLUCINATION_BUCKET]).toBe("hallucinated");
  });

  it("returns undefined when the scorer skips (no export)", () => {
    const exp = createInMemoryExporter();
    const { metadataProvider } = createHallucinationMetadataProvider({
      scorer: { score: () => undefined },
      exporter: exp.exporter,
    });
    expect(metadataProvider(record)).toBeUndefined();
    expect(exp.events).toHaveLength(0);
  });

  it("clamps an out-of-range score deterministically", () => {
    const { metadataProvider } = createHallucinationMetadataProvider({ scorer: { score: () => 5 } });
    expect(metadataProvider(record)).toEqual({ hallucination_score: 1, hallucination_bucket: "hallucinated" });
  });

  it("swallows a throwing exporter (best-effort) but still returns metadata", () => {
    const throwing = { export: () => { throw new Error("exporter down"); } };
    const { metadataProvider } = createHallucinationMetadataProvider({
      scorer: { score: () => 0.2 },
      exporter: throwing,
    });
    expect(metadataProvider(record)).toEqual({ hallucination_score: 0.2, hallucination_bucket: "grounded" });
  });
});

describe("createLexicalGroundednessScorer (reference)", () => {
  const rec = (payload: Record<string, unknown>) =>
    ({ intentHash: "h", at: "t", envelope: { kind: "agent.answer", payload } }) as unknown as AuditRecord;

  it("scores a fully-supported claim as grounded (score ~0)", () => {
    const s = createLexicalGroundednessScorer();
    const score = s.score(rec({ claim: "refund approved", evidence: "the refund was approved per policy" }))!;
    expect(score).toBe(0); // every claim token appears in the evidence
    expect(bucketHallucinationScore(score)).toBe("grounded");
  });

  it("scores an unsupported claim as hallucinated (high score)", () => {
    const s = createLexicalGroundednessScorer();
    const score = s.score(rec({ claim: "preauthorized worldwide instantly guaranteed", evidence: "escalated to a human reviewer" }))!;
    expect(score).toBeGreaterThanOrEqual(0.67);
    expect(bucketHallucinationScore(score)).toBe("hallucinated");
  });

  it("returns undefined (skips) when claim/evidence are absent", () => {
    const s = createLexicalGroundednessScorer();
    expect(s.score(rec({ other: 1 }))).toBeUndefined();
  });

  it("wires end-to-end through the metadataProvider", () => {
    const { metadataProvider } = createHallucinationMetadataProvider({
      scorer: createLexicalGroundednessScorer(),
    });
    const meta = metadataProvider(rec({ claim: "aliens secretly approved this", evidence: "refund within thresholds approved" }));
    expect(typeof (meta as { hallucination_score?: number }).hallucination_score).toBe("number");
    expect(meta).toHaveProperty("hallucination_bucket");
  });
});
