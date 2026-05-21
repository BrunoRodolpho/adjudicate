/**
 * `explainReplayReport` — operator-readable narration.
 *
 * Verifies the three output formats produce stable, readable strings.
 */

import { describe, expect, it } from "vitest";
import { explainReplayReport } from "../src/explain-replay.js";
import type { ReplayReport } from "../src/replay.js";
import type { ReplayIntegrityReport } from "../src/replay-integrity.js";
import type { ReplayMismatch } from "@adjudicate/core";

function cleanReport(): ReplayReport {
  return { total: 100, matched: 100, mismatches: [] };
}

function mismatch(intentHash: string, kind: ReplayMismatch["kind"]): ReplayMismatch {
  const base = {
    kind: "EXECUTE" as const,
    basis: [{ category: "state", code: "transition_valid" }],
  };
  return {
    intentHash,
    kind,
    expected: base,
    actual: { kind: "REFUSE", basis: [], refusal: { code: "policy.deny", scope: "USER" } },
    basisDelta:
      kind === "BASIS_DRIFT"
        ? { missing: ["state:transition_valid"], extra: ["state:transition_illegal"] }
        : undefined,
  };
}

function integrityReport(overrides: Partial<ReplayIntegrityReport> = {}): ReplayIntegrityReport {
  return {
    total: 100,
    matched: 100,
    mismatches: [],
    integrityFailures: [],
    preV4Records: 0,
    ...overrides,
  };
}

describe("explainReplayReport — ci-line format", () => {
  it("renders ✓ PASS on a clean report", () => {
    const line = explainReplayReport(cleanReport(), { format: "ci-line" });
    expect(line).toBe("✓ replay PASS: 100/100 matched");
  });

  it("renders ✗ FAIL with mismatch count", () => {
    const r: ReplayReport = {
      total: 100,
      matched: 97,
      mismatches: [
        mismatch("h-1", "DECISION_KIND"),
        mismatch("h-2", "BASIS_DRIFT"),
        mismatch("h-3", "REFUSAL_CODE_DRIFT"),
      ],
    };
    const line = explainReplayReport(r, { format: "ci-line" });
    expect(line).toBe("✗ replay FAIL: 97/100 matched, 3 mismatches");
  });

  it("includes integrity failures when present", () => {
    const r = integrityReport({
      matched: 90,
      mismatches: [mismatch("h-1", "DECISION_KIND")],
      integrityFailures: [
        {
          intentHash: "h-2",
          kind: "AUDIT_HASH_TAMPERED",
          detail: { stored: "abc123def456", derived: "ffffffffffff" },
        },
      ],
    });
    const line = explainReplayReport(r, { format: "ci-line" });
    expect(line).toMatch(/replay FAIL/);
    expect(line).toMatch(/1 mismatches/);
    expect(line).toMatch(/1 integrity failures/);
  });
});

describe("explainReplayReport — summary format", () => {
  it("clean report renders a positive sentence", () => {
    const s = explainReplayReport(cleanReport(), { format: "summary" });
    expect(s).toMatch(/Replay clean/);
  });

  it("preV4 records get a callout", () => {
    const r = integrityReport({ preV4Records: 5 });
    const s = explainReplayReport(r, { format: "summary" });
    expect(s).toMatch(/5 records pre-date AuditRecord v4/);
  });

  it("integrity failures get a security framing", () => {
    const r = integrityReport({
      matched: 99,
      integrityFailures: [
        {
          intentHash: "h-1",
          kind: "INTENT_HASH_MISMATCH",
          detail: { stored: "abc", derived: "def" },
        },
      ],
    });
    const s = explainReplayReport(r, { format: "summary" });
    expect(s).toMatch(/security incident/);
  });
});

describe("explainReplayReport — operator format", () => {
  it("renders mismatches with truncation when over limit", () => {
    const ms: ReplayMismatch[] = [];
    for (let i = 0; i < 10; i++) ms.push(mismatch(`h-${i}`, "DECISION_KIND"));
    const r: ReplayReport = { total: 100, matched: 90, mismatches: ms };
    const out = explainReplayReport(r, { format: "operator", limit: 3 });
    expect(out).toMatch(/Replay mismatches:/);
    // 3 shown + 1 truncation note
    expect(out.split("\n").filter((l) => l.startsWith("  - ")).length).toBe(3);
    expect(out).toMatch(/and 7 more/);
  });

  it("renders integrity failures separately from replay mismatches", () => {
    const r = integrityReport({
      matched: 95,
      mismatches: [mismatch("h-mismatch", "BASIS_DRIFT")],
      integrityFailures: [
        {
          intentHash: "h-tampered",
          kind: "AUDIT_HASH_TAMPERED",
          detail: { stored: "abc123def456", derived: "ffffffffffff" },
        },
      ],
    });
    const out = explainReplayReport(r, { format: "operator" });
    expect(out).toMatch(/Replay mismatches:/);
    expect(out).toMatch(/Integrity failures:/);
    expect(out).toMatch(/h-mismat/);
    expect(out).toMatch(/h-tamper/);
  });

  it("clean report renders a single summary line", () => {
    const out = explainReplayReport(cleanReport(), { format: "operator" });
    expect(out.split("\n").length).toBe(1);
    expect(out).toMatch(/Replay clean/);
  });

  it("basis-drift mismatches render their delta inline", () => {
    const r: ReplayReport = {
      total: 1,
      matched: 0,
      mismatches: [mismatch("h-1", "BASIS_DRIFT")],
    };
    const out = explainReplayReport(r, { format: "operator" });
    expect(out).toMatch(/missing \[state:transition_valid\]/);
    expect(out).toMatch(/extra \[state:transition_illegal\]/);
  });
});

describe("explainReplayReport — defaults", () => {
  it("defaults to operator format", () => {
    const out = explainReplayReport(cleanReport());
    expect(out).toMatch(/Replay clean/);
  });

  it("defaults limit to 5 when not specified", () => {
    const ms: ReplayMismatch[] = [];
    for (let i = 0; i < 10; i++) ms.push(mismatch(`h-${i}`, "DECISION_KIND"));
    const r: ReplayReport = { total: 100, matched: 90, mismatches: ms };
    const out = explainReplayReport(r);
    expect(out.split("\n").filter((l) => l.startsWith("  - ")).length).toBe(5);
    expect(out).toMatch(/and 5 more/);
  });
});
