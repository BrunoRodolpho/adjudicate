import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  _resetMetricsSink,
  createConsoleMetricsSink,
  recordDecision,
  recordLedgerOp,
  recordRefusal,
  recordSinkFailure,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "../../src/kernel/metrics.js"
import { RetrospectiveOutcomeWireSchema } from "../../src/kernel/outcomes.js"
import {
  _resetShadowTelemetrySink,
  adjudicateWithShadow,
  type LegacyDecisionResult,
} from "../../src/kernel/shadow.js"
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionRefuse,
  refuse,
} from "@adjudicate/core"
import type { PolicyBundle } from "@adjudicate/core/kernel"

describe("intent-metrics — sink dispatch", () => {
  let sink: MetricsSink
  let calls: Array<{ method: string; args: unknown[] }>

  beforeEach(() => {
    calls = []
    sink = {
      recordLedgerOp: (...args) =>
        calls.push({ method: "recordLedgerOp", args }),
      recordDecision: (...args) =>
        calls.push({ method: "recordDecision", args }),
      recordRefusal: (...args) =>
        calls.push({ method: "recordRefusal", args }),
      recordSinkFailure: (...args) =>
        calls.push({ method: "recordSinkFailure", args }),
      recordShadowDivergence: (...args) =>
        calls.push({ method: "recordShadowDivergence", args }),
    }
    setMetricsSink(sink)
  })

  afterEach(() => {
    _resetMetricsSink()
    _resetShadowTelemetrySink()
  })

  it("recordLedgerOp routes to sink", () => {
    recordLedgerOp({
      op: "check",
      outcome: "hit",
      intentKind: "order.submit",
      latencyMs: 3,
      intentHash: "h",
    })
    expect(calls).toEqual([
      { method: "recordLedgerOp", args: [{ op: "check", outcome: "hit", intentKind: "order.submit", latencyMs: 3, intentHash: "h" }] },
    ])
  })

  it("recordDecision routes to sink", () => {
    recordDecision({
      intentKind: "order.submit",
      decision: "EXECUTE",
      latencyMs: 1,
      basisCount: 5,
      intentHash: "h",
    })
    expect(calls[0]!.method).toBe("recordDecision")
  })

  it("recordRefusal routes to sink", () => {
    recordRefusal({
      intentKind: "payment.send",
      refusal: { kind: "SECURITY", code: "x", userFacing: "y" },
      intentHash: "h",
    })
    expect(calls[0]!.method).toBe("recordRefusal")
  })

  it("recordSinkFailure routes to sink", () => {
    recordSinkFailure({
      sink: "nats",
      subject: "audit.intent.decision.v1",
      errorClass: "NatsTimeoutError",
      consecutiveFailures: 3,
    })
    expect(calls[0]!.method).toBe("recordSinkFailure")
  })

  it("setMetricsSink also wires shadow telemetry through the same sink", () => {
    // Triggering a shadow divergence should land on recordShadowDivergence
    const policy: PolicyBundle<string, unknown, unknown> = {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "SYSTEM" },
      business: [],
      default: "EXECUTE",
    }
    const env = buildEnvelope({
      kind: "payment.send",
      payload: {},
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED", // forces taint refusal
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    })
    adjudicateWithShadow({
      envelope: env,
      state: {},
      policy,
      legacy: () => true, // legacy EXECUTE diverges from kernel REFUSE → DECISION_KIND
    })
    const divergence = calls.find((c) => c.method === "recordShadowDivergence")
    expect(divergence).toBeDefined()
    const event = (divergence!.args[0] as { divergence: string; intentKind: string })
    expect(event.divergence).toBe("DECISION_KIND")
    expect(event.intentKind).toBe("payment.send")
  })
})

