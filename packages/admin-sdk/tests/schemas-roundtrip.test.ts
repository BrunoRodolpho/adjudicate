import { describe, expect, it } from "vitest";
import { AuditRecordSchema } from "../src/schemas/audit.js";
import { DecisionSchema } from "../src/schemas/decision.js";
import { IsoTimestampSchema } from "../src/schemas/common.js";
import { OutcomeDistributionQuerySchema } from "../src/schemas/outcome-distribution.js";
import { ALL } from "./fixtures.js";

/**
 * Roundtrip — every kernel-emitted Decision kind must parse cleanly
 * through the Zod schemas. If a 7th Decision kind is added to core
 * without updating the SDK, this test fails by name (`Decision.kind: "FORWARD"
 * — unknown discriminator value`).
 *
 * Runs as part of `pnpm -r test` so a kernel change that breaks the SDK
 * fails the workspace build.
 */

describe("AuditRecordSchema accepts every kernel-emitted fixture", () => {
  for (const record of ALL) {
    it(`${record.envelope.kind} → ${record.decision.kind} parses`, () => {
      const result = AuditRecordSchema.safeParse(record);
      if (!result.success) {
        // Surface Zod errors verbatim so the failure is actionable.
        throw new Error(
          `Schema rejected fixture: ${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
      expect(result.success).toBe(true);
    });
  }
});

describe("IsoTimestampSchema — unified wire timestamp validation (APIReviewer-004/-010)", () => {
  it("accepts canonical ISO-8601", () => {
    expect(IsoTimestampSchema.safeParse("2026-04-28T20:00:00.000Z").success).toBe(true);
  });
  it("rejects non-ISO strings the old z.string().min(1) let through", () => {
    expect(IsoTimestampSchema.safeParse("yesterday").success).toBe(false);
    expect(IsoTimestampSchema.safeParse("").success).toBe(false);
    expect(IsoTimestampSchema.safeParse("2024-13-01").success).toBe(false);
  });
  it("tightens query inputs: OutcomeDistributionQuery rejects a non-ISO since", () => {
    expect(
      OutcomeDistributionQuerySchema.safeParse({ since: "yesterday", bucket: "day" }).success,
    ).toBe(false);
    expect(
      OutcomeDistributionQuerySchema.safeParse({
        since: "2026-04-28T20:00:00.000Z",
        bucket: "day",
      }).success,
    ).toBe(true);
  });
  it("tightens AuditRecord.at: a non-ISO at is rejected at the wire", () => {
    const good = ALL[0];
    expect(AuditRecordSchema.safeParse(good).success).toBe(true);
    const bad = { ...good, at: "not-a-date" };
    expect(AuditRecordSchema.safeParse(bad).success).toBe(false);
  });
});

describe("DecisionSchema discriminator validation", () => {
  it("rejects unknown decision kind", () => {
    const bad = { kind: "ALLOW", basis: [] };
    const result = DecisionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects REFUSE without refusal field", () => {
    const bad = { kind: "REFUSE", basis: [] };
    const result = DecisionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects DEFER without signal", () => {
    const bad = { kind: "DEFER", timeoutMs: 100, basis: [] };
    const result = DecisionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects ESCALATE with bad `to` value", () => {
    const bad = {
      kind: "ESCALATE",
      to: "manager",
      reason: "x",
      basis: [],
    };
    const result = DecisionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects REWRITE without rewritten envelope", () => {
    const bad = { kind: "REWRITE", reason: "x", basis: [] };
    const result = DecisionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("AuditRecordSchema field-level validation", () => {
  it("rejects unknown taint", () => {
    const base = ALL[0]!;
    const bad = {
      ...base,
      envelope: { ...base.envelope, taint: "PARTIAL" },
    };
    const result = AuditRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown actor.principal", () => {
    const base = ALL[0]!;
    const bad = {
      ...base,
      envelope: {
        ...base.envelope,
        actor: { principal: "robot", sessionId: "s-1" },
      },
    };
    const result = AuditRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects bad envelope version", () => {
    const base = ALL[0]!;
    const bad = { ...base, envelope: { ...base.envelope, version: 99 } };
    const result = AuditRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
