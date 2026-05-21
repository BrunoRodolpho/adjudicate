import { describe, expect, it } from "vitest";
import { buildEnvelope, buildAuditRecord, decisionExecute, decisionRefuse, refuse } from "@adjudicate/core";
import {
  SEMCONV,
  createInMemoryExporter,
  createOtlpAuditSpanExporter,
  createOtlpLearningSink,
  createOtlpMetricsSink,
  noopExporter,
} from "../src/index.js";

const at = "2026-05-18T00:00:00.000Z";

describe("createInMemoryExporter", () => {
  it("captures every exported event in order", () => {
    const { exporter, events } = createInMemoryExporter();
    exporter.export({
      kind: "metrics.decision",
      name: "x",
      at,
      attributes: { foo: "bar" },
    });
    exporter.export({
      kind: "audit.span",
      name: "y",
      at,
      attributes: {},
    });
    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("metrics.decision");
    expect(events[1]!.kind).toBe("audit.span");
  });
});

describe("noopExporter", () => {
  it("never throws and never records", () => {
    const exporter = noopExporter();
    expect(() => exporter.export({ kind: "metrics.decision", name: "z", at, attributes: {} })).not.toThrow();
  });
});

describe("createOtlpMetricsSink", () => {
  it("emits a decision event with semconv attributes", () => {
    const { exporter, events } = createInMemoryExporter();
    const sink = createOtlpMetricsSink({
      exporter,
      clockIso: () => at,
      packId: "pack-payments-pix",
      policyVersion: "0.4.0",
    });

    sink.recordDecision({
      intentKind: "pix.charge.refund",
      decision: "EXECUTE",
      latencyMs: 12,
      basisCount: 1,
      intentHash: "h0".repeat(32),
    });

    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.kind).toBe("metrics.decision");
    expect(e.name).toBe("adjudicate.decision");
    expect(e.attributes[SEMCONV.INTENT_KIND]).toBe("pix.charge.refund");
    expect(e.attributes[SEMCONV.DECISION_KIND]).toBe("EXECUTE");
    expect(e.attributes[SEMCONV.LATENCY_MS]).toBe(12);
    expect(e.attributes[SEMCONV.INTENT_HASH]).toBe("h0".repeat(32));
    expect(e.attributes[SEMCONV.PACK_ID]).toBe("pack-payments-pix");
    expect(e.attributes[SEMCONV.POLICY_VERSION]).toBe("0.4.0");
  });

  it("emits a refusal event with refusal kind + code", () => {
    const { exporter, events } = createInMemoryExporter();
    const sink = createOtlpMetricsSink({ exporter, clockIso: () => at });

    sink.recordRefusal({
      intentKind: "vacation.request",
      refusal: refuse("BUSINESS_RULE", "pto.insufficient_balance", "no balance"),
      intentHash: "h",
    });

    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.kind).toBe("metrics.refusal");
    expect(e.attributes["adjudicate.refusal.kind"]).toBe("BUSINESS_RULE");
    expect(e.attributes["adjudicate.refusal.code"]).toBe("pto.insufficient_balance");
  });

  it("emits ledger op + sink failure + shadow divergence + resource limit", () => {
    const { exporter, events } = createInMemoryExporter();
    const sink = createOtlpMetricsSink({ exporter, clockIso: () => at });

    sink.recordLedgerOp({ op: "check", outcome: "hit", intentKind: "k", latencyMs: 1 });
    sink.recordSinkFailure({ sink: "nats", subject: "subj", errorClass: "Err", consecutiveFailures: 2 });
    sink.recordShadowDivergence({
      intentKind: "k",
      divergence: "DECISION_KIND",
      legacy: { kind: "EXECUTE" },
      adjudicate: decisionRefuse(refuse("BUSINESS_RULE", "x", "y")),
    });
    sink.recordResourceLimit?.({ resource: "defer_quota", subject: "s", limit: 10, observed: 11 });

    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual([
      "metrics.ledger",
      "metrics.sink_failure",
      "metrics.shadow_divergence",
      "metrics.resource_limit",
    ]);
  });

  it("swallows exporter failures so the kernel is never affected", () => {
    const throwing = {
      export() {
        throw new Error("network unreachable");
      },
    };
    const sink = createOtlpMetricsSink({ exporter: throwing });
    expect(() =>
      sink.recordDecision({
        intentKind: "k",
        decision: "EXECUTE",
        latencyMs: 0,
        basisCount: 0,
        intentHash: "h",
      }),
    ).not.toThrow();
  });
});

