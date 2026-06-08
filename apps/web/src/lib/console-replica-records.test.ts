import { describe, expect, it } from "vitest";
import { verifyAuditRecord, type DecisionKind } from "@adjudicate/core";
import {
  CONSOLE_REPLICA_RECORDS,
  CONSOLE_REPLICA_RECORDS_BY_HASH,
  DEPLOYMENT_ROLLBACK_PARKED_HASH,
  DEPLOYMENT_ROLLBACK_RESUMED_HASH,
} from "./console-replica-records";
import { CONSOLE_REPLICA_TAIL } from "./console-replica-tail-script";

/**
 * Pins the illustrative /console replica fixture: every record is a well-formed,
 * tamper-verifiable AuditRecord; all six Decision kinds are represented; and the
 * supersession + hallucination records the panels depend on are present. Also
 * guards the no-leak invariant (no raw command text) and the tail script's
 * referential integrity.
 */

const ALL_DECISION_KINDS: readonly DecisionKind[] = [
  "EXECUTE",
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
];

describe("CONSOLE_REPLICA_RECORDS", () => {
  it("every record has a valid intentHash, version, and decision.kind", () => {
    expect(CONSOLE_REPLICA_RECORDS.length).toBeGreaterThan(0);
    for (const r of CONSOLE_REPLICA_RECORDS) {
      expect(typeof r.intentHash).toBe("string");
      expect(r.intentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.version).toBe(5);
      expect(ALL_DECISION_KINDS).toContain(r.decision.kind);
      // envelope.intentHash and record.intentHash agree.
      expect(r.envelope.intentHash).toBe(r.intentHash);
    }
  });

  it("is tamper-verifiable (auditHash + envelope self-consistency intact)", () => {
    for (const r of CONSOLE_REPLICA_RECORDS) {
      expect(verifyAuditRecord(r).verified, r.intentHash).toBe(true);
    }
  });

  it("represents all six Decision outcomes", () => {
    const kinds = new Set(CONSOLE_REPLICA_RECORDS.map((r) => r.decision.kind));
    for (const k of ALL_DECISION_KINDS) {
      expect(kinds, `missing decision kind ${k}`).toContain(k);
    }
  });

  it("includes both a grounded and a hallucinated scored record", () => {
    const scored = CONSOLE_REPLICA_RECORDS.filter(
      (r) =>
        typeof (r as { metadata?: Record<string, unknown> }).metadata
          ?.hallucination_score === "number",
    );
    const buckets = scored.map(
      (r) =>
        (r as { metadata?: Record<string, unknown> }).metadata!
          .hallucination_bucket,
    );
    expect(buckets).toContain("grounded");
    expect(buckets).toContain("hallucinated");
  });

  it("includes the supersession-chain record back-linking to the parked predecessor", () => {
    const resumed = CONSOLE_REPLICA_RECORDS_BY_HASH.get(
      DEPLOYMENT_ROLLBACK_RESUMED_HASH,
    );
    expect(resumed).toBeDefined();
    expect(resumed!.supersedes).toBeDefined();
    expect(resumed!.supersedes!.reason).toBe("confirmation_resolved");
    expect(resumed!.supersedes!.predecessorIntentHash).toBe(
      DEPLOYMENT_ROLLBACK_PARKED_HASH,
    );
    expect(DEPLOYMENT_ROLLBACK_PARKED_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it("byHash map matches the ordered feed exactly and has unique keys", () => {
    expect(CONSOLE_REPLICA_RECORDS_BY_HASH.size).toBe(
      CONSOLE_REPLICA_RECORDS.length,
    );
    for (const r of CONSOLE_REPLICA_RECORDS) {
      expect(CONSOLE_REPLICA_RECORDS_BY_HASH.get(r.intentHash)).toBe(r);
    }
  });

  it("is ordered newest-first by `at`", () => {
    for (let i = 1; i < CONSOLE_REPLICA_RECORDS.length; i += 1) {
      const prev = CONSOLE_REPLICA_RECORDS[i - 1]!;
      const curr = CONSOLE_REPLICA_RECORDS[i]!;
      expect(prev.at >= curr.at).toBe(true);
    }
  });

  it("never carries raw command text in shell.exec records (no-leak invariant)", () => {
    for (const r of CONSOLE_REPLICA_RECORDS) {
      if (r.envelope.kind !== "shell.exec") continue;
      const command = (r.envelope.payload as { command?: string }).command;
      expect(command).toMatch(/^\[(redacted|sanitized) command\]$/);
      // basis detail carries only the closed-enum category, never a command.
      for (const b of r.decision.basis) {
        expect(b.detail?.command).toBeUndefined();
      }
    }
  });
});

describe("CONSOLE_REPLICA_TAIL", () => {
  it("references only intentHashes present in the feed, covering every record once", () => {
    const feedHashes = new Set(CONSOLE_REPLICA_RECORDS.map((r) => r.intentHash));
    const tailHashes = CONSOLE_REPLICA_TAIL.map((s) => s.intentHash);
    expect(tailHashes.length).toBe(CONSOLE_REPLICA_RECORDS.length);
    expect(new Set(tailHashes).size).toBe(tailHashes.length); // no dupes
    for (const hash of tailHashes) {
      expect(feedHashes.has(hash), hash).toBe(true);
    }
  });

  it("has a non-negative inter-arrival gap on every step", () => {
    for (const step of CONSOLE_REPLICA_TAIL) {
      expect(step.afterMs).toBeGreaterThanOrEqual(0);
    }
  });
});
