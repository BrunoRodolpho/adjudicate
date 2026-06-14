import { describe, expect, it } from "vitest";
import type { AuditRecord } from "@adjudicate/core";
import type { AuditEventBus } from "@adjudicate/audit";
import type { DriftAlert } from "@adjudicate/drift";
import { auditBusToSignal, createSignalChannel, driftToSignal } from "../src/index.js";

describe("createSignalChannel", () => {
  it("delivers to a live subscriber in order", () => {
    const ch = createSignalChannel<string>();
    const got: string[] = [];
    ch.subscribe((s) => got.push(s));
    ch.push("a");
    ch.push("b");
    expect(got).toEqual(["a", "b"]);
  });

  it("buffers before any subscriber and flushes on subscribe", () => {
    const ch = createSignalChannel<string>();
    ch.push("early-1");
    ch.push("early-2");
    const got: string[] = [];
    ch.subscribe((s) => got.push(s));
    expect(got).toEqual(["early-1", "early-2"]);
  });

  it("unsubscribe stops delivery", () => {
    const ch = createSignalChannel<number>();
    const got: number[] = [];
    const off = ch.subscribe((s) => got.push(s));
    ch.push(1);
    off();
    ch.push(2);
    expect(got).toEqual([1]);
  });

  it("drain returns and clears the buffer", () => {
    const ch = createSignalChannel<number>();
    ch.push(1);
    ch.push(2);
    expect(ch.drain()).toEqual([1, 2]);
    expect(ch.drain()).toEqual([]);
  });
});

describe("auditBusToSignal", () => {
  it("maps AuditRecords from the bus into channel signals (null skips)", () => {
    let handler: ((r: AuditRecord) => void) | null = null;
    const fakeBus = {
      subscribe: (h: (r: AuditRecord) => void) => {
        handler = h;
        return () => {
          handler = null;
        };
      },
    } as unknown as AuditEventBus;

    const ch = createSignalChannel<string>();
    const got: string[] = [];
    ch.subscribe((s) => got.push(s));

    const off = auditBusToSignal(fakeBus, ch, (r) =>
      (r as unknown as { kind?: string }).kind === "remediate" ? "sig" : null,
    );
    handler!({ kind: "remediate" } as unknown as AuditRecord);
    handler!({ kind: "other" } as unknown as AuditRecord);
    expect(got).toEqual(["sig"]);
    off();
  });
});

describe("driftToSignal", () => {
  it("maps DriftAlerts above a threshold into signals (null skips)", () => {
    const ch = createSignalChannel<number>();
    const got: number[] = [];
    ch.subscribe((s) => got.push(s));

    const onDrift = driftToSignal(ch, (a) => (a.magnitude >= 0.5 ? a.recentCount : null));
    onDrift({
      dimension: "decision_kind",
      signal: "tvd_spike",
      magnitude: 0.9,
      threshold: 0.3,
      baselineCount: 10,
      recentCount: 7,
    } as unknown as DriftAlert);
    onDrift({
      dimension: "decision_kind",
      signal: "tvd_spike",
      magnitude: 0.1,
      threshold: 0.3,
      baselineCount: 10,
      recentCount: 2,
    } as unknown as DriftAlert);
    expect(got).toEqual([7]);
  });
});
