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
});
