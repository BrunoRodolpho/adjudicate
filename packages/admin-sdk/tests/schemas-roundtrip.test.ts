import { describe, expect, it } from "vitest";
import { AuditRecordSchema } from "../src/schemas/audit.js";
import { DecisionSchema } from "../src/schemas/decision.js";
import { IntentHashSchema, IsoTimestampSchema } from "../src/schemas/common.js";
import { OutcomeDistributionQuerySchema } from "../src/schemas/outcome-distribution.js";
import { AuditQuerySchema } from "../src/schemas/query.js";
import { RetrospectiveOutcomeSchema } from "../src/schemas/outcome-reconciliation.js";
import { ALL } from "./fixtures.js";

const VALID_HASH = "a".repeat(64);

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

describe("IntentHashSchema — sha256 hex enforcement (APIReviewer-013)", () => {
  it("accepts a 64-char lowercase hex string", () => {
    expect(IntentHashSchema.safeParse(VALID_HASH).success).toBe(true);
    // A real kernel-emitted hash from the fixtures must pass.
    expect(IntentHashSchema.safeParse(ALL[0]!.intentHash).success).toBe(true);
  });

  it("rejects empty, truncated, uppercase, and non-hex", () => {
    expect(IntentHashSchema.safeParse("").success).toBe(false);
    expect(IntentHashSchema.safeParse("not-a-hash").success).toBe(false);
    expect(IntentHashSchema.safeParse("abc123").success).toBe(false); // too short
    expect(IntentHashSchema.safeParse("A".repeat(64)).success).toBe(false); // uppercase
    expect(IntentHashSchema.safeParse("g".repeat(64)).success).toBe(false); // non-hex char
    expect(IntentHashSchema.safeParse("a".repeat(65)).success).toBe(false); // too long
  });

  it("AuditQuery.intentHash: empty / non-hex are wire errors, not empty results", () => {
    expect(() => AuditQuerySchema.parse({ intentHash: "", limit: 10 })).toThrow();
    expect(() =>
      AuditQuerySchema.parse({ intentHash: "not-a-hash", limit: 10 }),
    ).toThrow();
    expect(
      AuditQuerySchema.safeParse({ intentHash: VALID_HASH, limit: 10 }).success,
    ).toBe(true);
    // intentHash is optional — omitting it still parses.
    expect(AuditQuerySchema.safeParse({ limit: 10 }).success).toBe(true);
  });
});

describe("RetrospectiveOutcomeSchema — note length cap (APIReviewer-011)", () => {
  it("rejects a note longer than 2000 chars", () => {
    expect(() =>
      RetrospectiveOutcomeSchema.parse({
        intentHash: VALID_HASH,
        observed: "succeeded",
        at: "2026-01-01T00:00:00.000Z",
        note: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("accepts a note at exactly the 2000-char cap and an absent note", () => {
    expect(
      RetrospectiveOutcomeSchema.safeParse({
        intentHash: VALID_HASH,
        observed: "succeeded",
        at: "2026-01-01T00:00:00.000Z",
        note: "x".repeat(2000),
      }).success,
    ).toBe(true);
    expect(
      RetrospectiveOutcomeSchema.safeParse({
        intentHash: VALID_HASH,
        observed: "failed",
        at: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-hex intentHash (APIReviewer-013, same file)", () => {
    expect(() =>
      RetrospectiveOutcomeSchema.parse({
        intentHash: "not-a-hash",
        observed: "succeeded",
        at: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
