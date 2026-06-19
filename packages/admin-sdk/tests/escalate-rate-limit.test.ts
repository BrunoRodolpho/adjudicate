import { describe, expect, it } from "vitest";
import {
  createEscalateRateLimiter,
  DEFAULT_ESCALATE_MAX_PER_WINDOW,
  DEFAULT_ESCALATE_WINDOW_MS,
} from "../src/trpc/escalate-rate-limit.js";
import {
  createInMemoryEscalationSink,
  DEFAULT_MAX_ESCALATIONS,
} from "../src/store/escalation-store.js";

/**
 * 114 — unit conformance for the per-actor escalate rate limiter and the
 * in-memory escalation sink. Pure, clock-injected — no timers.
 */

describe("createEscalateRateLimiter", () => {
  it("allows up to maxPerWindow then rejects within the window", () => {
    const rl = createEscalateRateLimiter({ maxPerWindow: 3, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 10)).toBe(true);
    expect(rl.allow("a", 20)).toBe(true);
    expect(rl.allow("a", 30)).toBe(false); // 4th within the window
  });

  it("resets after the window slides past the earliest accepted hit", () => {
    const rl = createEscalateRateLimiter({ maxPerWindow: 2, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 500)).toBe(true);
    expect(rl.allow("a", 800)).toBe(false); // over limit while window holds both
    // Advance past the first hit's window (>1000 after t=0): only the t=500 hit
    // remains in-window, so a new attempt is allowed.
    expect(rl.allow("a", 1001)).toBe(true);
  });

  it("does NOT count a rejected attempt toward the window (no cooldown extension)", () => {
    const rl = createEscalateRateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 100)).toBe(false); // rejected — must not be recorded
    expect(rl.allow("a", 200)).toBe(false); // still rejected (only t=0 counts)
    // The single accepted hit at t=0 expires at t>1000 — allowed again.
    expect(rl.allow("a", 1001)).toBe(true);
  });

  it("tracks windows independently per actor", () => {
    const rl = createEscalateRateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 1)).toBe(false);
    expect(rl.allow("b", 1)).toBe(true); // b has its own window
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_ESCALATE_MAX_PER_WINDOW).toBeGreaterThan(0);
    expect(DEFAULT_ESCALATE_WINDOW_MS).toBeGreaterThan(0);
    const rl = createEscalateRateLimiter();
    for (let i = 0; i < DEFAULT_ESCALATE_MAX_PER_WINDOW; i++) {
      expect(rl.allow("a", i)).toBe(true);
    }
    expect(rl.allow("a", DEFAULT_ESCALATE_MAX_PER_WINDOW)).toBe(false);
  });
});

describe("createInMemoryEscalationSink", () => {
  it("records an escalation as a FACT and returns it newest-first in history", async () => {
    const sink = createInMemoryEscalationSink();
    const r1 = await sink.record({
      intentHash: "a".repeat(64),
      recommendation: "review",
      reason: "first escalation",
      actor: { id: "op-1" },
    });
    const r2 = await sink.record({
      intentHash: "b".repeat(64),
      recommendation: "pause",
      reason: "second escalation",
      actor: { id: "op-2" },
    });
    expect(r1.kind).toBe("escalation.raised");
    expect(r1.id).not.toBe(r2.id); // unique ids
    const history = await sink.history(10);
    expect(history.map((h) => h.reason)).toEqual([
      "second escalation",
      "first escalation",
    ]);
  });

  it("caps retained records at maxRecords (oldest trimmed)", async () => {
    const sink = createInMemoryEscalationSink({ maxRecords: 2 });
    for (const reason of ["one", "two", "three"]) {
      await sink.record({
        intentHash: "c".repeat(64),
        recommendation: "escalate",
        reason,
        actor: { id: "op-1" },
      });
    }
    const history = await sink.history(10);
    expect(history.map((h) => h.reason)).toEqual(["three", "two"]);
  });

  it("exposes a sane default cap", () => {
    expect(DEFAULT_MAX_ESCALATIONS).toBeGreaterThan(0);
  });
});
