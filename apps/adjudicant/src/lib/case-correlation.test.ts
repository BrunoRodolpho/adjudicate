import { describe, expect, it } from "vitest";
import type { AuditRecord, AuditRecordVerification } from "@adjudicate/core";
import { correlateCase, type CaseCorrelationInput } from "./case-correlation";

/**
 * 113 — non-vacuous tests for the pure case-correlation helper. These exercise
 * the REAL correlation: session grouping, backward + forward supersession
 * lineage walking, deterministic timeline ordering, index-aligned verification
 * alignment, and the seed-not-found path. Every assertion would FAIL if the
 * correlation logic were a stub / pass-through.
 */

// Minimal AuditRecord fixture carrying only the fields correlateCase reads. The
// cast is sound for this pure helper — it never touches the other fields.
function rec(opts: {
  intentHash: string;
  sessionId: string;
  at: string;
  kind?: string;
  decision?: string;
  supersedes?: string;
}): AuditRecord {
  return {
    intentHash: opts.intentHash,
    at: opts.at,
    decision: { kind: opts.decision ?? "REFUSE" },
    envelope: {
      kind: opts.kind ?? "test.intent",
      actor: { sessionId: opts.sessionId },
    },
    ...(opts.supersedes
      ? {
          supersedes: {
            predecessorIntentHash: opts.supersedes,
            predecessorAt: "2026-06-19T00:00:00.000Z",
            reason: "confirmation_resolved",
          },
        }
      : {}),
  } as unknown as AuditRecord;
}

const SEED = "a".repeat(64);
const SAME_SESSION = "b".repeat(64);
const OTHER_SESSION = "c".repeat(64);
const PRED = "d".repeat(64);
const SUCC = "e".repeat(64);

