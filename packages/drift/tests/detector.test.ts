import { describe, expect, it, vi } from "vitest";
import { createDriftDetector } from "../src/index.js";
import { many, rec } from "./helpers.js";

describe("createDriftDetector", () => {
  it("freezes the baseline at baselineWindow, then fills the recent window", () => {
    const d = createDriftDetector({
      baselineWindow: 4,
      recentWindow: 4,
      alertThreshold: 0.25,
      dimensions: ["decision.kind"],
    });
    many(4, "EXECUTE").forEach((r) => d.observe(r));
    many(4, "REFUSE").forEach((r) => d.observe(r));
    const snap = d.snapshot();
    const dim = snap.dimensions[0]!;
    expect(dim.baseline).toEqual({ EXECUTE: 4 });
    expect(dim.recent).toEqual({ REFUSE: 4 });
    expect(dim.tvd).toBe(1);
    expect(snap.totalObserved).toBe(8);
    expect(snap.schemaVersion).toBe(1);
  });

  it("fires distribution_shift + new_category + proportion_spike on a REFUSE spike", () => {
    const onDrift = vi.fn();
    const d = createDriftDetector({
      baselineWindow: 4,
      recentWindow: 4,
      alertThreshold: 0.25,
      dimensions: ["decision.kind"],
      onDrift,
    });
    many(4, "EXECUTE").forEach((r) => d.observe(r));
    many(4, "REFUSE").forEach((r) => d.observe(r));
    const alerts = d.evaluate();
    const signals = new Set(alerts.map((a) => a.signal));
    expect(signals.has("distribution_shift")).toBe(true);
    expect(signals.has("new_category")).toBe(true);
    expect(signals.has("proportion_spike")).toBe(true);
    expect(onDrift).toHaveBeenCalled();
  });

  it("detects a new intent kind via the intent.kind dimension", () => {
    const d = createDriftDetector({
      baselineWindow: 3,
      recentWindow: 3,
      alertThreshold: 0.5,
      dimensions: ["intent.kind"],
    });
    [rec("EXECUTE", "a"), rec("EXECUTE", "a"), rec("EXECUTE", "a")].forEach((r) => d.observe(r));
    d.observe(rec("EXECUTE", "b"));
    const alerts = d.evaluate();
    expect(alerts.some((a) => a.signal === "new_category" && a.category === "b")).toBe(true);
  });

  it("evicts oldest keys past recentWindow (FIFO)", () => {
    const d = createDriftDetector({
      baselineWindow: 1,
      recentWindow: 2,
      alertThreshold: 0.9,
      dimensions: ["decision.kind"],
    });
    d.observe(rec("EXECUTE")); // baseline
    d.observe(rec("A"));
    d.observe(rec("B"));
    d.observe(rec("C")); // evicts A
    const recent = d.snapshot().dimensions[0]!.recent;
    expect(recent).toEqual({ B: 1, C: 1 });
  });

  it("no alerts before baseline+recent both have data", () => {
    const d = createDriftDetector({
      baselineWindow: 10,
      alertThreshold: 0.1,
      dimensions: ["decision.kind"],
    });
    d.observe(rec("EXECUTE"));
    expect(d.evaluate()).toEqual([]);
  });

  it("attach wires observe and returns an unsubscribe; reset clears", () => {
    const d = createDriftDetector({ baselineWindow: 2, alertThreshold: 0.5, dimensions: ["decision.kind"] });
    const handlers: Array<(r: ReturnType<typeof rec>) => void> = [];
    const bus = {
      subscribe(h: (r: ReturnType<typeof rec>) => void) {
        handlers.push(h);
        return () => {
          handlers.length = 0;
        };
      },
    };
    const unsub = d.attach(bus as never);
    handlers[0]!(rec("EXECUTE"));
    expect(d.snapshot().totalObserved).toBe(1);
    unsub();
    expect(handlers.length).toBe(0);
    d.reset();
    expect(d.snapshot().totalObserved).toBe(0);
  });

  it("tracks the basis dimension from decision_basis categories", () => {
    const d = createDriftDetector({ baselineWindow: 2, recentWindow: 2, alertThreshold: 0.5, dimensions: ["basis"] });
    d.observe(rec("EXECUTE", "x", ["auth", "business"]));
    d.observe(rec("EXECUTE", "x", ["auth"]));
    const baseline = d.snapshot().dimensions[0]!.baseline;
    expect(baseline.auth).toBe(2);
    expect(baseline.business).toBe(1);
  });
});
