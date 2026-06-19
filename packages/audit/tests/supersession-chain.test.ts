import { describe, expect, it } from "vitest";
import {
  adjudicateAndAudit,
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  refuse,
  type AuditRecord,
  type AuditSink,
  type BudgetGrant,
  type Guard,
  type TaintPolicy,
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

/**
 * Like makeRecord but also threads a cryptographic `prevAuditHash` link (093).
 * Used to exercise the per-stream cryptographic tip + chain-break detection,
 * which is distinct from the logical `predecessorIntentHash` supersession link.
 */
function makeRecordWithPrev(
  nonce: string,
  prevAuditHash: string | undefined,
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
    decision: decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
    durationMs: 1,
    at,
    ...(supersedes !== undefined ? { supersedes } : {}),
    ...(prevAuditHash !== undefined ? { prevAuditHash } : {}),
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

// ── 025 (LogicReviewer) — END-TO-END budget chain over REAL kernel records ──
// The prior commit set the budget-satisfied EXECUTE's `supersedes.predecessorAt`
// to the SECOND `adjudicateAndAudit` call's `clock.nowIso()`, which equals that
// EXECUTE row's OWN `at` — NOT the predecessor REQUEST_CONFIRMATION row's `at`
// (emitted by a SEPARATE, earlier call at an earlier wall clock). Because the two
// records share the envelope's intentHash, the chain walker's `at`-disambiguation
// (findRecord) could not tell them apart, yielding a FALSE CYCLE / spurious
// singleton with `budget_satisfied` invisible in reason analytics. This is the
// 025 T6/§3 audit-observability deliverable — it was UNCOVERED: no test ran
// buildSupersessionChains over the real (REQUEST_CONFIRMATION, budget-EXECUTE)
// pair. The fix threads the predecessor row's `at` as `budgetGrant.originalAt`.
describe("025 — budget-satisfied chain reconstructs end-to-end (real kernel emission)", () => {
  const permissive: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
  const askConfirm: Guard<string, unknown, unknown> = () =>
    decisionRequestConfirmation("Confirm this transfer?", []);
  const policy = {
    stateGuards: [],
    authGuards: [],
    taint: permissive,
    business: [askConfirm],
    default: "REFUSE" as const,
  };
  const grant: BudgetGrant = {
    budgetId: "bud-chain",
    intentKind: "pix.charge.create",
    limit: 5,
    windowSeconds: 600,
  };

  function envOf(nonce: string) {
    return buildEnvelope({
      kind: "pix.charge.create",
      payload: { amountCentavos: 5000 },
      actor: { principal: "llm", sessionId: "s-budget-chain" },
      taint: "UNTRUSTED",
      nonce,
      createdAt: "2026-06-19T12:00:00.000Z",
    });
  }

  // An ADVANCING wall clock — distinct ticks for the two SEPARATE kernel calls,
  // mirroring real-clock semantics (REQUEST_CONFIRMATION@T1, budget-EXECUTE@T2,
  // T2 != T1). A frozen clock would mask the defect (predecessorAt == at trivially).
  function advancingClock(startMs: number, stepMs: number) {
    let ms = startMs;
    return {
      nowIso: () => {
        const iso = new Date(ms).toISOString();
        ms += stepMs;
        return iso;
      },
      // nowMs is read for latency only (start/end of each call); advance it too
      // so it never collides, but it does NOT enter the auditHash pre-image.
      nowMs: () => {
        const v = ms;
        return v;
      },
    };
  }

  function captureSink(): { sink: AuditSink; records: AuditRecord[] } {
    const records: AuditRecord[] = [];
    return { sink: { async emit(r) { records.push(r); } }, records };
  }

  it("buildSupersessionChains over (REQUEST_CONFIRMATION@T1, budget-EXECUTE@T2) yields 1 chain / 0 cycles / budget_satisfied=1", async () => {
    const env = envOf("n-budget-chain");
    const { sink, records } = captureSink();
    const clock = advancingClock(Date.parse("2026-06-19T12:00:00.000Z"), 60_000);

    // FIRST call — no grant asserted: the kernel returns REQUEST_CONFIRMATION
    // and emits its audit row at T1. The shell would persist this row first.
    const first = await adjudicateAndAudit(env, {}, policy, { sink, clock });
    expect(first.decision.kind).toBe("REQUEST_CONFIRMATION");
    const requestRow = records[0]!;
    const t1 = requestRow.at;

    // SECOND call — after an atomic burn-down the shell re-adjudicates with the
    // grant asserted AND threads the predecessor row's `at` as originalAt. The
    // kernel substitutes EXECUTE and the budget-satisfied row is emitted at a
    // LATER wall clock (T2 != T1).
    const second = await adjudicateAndAudit(env, {}, policy, {
      sink,
      clock,
      budgetGrant: { ...grant, originalAt: requestRow.at },
    });
    expect(second.decision.kind).toBe("EXECUTE");
    const executeRow = records[1]!;
    const t2 = executeRow.at;

    // Pre-conditions that make this a faithful repro of the defect:
    expect(executeRow.intentHash).toBe(requestRow.intentHash); // shared hash
    expect(t2).not.toBe(t1); // real-clock: second call ticked later
    expect(executeRow.supersedes?.reason).toBe("budget_satisfied");
    // The load-bearing assertion: predecessorAt points at the PREDECESSOR row's
    // `at` (T1), NOT this EXECUTE row's own `at` (T2). This is exactly what the
    // prior commit got wrong.
    expect(executeRow.supersedes?.predecessorAt).toBe(t1);
    expect(executeRow.supersedes?.predecessorAt).not.toBe(t2);

    // The deliverable: operators can reconstruct the budget-satisfied chain.
    const report = buildSupersessionChains([requestRow, executeRow]);
    expect(report.cycles).toHaveLength(0);
    expect(report.chains).toHaveLength(1);
    expect(report.singletons).toHaveLength(0);
    const chain = report.chains[0]!;
    expect(chain.head.intentHash).toBe(executeRow.intentHash);
    expect(chain.tail.map((n) => n.at)).toEqual([t1]); // walks back to the request row
    expect(chain.reasonCounts.budget_satisfied).toBe(1);
    expect(report.aggregateReasonCounts.budget_satisfied).toBe(1);
  });
});

// ─── 093 (T3): per-stream cryptographic tip + chain-break, distinct from the
// logical predecessorIntentHash link ───────────────────────────────────────
describe("buildSupersessionChains — 093 cryptographic chain tip", () => {
  it("surfaces the per-stream cryptographic tip (auditHash + prevAuditHash) on each node", () => {
    const original = makeRecordWithPrev("n-1", undefined); // genesis
    const successor = makeRecordWithPrev("n-2", original.auditHash, {
      reason: "rewrite_executed",
      predecessorIntentHash: original.intentHash,
      predecessorAt: original.at,
    });
    const report = buildSupersessionChains([original, successor]);
    expect(report.chains).toHaveLength(1);
    const chain = report.chains[0]!;
    // The head (successor) surfaces BOTH the cryptographic tip (its own
    // auditHash) and the cryptographic link to its predecessor (prevAuditHash).
    expect(chain.head.auditHash).toBe(successor.auditHash);
    expect(chain.head.prevAuditHash).toBe(original.auditHash);
    // The tail (genesis) surfaces its own auditHash but no cryptographic link.
    expect(chain.tail[0]!.auditHash).toBe(original.auditHash);
    expect(chain.tail[0]!.prevAuditHash).toBeUndefined();
    // The intact cryptographic link produces NO chain break.
    expect(report.chainBreaks).toHaveLength(0);
  });

  it("surfaces a BROKEN cryptographic link distinctly from the (intact) logical link", () => {
    // The logical link (predecessorIntentHash) resolves the chain walk
    // correctly, but the cryptographic link (prevAuditHash) points at a WRONG
    // hash — the predecessor was substituted, which the logical link can't catch.
    const original = makeRecordWithPrev("n-1", undefined);
    const tampered = makeRecordWithPrev(
      "n-2",
      "f".repeat(64), // a prevAuditHash that does NOT match original.auditHash
      {
        reason: "rewrite_executed",
        predecessorIntentHash: original.intentHash, // logical link still valid
        predecessorAt: original.at,
      },
    );
    const report = buildSupersessionChains([original, tampered]);
    // The LOGICAL chain still reconstructs (the walk uses predecessorIntentHash).
    expect(report.chains).toHaveLength(1);
    expect(report.chains[0]!.head.intentHash).toBe(tampered.intentHash);
    expect(report.danglingReferences).toHaveLength(0);
    // But the CRYPTOGRAPHIC break is surfaced DISTINCTLY.
    expect(report.chainBreaks).toHaveLength(1);
    const brk = report.chainBreaks[0]!;
    expect(brk.intentHash).toBe(tampered.intentHash);
    expect(brk.prevAuditHash).toBe("f".repeat(64));
    expect(brk.predecessorAuditHash).toBe(original.auditHash);
    expect(brk.predecessorIntentHash).toBe(original.intentHash);
  });

  it("a record with no prevAuditHash never produces a chain break (logical-only chains are unaffected)", () => {
    const original = makeRecord("n-1");
    const successor = makeRecord("n-2", decisionExecute([basis("BUSINESS_RULE", "ok", "x")]), {
      reason: "defer_resumed",
      predecessorIntentHash: original.intentHash,
      predecessorAt: original.at,
    });
    const report = buildSupersessionChains([original, successor]);
    expect(report.chains).toHaveLength(1);
    expect(report.chainBreaks).toHaveLength(0);
  });
});
