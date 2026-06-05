import { describe, expect, it } from "vitest";
import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type AuditRecord,
} from "@adjudicate/core";
import {
  buildSupersessionChains,
  explainSupersessionChainReport,
} from "../src/index.js";

const at = "2026-05-21T00:00:00.000Z";

function makeRecord(
  nonce: string,
  decision = decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
  supersedes?: AuditRecord["supersedes"],
): AuditRecord {
  const e = buildEnvelope({
    kind: "vacation.request",
    payload: { n: nonce },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: at,
  });
  return buildAuditRecord({
    envelope: e,
    decision,
    durationMs: 1,
    at,
    ...(supersedes !== undefined ? { supersedes } : {}),
  });
}

describe("buildSupersessionChains", () => {
  it("returns an empty report for an empty input", () => {
    const r = buildSupersessionChains([]);
    expect(r.chains).toHaveLength(0);
    expect(r.singletons).toHaveLength(0);
    expect(r.danglingReferences).toHaveLength(0);
    expect(r.aggregateReasonCounts.confirmation_resolved).toBe(0);
    expect(r.schemaVersion).toBe(1);
  });

  it("treats stand-alone records as singletons", () => {
    const a = makeRecord("n-1");
    const b = makeRecord("n-2");
    const r = buildSupersessionChains([a, b]);
    expect(r.chains).toHaveLength(0);
    expect(r.singletons).toHaveLength(2);
    expect(r.danglingReferences).toHaveLength(0);
  });

  it("reconstructs a confirmation-resolved → execute chain", () => {
    const ask = makeRecord(
      "n-ask",
      decisionRefuse(refuse("BUSINESS_RULE", "needs_confirmation", "ask"), [
        basis("BUSINESS_RULE", "needs_confirmation", "ask"),
      ]),
    );
    const resolve = makeRecord("n-resolve", decisionExecute([]), {
      reason: "confirmation_resolved",
      predecessorIntentHash: ask.intentHash,
      predecessorAt: ask.at,
      token: "tok-1",
    });
    const r = buildSupersessionChains([ask, resolve]);
    expect(r.chains).toHaveLength(1);
    const chain = r.chains[0]!;
    expect(chain.head.intentHash).toBe(resolve.intentHash);
    expect(chain.tail.map((n) => n.intentHash)).toEqual([ask.intentHash]);
    expect(chain.length).toBe(2);
    expect(chain.reasonCounts.confirmation_resolved).toBe(1);
    expect(r.aggregateReasonCounts.confirmation_resolved).toBe(1);
  });

  it("confirmation-resolved pair sharing intentHash reports as a chain, not a cycle", () => {
    // LogicReviewer-003: the EXECUTE record emitted after a confirmation
    // receipt shares the envelope's intentHash with its predecessor
    // REQUEST_CONFIRMATION record. The walker must keep both distinguishable
    // (disambiguate by `at`) instead of collapsing them and flagging a cycle.
    const sharedHash = "a".repeat(64);
    const sharedAt = "2026-05-01T00:00:00.000Z";
    const requestRecord = { ...makeRecord("n-req"), intentHash: sharedHash, at: sharedAt };
    const executeRecord = {
      ...makeRecord("n-exe"),
      intentHash: sharedHash,
      at: "2026-05-01T00:01:00.000Z",
      supersedes: {
        predecessorIntentHash: sharedHash,
        predecessorAt: sharedAt,
        reason: "confirmation_resolved" as const,
      },
    };
    const report = buildSupersessionChains([requestRecord, executeRecord]);
    expect(report.cycles).toHaveLength(0);
    expect(report.chains).toHaveLength(1);
    expect(report.chains[0]!.reasonCounts.confirmation_resolved).toBe(1);
  });

  it("walks a multi-step chain (rewrite → defer → execute) head-first", () => {
    const original = makeRecord("n-1");
    const rewrite = makeRecord(
      "n-2",
      decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
      {
        reason: "rewrite_executed",
        predecessorIntentHash: original.intentHash,
        predecessorAt: original.at,
      },
    );
    const resume = makeRecord(
      "n-3",
      decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
      {
        reason: "defer_resumed",
        predecessorIntentHash: rewrite.intentHash,
        predecessorAt: rewrite.at,
      },
    );
    const r = buildSupersessionChains([original, rewrite, resume]);
    expect(r.chains).toHaveLength(1);
    const chain = r.chains[0]!;
    expect(chain.head.intentHash).toBe(resume.intentHash);
    expect(chain.tail.map((n) => n.intentHash)).toEqual([
      rewrite.intentHash,
      original.intentHash,
    ]);
    expect(chain.length).toBe(3);
    expect(chain.reasonCounts.defer_resumed).toBe(1);
    expect(chain.reasonCounts.rewrite_executed).toBe(1);
  });

  it("reports dangling references when the predecessor is not in the set", () => {
    const orphan = makeRecord("n-orphan", decisionExecute([]), {
      reason: "replay",
      predecessorIntentHash: "0".repeat(64),
      predecessorAt: at,
    });
    const r = buildSupersessionChains([orphan]);
    expect(r.danglingReferences).toEqual([
      { intentHash: orphan.intentHash, missingPredecessor: "0".repeat(64) },
    ]);
    expect(r.chains).toHaveLength(0);
    expect(r.singletons).toHaveLength(0);
  });

  it("is deterministic — same input ordering produces identical output", () => {
    const original = makeRecord("n-1");
    const resume = makeRecord("n-2", decisionExecute([]), {
      reason: "defer_resumed",
      predecessorIntentHash: original.intentHash,
      predecessorAt: original.at,
    });
    const a = buildSupersessionChains([original, resume]);
    const b = buildSupersessionChains([original, resume]);
    expect(a).toEqual(b);
  });

  it("explainSupersessionChainReport returns a one-line summary", () => {
    const original = makeRecord("n-1");
    const resume = makeRecord("n-2", decisionExecute([]), {
      reason: "defer_resumed",
      predecessorIntentHash: original.intentHash,
      predecessorAt: original.at,
    });
    const r = buildSupersessionChains([original, resume]);
    const text = explainSupersessionChainReport(r);
    expect(text).toContain("1 chain");
    expect(text).toContain("defer_resumed=1");
  });

  it("surfaces an LGPD scrub fan-out (1 root + N scrubs) in the forks index", () => {
    // The canonical lgpd_scrub shape: a single customer-anonymize root
    // is the predecessor of N per-surface scrub records.
    const root = makeRecord("anonymize-root");
    const scrubs = ["order", "conversation", "loyalty", "reservation"].map(
      (surface, i) =>
        makeRecord(`scrub-${surface}-${i}`, decisionExecute([]), {
          reason: "lgpd_scrub",
          predecessorIntentHash: root.intentHash,
          predecessorAt: root.at,
        }),
    );
    const report = buildSupersessionChains([root, ...scrubs]);

    // Forks index surfaces the fan-out shape.
    expect(report.forks).toHaveLength(1);
    expect(report.forks[0]!.predecessorIntentHash).toBe(root.intentHash);
    expect(report.forks[0]!.successorIntentHashes).toHaveLength(scrubs.length);
    expect(report.forks[0]!.successorIntentHashes.sort()).toEqual(
      scrubs.map((s) => s.intentHash).sort(),
    );

    // Each scrub becomes its own chain (no fork-aware chain shape), so
    // 4 chains is the legitimate "4 surfaces scrubbed" representation
    // — the forks index is what lets dashboards report "1 forked
    // anonymize → 4 surfaces" instead of "4 unrelated chains".
    expect(report.chains).toHaveLength(scrubs.length);
    for (const chain of report.chains) {
      expect(chain.tail.map((n) => n.intentHash)).toEqual([root.intentHash]);
      expect(chain.reasonCounts.lgpd_scrub).toBe(1);
    }

    // No cycles, no singletons (root is now a predecessor → not a head;
    // scrubs are heads).
    expect(report.cycles).toHaveLength(0);
    expect(report.singletons).toHaveLength(0);
    expect(report.aggregateReasonCounts.lgpd_scrub).toBe(scrubs.length);

    const summary = explainSupersessionChainReport(report);
    expect(summary).toContain(`${scrubs.length} chain`);
    expect(summary).toContain("1 fork");
    expect(summary).toContain(`lgpd_scrub=${scrubs.length}`);
  });

  it("emits a pure cycle ({A→B, B→A}) into the cycles collection", () => {
    // Adversarial input: both records point at each other. Legitimate
    // workloads cannot produce this (buildAuditRecord requires the
    // predecessor's hash, which can't be known before its own hash is
    // computed), but raw AuditRecord objects from a malicious or buggy
    // producer can. The cycle guard prevents silent record loss.
    const a = makeRecord("cycle-a");
    const b = makeRecord("cycle-b");
    const aCycled: AuditRecord = {
      ...a,
      supersedes: {
        reason: "replay",
        predecessorIntentHash: b.intentHash,
        predecessorAt: b.at,
      },
    };
    const bCycled: AuditRecord = {
      ...b,
      supersedes: {
        reason: "replay",
        predecessorIntentHash: a.intentHash,
        predecessorAt: a.at,
      },
    };

    const report = buildSupersessionChains([aCycled, bCycled]);

    // Both records form the cycle component and must surface in
    // `cycles` rather than vanishing from the report.
    expect(report.cycles.length).toBeGreaterThanOrEqual(1);
    const cycleHashes = new Set<string>();
    for (const c of report.cycles) {
      cycleHashes.add(c.head.intentHash);
      for (const t of c.tail) cycleHashes.add(t.intentHash);
    }
    expect(cycleHashes.has(a.intentHash)).toBe(true);
    expect(cycleHashes.has(b.intentHash)).toBe(true);

    // Cycles do NOT pollute the chains list.
    expect(report.chains).toHaveLength(0);
    // Cycles do NOT inflate aggregate counters: the looping edge is
    // walked at most once per cycle, not unbounded.
    expect(report.aggregateReasonCounts.replay).toBeLessThanOrEqual(
      report.cycles.length * 2,
    );

    const summary = explainSupersessionChainReport(report);
    expect(summary).toContain("cycle");
  });

  it("surfaces a cycle reachable only by an external head (A→B→A with C→B)", () => {
    // Mixed shape: B and A form a cycle (B.supersedes = A, A.supersedes
    // = B); C also points at B (external entry into the cycle from
    // outside). Walking from C must terminate cleanly at the cycle
    // boundary, and the cycle pair must surface.
    const a = makeRecord("mixed-a");
    const b = makeRecord("mixed-b");
    const c = makeRecord("mixed-c");
    const aCycled: AuditRecord = {
      ...a,
      supersedes: {
        reason: "replay",
        predecessorIntentHash: b.intentHash,
        predecessorAt: b.at,
      },
    };
    const bCycled: AuditRecord = {
      ...b,
      supersedes: {
        reason: "replay",
        predecessorIntentHash: a.intentHash,
        predecessorAt: a.at,
      },
    };
    const cExternal: AuditRecord = {
      ...c,
      supersedes: {
        reason: "defer_resumed",
        predecessorIntentHash: b.intentHash,
        predecessorAt: b.at,
      },
    };

    const report = buildSupersessionChains([aCycled, bCycled, cExternal]);

    // C is a head (nothing supersedes C) — its walk hits the A↔B cycle
    // and must terminate without infinite-looping. The walk emits to
    // either chains (legitimate finite walk) or cycles (when revisit
    // detected within the walk).
    const allEmittedHashes = new Set<string>();
    for (const collection of [report.chains, report.cycles]) {
      for (const ch of collection) {
        allEmittedHashes.add(ch.head.intentHash);
        for (const t of ch.tail) allEmittedHashes.add(t.intentHash);
      }
    }
    for (const s of report.singletons) allEmittedHashes.add(s.intentHash);
    for (const d of report.danglingReferences)
      allEmittedHashes.add(d.intentHash);

    // No record vanishes silently.
    expect(allEmittedHashes.has(a.intentHash)).toBe(true);
    expect(allEmittedHashes.has(b.intentHash)).toBe(true);
    expect(allEmittedHashes.has(c.intentHash)).toBe(true);
  });
});
