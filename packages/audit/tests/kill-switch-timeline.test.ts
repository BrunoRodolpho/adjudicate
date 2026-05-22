import { describe, expect, it } from "vitest";
import {
  analyzeKillSwitchTimeline,
  type KillSwitchEvent,
} from "../src/index.js";

function evt(
  at: string,
  kind: KillSwitchEvent["kind"],
  state: KillSwitchEvent["state"],
  source?: KillSwitchEvent["source"],
): KillSwitchEvent {
  return { at, kind, state, ...(source !== undefined ? { source } : {}) };
}

describe("analyzeKillSwitchTimeline", () => {
  it("classifies an empty timeline as stable", () => {
    const r = analyzeKillSwitchTimeline([]);
    expect(r.totalEvents).toBe(0);
    expect(r.trips).toBe(0);
    expect(r.stability).toBe("stable");
    expect(r.headline).toContain("stable");
  });

  it("classifies a single trip+clear as single_incident", () => {
    const r = analyzeKillSwitchTimeline([
      evt("2026-05-21T00:00:00.000Z", "trip", "active", "operator"),
      evt("2026-05-21T00:00:30.000Z", "clear", "normal", "operator"),
    ]);
    expect(r.trips).toBe(1);
    expect(r.clears).toBe(1);
    expect(r.transitions).toBe(1);
    expect(r.activeDurationMs).toBe(30_000);
    expect(r.stability).toBe("single_incident");
  });

  it("classifies many trips as recurring_incidents below the storm threshold", () => {
    const events: KillSwitchEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        evt(`2026-05-21T00:0${i * 2}:00.000Z`, "trip", "active", "automated"),
        evt(`2026-05-21T00:0${i * 2 + 1}:00.000Z`, "clear", "normal", "automated"),
      );
    }
    const r = analyzeKillSwitchTimeline(events);
    expect(r.trips).toBe(3);
    expect(r.stability).toBe("recurring_incidents");
  });

  it("classifies bursts as storm via density threshold", () => {
    const events: KillSwitchEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(evt(`2026-05-21T00:0${i}:00.000Z`, "trip", "active", "automated"));
    }
    const r = analyzeKillSwitchTimeline(events, { stormDensityThreshold: 5 });
    expect(r.stability).toBe("storm");
    expect(r.maxTripDensity).toBeGreaterThanOrEqual(5);
    expect(r.headline).toContain("STORM");
  });

  it("classifies many trips as storm via count threshold", () => {
    const events: KillSwitchEvent[] = [];
    for (let i = 0; i < 11; i++) {
      events.push(evt(`2026-05-21T00:${String(i).padStart(2, "0")}:00.000Z`, "trip", "active"));
    }
    const r = analyzeKillSwitchTimeline(events, { stormTripCountThreshold: 10 });
    expect(r.stability).toBe("storm");
  });

  it("tallies sources into the closed enum and tolerates missing source", () => {
    const r = analyzeKillSwitchTimeline([
      evt("2026-05-21T00:00:00.000Z", "trip", "active", "operator"),
      evt("2026-05-21T00:00:10.000Z", "snapshot", "active"),
      evt("2026-05-21T00:00:20.000Z", "clear", "normal", "boot"),
    ]);
    expect(r.bySource.operator).toBe(1);
    expect(r.bySource.unknown).toBe(1);
    expect(r.bySource.boot).toBe(1);
  });

  it("accumulates active duration only while engaged", () => {
    const r = analyzeKillSwitchTimeline([
      evt("2026-05-21T00:00:00.000Z", "trip", "active"),
      evt("2026-05-21T00:01:00.000Z", "clear", "normal"),
      evt("2026-05-21T00:02:00.000Z", "trip", "active"),
      evt("2026-05-21T00:03:30.000Z", "clear", "normal"),
    ]);
    // 60s + 90s = 150_000 ms
    expect(r.activeDurationMs).toBe(150_000);
  });

  it("is deterministic across repeated invocations", () => {
    const events = [
      evt("2026-05-21T00:00:00.000Z", "trip", "active", "operator"),
      evt("2026-05-21T00:00:30.000Z", "clear", "normal", "operator"),
    ];
    expect(analyzeKillSwitchTimeline(events)).toEqual(
      analyzeKillSwitchTimeline(events),
    );
  });
});
