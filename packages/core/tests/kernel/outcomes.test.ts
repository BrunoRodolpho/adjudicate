/**
 * recordRetrospectiveOutcome — outcome-sink failure handling.
 *
 * ConcurrencyReviewer-008: a rejecting/throwing outcome sink must NOT
 * propagate to the caller. The helper swallows the failure and routes it to
 * `recordSinkFailure` telemetry (mirrors the learning-sink / guard-stats
 * best-effort pattern: "telemetry must never block the kernel").
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  _resetOutcomeSink,
  recordRetrospectiveOutcome,
  setOutcomeSink,
  type RetrospectiveOutcome,
} from "../../src/kernel/outcomes.js";
import {
  _resetMetricsSink,
  setMetricsSink,
} from "../../src/kernel/metrics.js";

function outcome(
  overrides: Partial<RetrospectiveOutcome> = {},
): RetrospectiveOutcome {
  return {
    intentHash: "a".repeat(64),
    observed: "succeeded",
    at: "2026-05-31T12:00:00.000Z",
    ...overrides,
  };
}

describe("recordRetrospectiveOutcome — sink failure swallowed with telemetry (ConcurrencyReviewer-008)", () => {
  afterEach(() => {
    _resetOutcomeSink();
    _resetMetricsSink();
  });

  it("does not throw when the outcome sink rejects", async () => {
    setOutcomeSink({
      recordOutcome: async () => {
        throw new Error("db down");
      },
    });
    await expect(
      recordRetrospectiveOutcome(outcome()),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the outcome sink throws synchronously", async () => {
    setOutcomeSink({
      recordOutcome: () => {
        throw new Error("sync down");
      },
    });
    await expect(
      recordRetrospectiveOutcome(outcome()),
    ).resolves.toBeUndefined();
  });

  it("routes failure to recordSinkFailure with sink='outcome' and the intentHash subject", async () => {
    const failures: Array<{
      sink: string;
      subject: string;
      errorClass: string;
    }> = [];
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push({
          sink: e.sink,
          subject: e.subject,
          errorClass: e.errorClass,
        });
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    setOutcomeSink({
      recordOutcome: async () => {
        throw new TypeError("pg outage");
      },
    });
    await recordRetrospectiveOutcome(outcome({ intentHash: "b".repeat(64) }));
    expect(failures).toHaveLength(1);
    expect(failures[0]!.sink).toBe("outcome");
    expect(failures[0]!.subject).toBe("b".repeat(64));
    expect(failures[0]!.errorClass).toBe("TypeError");
  });

  it("does not emit telemetry on the happy path", async () => {
    let calls = 0;
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {
        calls += 1;
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    setOutcomeSink({ recordOutcome() {} });
    await recordRetrospectiveOutcome(outcome());
    expect(calls).toBe(0);
  });
});
