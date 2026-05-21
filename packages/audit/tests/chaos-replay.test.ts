/**
 * Chaos tests for replay verification under adverse conditions:
 *
 *   1. Concurrent replay of many records in parallel — no state mutation
 *   2. Corrupted JSON envelope payload — integrity check catches it
 *   3. Truncated audit hash — verifyAuditRecord catches it
 *   4. Mixed pre-v4 and v4 records — both axes still report correctly
 *   5. Adjudicator that throws — propagates (replay is not error-recovery)
 *   6. Adjudicator that returns wildly different decisions per call
 *      (non-determinism) — replay catches the divergence
 *
 * Replay must remain deterministic: same inputs → same report. The
 * chaos in this file is in the INPUTS, not the verifier — the verifier
 * is pure.
 */

import { describe, expect, it } from "vitest";
import {
  type AuditRecord,
  buildAuditRecord,
  buildEnvelope,
  type Decision,
} from "@adjudicate/core";
import { replayWithIntegrity } from "../src/replay-integrity.js";

function buildRecord(opts: {
  nonce: string;
  amount: number;
  decision: Decision;
}): AuditRecord {
  const env = buildEnvelope({
    kind: "chaos.intent",
    payload: { amount: opts.amount },
    actor: { principal: "u", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: opts.nonce,
    createdAt: "2026-05-20T00:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: opts.decision,
    durationMs: 1,
    at: "2026-05-20T00:00:01.000Z",
  });
}

function exec(): Decision {
  return {
    kind: "EXECUTE",
    basis: [{ category: "state", code: "transition_valid" }],
  };
}

describe("chaos: replay verification under adverse inputs", () => {
  it("concurrent replay of 1000 records — deterministic, no state leak", async () => {
    const records: AuditRecord[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push(buildRecord({ nonce: `n-${i}`, amount: i, decision: exec() }));
    }
    // Run 5 replay passes in parallel.
    const reports = await Promise.all([
      Promise.resolve(replayWithIntegrity(records, exec)),
      Promise.resolve(replayWithIntegrity(records, exec)),
      Promise.resolve(replayWithIntegrity(records, exec)),
      Promise.resolve(replayWithIntegrity(records, exec)),
      Promise.resolve(replayWithIntegrity(records, exec)),
    ]);
    for (const r of reports) {
      expect(r.total).toBe(1000);
      expect(r.matched).toBe(1000);
    }
    // All reports must be byte-identical.
    const stringified = reports.map((r) => JSON.stringify(r));
    expect(new Set(stringified).size).toBe(1);
  });

  it("corrupted envelope payload is caught by INTENT_HASH_MISMATCH", () => {
    const record = buildRecord({
      nonce: "n-a",
      amount: 100,
      decision: exec(),
    });
    const corrupted: AuditRecord = {
      ...record,
      envelope: { ...record.envelope, payload: { amount: 999 } },
    };
    const report = replayWithIntegrity([corrupted], exec);
    expect(
      report.integrityFailures.some((f) => f.kind === "INTENT_HASH_MISMATCH"),
    ).toBe(true);
  });

  it("truncated/scrambled auditHash is caught by AUDIT_HASH_TAMPERED", () => {
    const record = buildRecord({
      nonce: "n-a",
      amount: 100,
      decision: exec(),
    });
    // Replace one nibble in the auditHash to simulate corruption.
    const scrambled = record.auditHash!.slice(0, -1) + (record.auditHash!.endsWith("0") ? "1" : "0");
    const corrupted: AuditRecord = { ...record, auditHash: scrambled };
    const report = replayWithIntegrity([corrupted], exec);
    expect(
      report.integrityFailures.some((f) => f.kind === "AUDIT_HASH_TAMPERED"),
    ).toBe(true);
  });

  it("mixed v4 and pre-v4 records report cleanly side-by-side", () => {
    const v4Record = buildRecord({
      nonce: "n-v4",
      amount: 100,
      decision: exec(),
    });
    const v4ClonePreV4 = buildRecord({
      nonce: "n-prev4",
      amount: 200,
      decision: exec(),
    });
    const { auditHash: _strip, ...legacy } = v4ClonePreV4;

    const report = replayWithIntegrity(
      [v4Record, legacy as AuditRecord],
      exec,
    );
    expect(report.total).toBe(2);
    expect(report.preV4Records).toBe(1);
    expect(report.integrityFailures).toHaveLength(0);
    expect(report.matched).toBe(2);
  });

  it("adjudicator that throws propagates (replay is not error-recovery)", () => {
    const record = buildRecord({
      nonce: "n-1",
      amount: 100,
      decision: exec(),
    });
    expect(() =>
      replayWithIntegrity([record], () => {
        throw new Error("adjudicator failed");
      }),
    ).toThrow("adjudicator failed");
  });

  it("non-deterministic adjudicator is detected as a series of mismatches", () => {
    const records = [
      buildRecord({ nonce: "n-1", amount: 100, decision: exec() }),
      buildRecord({ nonce: "n-2", amount: 200, decision: exec() }),
      buildRecord({ nonce: "n-3", amount: 300, decision: exec() }),
    ];
    let i = 0;
    const flakyAdjudicator = (): Decision => {
      i++;
      if (i === 2) {
        return {
          kind: "REFUSE",
          basis: [{ category: "state", code: "transition_illegal" }],
          refusal: { code: "x.flaky", scope: "USER" },
        };
      }
      return exec();
    };
    const report = replayWithIntegrity(records, flakyAdjudicator);
    expect(report.matched).toBe(2);
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]!.kind).toBe("DECISION_KIND");
  });

  it("100 corrupted records do not crash the verifier — all surface as failures", () => {
    const records: AuditRecord[] = [];
    for (let i = 0; i < 100; i++) {
      const r = buildRecord({ nonce: `n-${i}`, amount: i, decision: exec() });
      records.push({
        ...r,
        envelope: { ...r.envelope, payload: { amount: -1 } }, // corrupt
      });
    }
    const report = replayWithIntegrity(records, exec);
    expect(report.integrityFailures.length).toBeGreaterThanOrEqual(100);
    expect(report.matched).toBe(0);
  });
});