describe("createConsoleMetricsSink", () => {
  it("emits ledger ops via console.log", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const sink = createConsoleMetricsSink()
    sink.recordLedgerOp({
      op: "check",
      outcome: "hit",
      intentKind: "x",
      latencyMs: 1,
      intentHash: "h",
    })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it("emits refusals via console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const sink = createConsoleMetricsSink()
    sink.recordRefusal({
      intentKind: "x",
      refusal: { kind: "SECURITY", code: "y", userFacing: "z" },
      intentHash: "abc12345abc12345",
    })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("emits sink failures via console.error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const sink = createConsoleMetricsSink()
    sink.recordSinkFailure({
      sink: "nats",
      subject: "x",
      errorClass: "y",
      consecutiveFailures: 1,
    })
    expect(err).toHaveBeenCalledOnce()
    err.mockRestore()
  })

  it("BASIS_ONLY shadow divergence uses console.log (metric only, not page-worthy)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const sink = createConsoleMetricsSink()
    sink.recordShadowDivergence({
      intentKind: "x",
      divergence: "BASIS_ONLY",
      legacy: { kind: "EXECUTE" } as LegacyDecisionResult,
      adjudicate: { kind: "EXECUTE", basis: [basis("state", BASIS_CODES.state.TRANSITION_VALID)] },
    })
    expect(log).toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    log.mockRestore()
    warn.mockRestore()
  })

  it("DECISION_KIND shadow divergence uses console.warn (page-worthy)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const sink = createConsoleMetricsSink()
    sink.recordShadowDivergence({
      intentKind: "x",
      divergence: "DECISION_KIND",
      legacy: { kind: "EXECUTE" } as LegacyDecisionResult,
      adjudicate: decisionRefuse(refuse("STATE", "x", "y"), []),
    })
    expect(warn).toHaveBeenCalled()
    log.mockRestore()
    warn.mockRestore()
  })
})

describe("SinkFailureEvent.sink union — APIReviewer-015", () => {
  it("accepts well-known sink labels: console, nats, postgres, multi, buffered", () => {
    const labels: SinkFailureEvent["sink"][] = [
      "console",
      "nats",
      "postgres",
      "multi",
      "buffered",
    ]
    for (const sink of labels) {
      const event: SinkFailureEvent = {
        sink,
        subject: "test",
        errorClass: "test_error",
        consecutiveFailures: 1,
      }
      // Structural assertion: object should typecheck and carry the expected sink label.
      expect(event.sink).toBe(sink)
    }
  })

  it("accepts arbitrary string labels (forward-compatible open union)", () => {
    const event: SinkFailureEvent = {
      sink: "custom-sink-v2",
      subject: "x",
      errorClass: "y",
      consecutiveFailures: 0,
    }
    expect(event.sink).toBe("custom-sink-v2")
  })
})

describe("RetrospectiveOutcomeWireSchema — APIReviewer-011", () => {
  it("parses a valid outcome without note", () => {
    const result = RetrospectiveOutcomeWireSchema.safeParse({
      intentHash: "abc123",
      observed: "succeeded",
      at: "2026-05-30T00:00:00.000Z",
    })
    expect(result.success).toBe(true)
  })

  it("parses a valid outcome with a note within 2000 chars", () => {
    const result = RetrospectiveOutcomeWireSchema.safeParse({
      intentHash: "abc123",
      observed: "failed",
      at: "2026-05-30T00:00:00.000Z",
      note: "operator note here",
    })
    expect(result.success).toBe(true)
  })

  it("rejects note longer than 2000 characters (APIReviewer-011 cap)", () => {
    const result = RetrospectiveOutcomeWireSchema.safeParse({
      intentHash: "abc123",
      observed: "withdrawn",
      at: "2026-05-30T00:00:00.000Z",
      note: "x".repeat(2001),
    })
    expect(result.success).toBe(false)
  })

  it("accepts note at exactly 2000 characters (boundary)", () => {
    const result = RetrospectiveOutcomeWireSchema.safeParse({
      intentHash: "abc123",
      observed: "succeeded",
      at: "2026-05-30T00:00:00.000Z",
      note: "x".repeat(2000),
    })
    expect(result.success).toBe(true)
  })

  it("rejects unrecognized observed values", () => {
    const result = RetrospectiveOutcomeWireSchema.safeParse({
      intentHash: "abc123",
      observed: "cancelled",
      at: "2026-05-30T00:00:00.000Z",
    })
    expect(result.success).toBe(false)
  })
})