describe("createOtlpLearningSink", () => {
  it("emits a learning.outcome event with semconv attributes + full body", () => {
    const { exporter, events } = createInMemoryExporter();
    const sink = createOtlpLearningSink({ exporter, packId: "p", policyVersion: "v" });

    const event = {
      intentKind: "vacation.approve",
      decisionKind: "EXECUTE" as const,
      basisCodes: ["BUSINESS_RULE:pto.ok"],
      taint: "TRUSTED" as const,
      durationMs: 7,
      intentHash: "h",
      guardId: "noSelfApproval",
      guardName: "noSelfApproval",
      guardPhase: "auth" as const,
      planFingerprint: "pf",
      at,
    };
    sink.recordOutcome(event);

    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.kind).toBe("learning.outcome");
    expect(e.attributes[SEMCONV.INTENT_KIND]).toBe("vacation.approve");
    expect(e.attributes[SEMCONV.GUARD_ID]).toBe("noSelfApproval");
    expect(e.attributes[SEMCONV.PACK_ID]).toBe("p");
    expect(e.attributes[SEMCONV.POLICY_VERSION]).toBe("v");
    expect(e.body).toEqual(event);
  });
});

describe("createOtlpAuditSpanExporter", () => {
  it("emits one audit.span per record and forwards to the inner sink", async () => {
    const { exporter, events } = createInMemoryExporter();
    const innerEmits: string[] = [];
    const inner = {
      async emit(record: { intentHash: string }) {
        innerEmits.push(record.intentHash);
      },
    };

    const wrapped = createOtlpAuditSpanExporter({ inner, exporter, packId: "p" });

    const envelope = buildEnvelope({
      kind: "vacation.request",
      payload: { durationDays: 3 },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-1",
      createdAt: at,
    });
    const record = buildAuditRecord({
      envelope,
      decision: decisionExecute([]),
      durationMs: 4,
      at,
    });

    await wrapped.emit(record);

    expect(innerEmits).toEqual([record.intentHash]);
    expect(events).toHaveLength(1);
    const span = events[0]!;
    expect(span.kind).toBe("audit.span");
    expect(span.name).toBe("adjudicate.audit.vacation.request");
    expect(span.attributes[SEMCONV.INTENT_KIND]).toBe("vacation.request");
    expect(span.attributes[SEMCONV.DECISION_KIND]).toBe("EXECUTE");
    expect(span.attributes[SEMCONV.INTENT_HASH]).toBe(record.intentHash);
    expect(span.attributes[SEMCONV.PACK_ID]).toBe("p");
    expect(span.body).toEqual(record);
  });

  it("still forwards to the inner sink when the exporter throws", async () => {
    const throwing = {
      export() {
        throw new Error("collector down");
      },
    };
    const innerEmits: number[] = [];
    const inner = {
      async emit() {
        innerEmits.push(1);
      },
    };

    const wrapped = createOtlpAuditSpanExporter({ inner, exporter: throwing });
    const envelope = buildEnvelope({
      kind: "k",
      payload: {},
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n",
      createdAt: at,
    });
    const record = buildAuditRecord({
      envelope,
      decision: decisionExecute([]),
      durationMs: 0,
      at,
    });

    await expect(wrapped.emit(record)).resolves.toBeUndefined();
    expect(innerEmits).toEqual([1]);
  });
});
