import { describe, expect, it, vi } from "vitest";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  basis,
  BASIS_CODES,
} from "@adjudicate/core";
import { createConsoleSink } from "../src/sink-console.js";
import { createNatsSink, type NatsPublisher } from "../src/sink-nats.js";
import { AuditSinkError, multiSink, multiSinkLossy } from "../src/sink.js";
import {
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "@adjudicate/core/kernel";
import { afterEach } from "vitest";

function record() {
  const env = buildEnvelope({
    kind: "order.tool.propose",
    payload: { toolName: "add_item" },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
    ]),
    durationMs: 5,
    resourceVersion: "v1",
    at: "2026-04-23T12:00:01.000Z",
  });
}

describe("ConsoleSink", () => {
  it("emits a single line JSON payload", async () => {
    const log = vi.fn();
    const sink = createConsoleSink({ log });
    await sink.emit(record());
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0] as string;
    expect(line.startsWith("[ibx-audit] ")).toBe(true);
    const payload = JSON.parse(line.slice("[ibx-audit] ".length)) as Record<string, unknown>;
    expect(payload.intentKind).toBe("order.tool.propose");
    expect(payload.decision).toBe("EXECUTE");
    expect(payload.basis).toEqual(["state:transition_valid", "auth:scope_sufficient"]);
  });

  it("honors custom prefix", async () => {
    const log = vi.fn();
    const sink = createConsoleSink({ prefix: "[TEST]", log });
    await sink.emit(record());
    expect((log.mock.calls[0]![0] as string).startsWith("[TEST] ")).toBe(true);
  });
});

describe("NatsSink", () => {
  it("publishes to the configured subject", async () => {
    const publish = vi.fn(async () => {});
    const publisher: NatsPublisher = { publish };
    const sink = createNatsSink({ publisher });
    await sink.emit(record());
    expect(publish).toHaveBeenCalledWith(
      "audit.intent.decision.v1",
      expect.objectContaining({ intentHash: expect.any(String) }),
    );
  });

  it("accepts a custom subject", async () => {
    const publish = vi.fn(async () => {});
    const publisher: NatsPublisher = { publish };
    const sink = createNatsSink({ publisher, subject: "x.y.v2" });
    await sink.emit(record());
    expect(publish).toHaveBeenCalledWith("x.y.v2", expect.anything());
  });
});

describe("multiSink (T3 default = strict)", () => {
  afterEach(() => {
    _resetMetricsSink();
  });

  it("fans out to all sinks", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const sink = multiSink({ emit: a }, { emit: b });
    await sink.emit(record());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("THROWS AuditSinkError when one sink rejects (post-T3 flip)", async () => {
    const good = vi.fn(async () => {});
    const bad = vi.fn(async () => {
      throw new Error("nats down");
    });
    const sink = multiSink({ emit: good }, { emit: bad });
    await expect(sink.emit(record())).rejects.toThrow(AuditSinkError);
    expect(good).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1); // both still attempted
  });

  it("calls recordSinkFailure for each rejection (sink-of-sinks observability)", async () => {
    const failures: SinkFailureEvent[] = [];
    const metrics: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push(e);
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    setMetricsSink(metrics);
    const sink = multiSink(
      { emit: vi.fn(async () => {}) },
      {
        emit: vi.fn(async () => {
          throw new Error("nats down");
        }),
      },
    );
    await expect(sink.emit(record())).rejects.toThrow(AuditSinkError);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.subject).toBe("multiSink[1]");
    expect(failures[0]!.errorClass).toBe("Error");
  });
});

describe("multiSinkLossy (explicit fail-open)", () => {
  afterEach(() => {
    _resetMetricsSink();
  });

  it("does NOT throw when one sink rejects (pre-T3 multiSink behaviour)", async () => {
    const good = vi.fn(async () => {});
    const bad = vi.fn(async () => {
      throw new Error("nats down");
    });
    const sink = multiSinkLossy({ emit: good }, { emit: bad });
    await expect(sink.emit(record())).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("still records sink failures via recordSinkFailure for observability", async () => {
    const failures: SinkFailureEvent[] = [];
    const metrics: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push(e);
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    setMetricsSink(metrics);
    const sink = multiSinkLossy({
      emit: vi.fn(async () => {
        throw new Error("nats down");
      }),
    });
    await sink.emit(record());
    expect(failures).toHaveLength(1);
    expect(failures[0]!.subject).toBe("multiSinkLossy[0]");
  });
});
