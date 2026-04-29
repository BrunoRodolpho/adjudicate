import { describe, expect, it } from "vitest";
import { AuditRecordSchema } from "../src/schemas/audit.js";
import { DecisionSchema } from "../src/schemas/decision.js";
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
