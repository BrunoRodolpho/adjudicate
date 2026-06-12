import { describe, expect, it } from "vitest";
import { SEMCONV } from "../src/index.js";

/**
 * Conventions for the SEMCONV registry (see the header of `src/semconv.ts`):
 *
 * - every attribute name is namespaced `adjudicate.*`,
 * - segments are lowercase `[a-z0-9_]`, dot-separated,
 * - constant names are UPPER_SNAKE_CASE,
 * - names are unique (two constants must never alias one attribute),
 * - existing names are stable — additions only, no renames.
 */
describe("semconv", () => {
  const entries = Object.entries(SEMCONV) as Array<[string, string]>;

  it("every attribute name is unique", () => {
    const values = entries.map(([, v]) => v);
    expect(new Set(values).size).toBe(values.length);
  });

  it("every attribute name is namespaced under adjudicate.* with lowercase dotted segments", () => {
    for (const [, value] of entries) {
      expect(value).toMatch(/^adjudicate(\.[a-z0-9]+(_[a-z0-9]+)*)+$/);
    }
  });

  it("every constant name is UPPER_SNAKE_CASE", () => {
    for (const [key] of entries) {
      expect(key).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
  });

  it("no attribute name is a prefix-namespace of another (a.b and a.b.c must not coexist)", () => {
    const values = entries.map(([, v]) => v);
    for (const a of values) {
      for (const b of values) {
        if (a === b) continue;
        expect(b.startsWith(`${a}.`)).toBe(false);
      }
    }
  });

  it("pins the journey-testing (sim.*) attribute names — stable across minor versions", () => {
    // Add-only contract: adopter journey-test harnesses (and the dashboards
    // over their OTLP output) key on these exact strings. Renames are
    // breaking changes and go through the deprecation calendar.
    expect(SEMCONV.SIM_JOURNEY_ID).toBe("adjudicate.sim.journey.id");
    expect(SEMCONV.SIM_RUN_ID).toBe("adjudicate.sim.run.id");
    expect(SEMCONV.SIM_ATTEMPT).toBe("adjudicate.sim.attempt");
    expect(SEMCONV.SIM_CERTIFYING).toBe("adjudicate.sim.certifying");
    expect(SEMCONV.SIM_OUTCOME).toBe("adjudicate.sim.outcome");
    expect(SEMCONV.SIM_COST_USD).toBe("adjudicate.sim.cost.usd");
    expect(SEMCONV.SIM_DRIVER_TOKENS_IN).toBe("adjudicate.sim.driver.tokens.in");
    expect(SEMCONV.SIM_DRIVER_TOKENS_OUT).toBe("adjudicate.sim.driver.tokens.out");
    expect(SEMCONV.SIM_SUT_TOKENS_IN).toBe("adjudicate.sim.sut.tokens.in");
    expect(SEMCONV.SIM_SUT_TOKENS_OUT).toBe("adjudicate.sim.sut.tokens.out");
  });

  it("pins the pre-existing attribute names — add-only, never rename", () => {
    expect(SEMCONV).toMatchObject({
      INTENT_KIND: "adjudicate.intent.kind",
      DECISION_KIND: "adjudicate.decision.kind",
      TAINT: "adjudicate.taint",
      POLICY_VERSION: "adjudicate.policy.version",
      PACK_ID: "adjudicate.pack.id",
      LATENCY_MS: "adjudicate.latency.ms",
      INTENT_HASH: "adjudicate.intent.hash",
      GUARD_ID: "adjudicate.guard.id",
      TRANSITION_SOURCE: "adjudicate.transition.source",
      ADAPTER_PHASE: "adjudicate.adapter.phase",
      ADAPTER_ITERATION: "adjudicate.adapter.iteration",
      ADAPTER_OUTCOME: "adjudicate.adapter.outcome",
      PROVIDER_ID: "adjudicate.provider.id",
      PAUSE_PHASE: "adjudicate.pause.phase",
      DEFER_SIGNAL: "adjudicate.defer.signal",
      KILL_SWITCH_STATE: "adjudicate.kill_switch.state",
      HALLUCINATION_SCORE: "adjudicate.hallucination.score",
      HALLUCINATION_BUCKET: "adjudicate.hallucination.bucket",
    });
  });
});