describe("correlateCase — session correlation", () => {
  it("groups exactly the records sharing the seed's session", () => {
    const input: CaseCorrelationInput = {
      records: [
        rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:02Z" }),
        rec({ intentHash: SAME_SESSION, sessionId: "s1", at: "2026-06-19T00:00:01Z" }),
        rec({ intentHash: OTHER_SESSION, sessionId: "s2", at: "2026-06-19T00:00:03Z" }),
      ],
    };
    const c = correlateCase(input, SEED);
    expect(c.seedFound).toBe(true);
    expect(c.sessionId).toBe("s1");
    const hashes = c.members.map((m) => m.record.intentHash);
    // s1 members in — the s2 record is EXCLUDED.
    expect(hashes).toContain(SEED);
    expect(hashes).toContain(SAME_SESSION);
    expect(hashes).not.toContain(OTHER_SESSION);
    expect(c.members).toHaveLength(2);
  });

  it("orders members as a timeline by `at` ascending (deterministic)", () => {
    const input: CaseCorrelationInput = {
      records: [
        rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:05Z" }),
        rec({ intentHash: SAME_SESSION, sessionId: "s1", at: "2026-06-19T00:00:01Z" }),
      ],
    };
    const c = correlateCase(input, SEED);
    expect(c.members.map((m) => m.record.intentHash)).toEqual([
      SAME_SESSION, // earlier `at` comes first
      SEED,
    ]);
  });

  it("tags the seed record with reason 'seed'", () => {
    const input: CaseCorrelationInput = {
      records: [rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:01Z" })],
    };
    const c = correlateCase(input, SEED);
    const seedMember = c.members.find((m) => m.record.intentHash === SEED);
    expect(seedMember?.reason).toBe("seed");
  });
});

describe("correlateCase — supersession lineage", () => {
  it("pulls in a predecessor even when it is in a DIFFERENT session", () => {
    // The seed supersedes PRED, which lives in a different session window. The
    // lineage walk must pull PRED in regardless of session.
    const input: CaseCorrelationInput = {
      records: [
        rec({
          intentHash: SEED,
          sessionId: "s1",
          at: "2026-06-19T00:00:02Z",
          supersedes: PRED,
        }),
        rec({ intentHash: PRED, sessionId: "s2", at: "2026-06-19T00:00:01Z" }),
      ],
    };
    const c = correlateCase(input, SEED);
    const pred = c.members.find((m) => m.record.intentHash === PRED);
    expect(pred).toBeDefined();
    expect(pred?.reason).toBe("lineage_predecessor");
  });

  it("pulls in a successor whose predecessor link reaches the seed", () => {
    // SUCC supersedes the SEED; the forward fixpoint must attach SUCC.
    const input: CaseCorrelationInput = {
      records: [
        rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:01Z" }),
        rec({
          intentHash: SUCC,
          sessionId: "s3",
          at: "2026-06-19T00:00:02Z",
          supersedes: SEED,
        }),
      ],
    };
    const c = correlateCase(input, SEED);
    const succ = c.members.find((m) => m.record.intentHash === SUCC);
    expect(succ).toBeDefined();
    expect(succ?.reason).toBe("lineage_successor");
  });

  it("walks a multi-hop predecessor chain transitively", () => {
    const A = SEED;
    const B = PRED;
    const D = "f".repeat(64);
    const input: CaseCorrelationInput = {
      records: [
        rec({ intentHash: A, sessionId: "s1", at: "2026-06-19T00:00:03Z", supersedes: B }),
        rec({ intentHash: B, sessionId: "s9", at: "2026-06-19T00:00:02Z", supersedes: D }),
        rec({ intentHash: D, sessionId: "s8", at: "2026-06-19T00:00:01Z" }),
      ],
    };
    const c = correlateCase(input, A);
    const hashes = c.members.map((m) => m.record.intentHash);
    expect(hashes).toContain(B);
    expect(hashes).toContain(D); // transitively reached
  });

  it("stops the predecessor walk when the predecessor is out of window", () => {
    const input: CaseCorrelationInput = {
      records: [
        rec({
          intentHash: SEED,
          sessionId: "s1",
          at: "2026-06-19T00:00:01Z",
          supersedes: "9".repeat(64), // not present in window
        }),
      ],
    };
    const c = correlateCase(input, SEED);
    // Only the seed — the out-of-window predecessor is not fabricated.
    expect(c.members).toHaveLength(1);
    expect(c.members[0]!.record.intentHash).toBe(SEED);
  });
});

describe("correlateCase — verification alignment", () => {
  it("carries the index-aligned verification for each member", () => {
    const records = [
      rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:01Z" }),
      rec({ intentHash: SAME_SESSION, sessionId: "s1", at: "2026-06-19T00:00:02Z" }),
    ];
    const verifications: AuditRecordVerification[] = [
      { verified: true },
      { verified: false, reason: "tampered", derived: "x", stored: "y" },
    ];
    const c = correlateCase({ records, verifications }, SEED);
    const seedMember = c.members.find((m) => m.record.intentHash === SEED);
    const otherMember = c.members.find(
      (m) => m.record.intentHash === SAME_SESSION,
    );
    expect(seedMember?.verification).toEqual({ verified: true });
    expect(otherMember?.verification).toEqual({
      verified: false,
      reason: "tampered",
      derived: "x",
      stored: "y",
    });
  });

  it("leaves verification undefined when the store supplies none", () => {
    const c = correlateCase(
      { records: [rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:01Z" })] },
      SEED,
    );
    expect(c.members[0]!.verification).toBeUndefined();
  });
});

describe("correlateCase — seed not found", () => {
  it("returns an empty, not-found case when the seed is outside the window", () => {
    const c = correlateCase(
      { records: [rec({ intentHash: SAME_SESSION, sessionId: "s1", at: "2026-06-19T00:00:01Z" })] },
      SEED,
    );
    expect(c.seedFound).toBe(false);
    expect(c.sessionId).toBeUndefined();
    expect(c.members).toHaveLength(0);
  });

  it("returns an empty case for an empty window", () => {
    const c = correlateCase({ records: [] }, SEED);
    expect(c.seedFound).toBe(false);
    expect(c.members).toHaveLength(0);
  });
});

describe("correlateCase — purity / no mutation", () => {
  it("does not mutate the input records array or its elements", () => {
    const records = [
      rec({ intentHash: SEED, sessionId: "s1", at: "2026-06-19T00:00:01Z" }),
      rec({ intentHash: SAME_SESSION, sessionId: "s1", at: "2026-06-19T00:00:02Z" }),
    ];
    const snapshot = JSON.stringify(records);
    const lenBefore = records.length;
    correlateCase({ records }, SEED);
    expect(records.length).toBe(lenBefore);
    expect(JSON.stringify(records)).toBe(snapshot);
  });

  it("a member references the SAME record object from the input (no copy)", () => {
    const seedRecord = rec({
      intentHash: SEED,
      sessionId: "s1",
      at: "2026-06-19T00:00:01Z",
    });
    const c = correlateCase({ records: [seedRecord] }, SEED);
    expect(c.members[0]!.record).toBe(seedRecord);
  });
});
