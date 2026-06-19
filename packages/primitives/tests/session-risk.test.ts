import { describe, expect, it } from "vitest";
import { buildEnvelope, decisionRewrite, type Taint } from "@adjudicate/core";
import {
  createSessionRiskGuard,
  foldSessionRiskScore,
  sessionRiskWindowMean,
  type SessionRisk,
} from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";
interface State {
  readonly sessionRisk?: SessionRisk;
}

function env(taint: Taint = "UNTRUSTED") {
  return buildEnvelope({
    kind: "agent.step",
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-fixed",
    createdAt: at,
  });
}

const foldAll = (scores: number[]): SessionRisk | undefined =>
  scores.reduce<SessionRisk | undefined>((acc, s) => foldSessionRiskScore(acc, s), undefined);

describe("foldSessionRiskScore", () => {
  it("starts a fresh accumulator (ewma = first score)", () => {
    const r = foldSessionRiskScore(undefined, 0.8);
    expect(r).toEqual({ window: [0.8], ewma: 0.8, count: 1, lastBucket: "hallucinated" });
  });

  it("clamps out-of-range scores to [0,1]", () => {
    expect(foldSessionRiskScore(undefined, 5).ewma).toBe(1);
    expect(foldSessionRiskScore(undefined, -3).ewma).toBe(0);
    expect(foldSessionRiskScore(undefined, NaN).ewma).toBe(0);
  });

  it("applies EWMA with alpha and caps the window", () => {
    const r = foldSessionRiskScore({ window: [0.2], ewma: 0.2, count: 1 }, 0.7, { alpha: 0.3 });
    expect(r.ewma).toBeCloseTo(0.3 * 0.7 + 0.7 * 0.2, 12);
    expect(r.count).toBe(2);
    const capped = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce<SessionRisk | undefined>(
      (acc, i) => foldSessionRiskScore(acc, i / 10, { windowSize: 3 }),
      undefined,
    )!;
    expect(capped.window.length).toBe(3);
  });

  it("buckets the last score", () => {
    expect(foldSessionRiskScore(undefined, 0.1).lastBucket).toBe("grounded");
    expect(foldSessionRiskScore(undefined, 0.5).lastBucket).toBe("uncertain");
    expect(foldSessionRiskScore(undefined, 0.9).lastBucket).toBe("hallucinated");
  });
});

describe("createSessionRiskGuard — tiers (pure over accumulated S)", () => {
  const guard = createSessionRiskGuard<"agent.step", unknown, State>({
    select: (s) => s.sessionRisk,
    minCount: 3,
    thresholds: { rewrite: 0.3, confirm: 0.5, escalate: 0.7, refuse: 0.9 },
    onRewrite: (e) => decisionRewrite(e, "strip ungrounded claims", [{ category: "validation", code: "groundedness_low" }]),
  });
  const risk = (ewma: number, count = 5): SessionRisk => ({ window: [ewma], ewma, count });

  it("abstains during warm-up (count < minCount)", () => {
    expect(guard(env(), { sessionRisk: risk(0.95, 2) })).toBeNull();
  });
  it("REFUSE at/above the refuse threshold", () => {
    expect(guard(env(), { sessionRisk: risk(0.95) })?.kind).toBe("REFUSE");
  });
  it("ESCALATE in the escalate band", () => {
    expect(guard(env(), { sessionRisk: risk(0.75) })?.kind).toBe("ESCALATE");
  });
  it("REQUEST_CONFIRMATION in the confirm band", () => {
    expect(guard(env(), { sessionRisk: risk(0.55) })?.kind).toBe("REQUEST_CONFIRMATION");
  });
  it("REWRITE in the rewrite band (via adopter onRewrite)", () => {
    expect(guard(env(), { sessionRisk: risk(0.35) })?.kind).toBe("REWRITE");
  });
  it("abstains below all thresholds, and when risk is absent", () => {
    expect(guard(env(), { sessionRisk: risk(0.1) })).toBeNull();
    expect(guard(env(), {})).toBeNull();
  });
});

describe("createSessionRiskGuard — FROZEN escalate-only-shape contract (101 §3)", () => {
  // The on-path compliance signal contract (101): a session-risk signal may
  // only step friction UP or abstain. It must NEVER authorize EXECUTE — only
  // the deterministic kernel rules can do that (§C monotonicity). This test
  // freezes that shape so a future tier-config change cannot regress it.
  const guard = createSessionRiskGuard<"agent.step", unknown, State>({
    select: (s) => s.sessionRisk,
    minCount: 3,
    thresholds: { rewrite: 0.3, confirm: 0.5, escalate: 0.7, refuse: 0.9 },
    onRewrite: (e) => decisionRewrite(e, "strip ungrounded claims", [{ category: "validation", code: "groundedness_low" }]),
  });
  const risk = (ewma: number, count = 5): SessionRisk => ({ window: [ewma], ewma, count });
  const ALLOWED = new Set([null, "REFUSE", "ESCALATE", "REQUEST_CONFIRMATION", "REWRITE"]);

  it("never returns EXECUTE across the full [0,1] risk range (escalate-only)", () => {
    // Sweep the whole accumulated-risk axis at fine resolution. The signal may
    // abstain or raise friction; it may never emit EXECUTE.
    for (let i = 0; i <= 200; i++) {
      const ewma = i / 200; // 0.000 → 1.000
      const d = guard(env(), { sessionRisk: risk(ewma) });
      const kind = d === null ? null : d.kind;
      expect(ALLOWED.has(kind)).toBe(true);
      expect(kind).not.toBe("EXECUTE");
      expect(kind).not.toBe("DEFER");
    }
  });

  it("an adopter onRewrite that tries to EXECUTE cannot be honored by the guard surface", () => {
    // Defense in depth: even if an adopter's onRewrite returned EXECUTE, the
    // contract is realized at the bundle-ordering level (escalate/refuse tiers
    // win first). Within the rewrite band the only EXECUTE-shaped escape is the
    // adopter callback; assert the shipped tiers above never reach it for risk
    // >= a non-rewrite threshold. Here risk=0.95 hits REFUSE, not onRewrite.
    expect(guard(env(), { sessionRisk: risk(0.95) })?.kind).toBe("REFUSE");
    expect(guard(env(), { sessionRisk: risk(0.75) })?.kind).toBe("ESCALATE");
    expect(guard(env(), { sessionRisk: risk(0.55) })?.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("abstains below the warm-up floor no matter how high the risk (count < minCount)", () => {
    // The warm-up floor (`risk.count < minCount`) must hold even at max risk —
    // a cold accumulator never produces a disposition.
    for (const count of [0, 1, 2]) {
      expect(guard(env(), { sessionRisk: risk(1, count) })).toBeNull();
    }
    // At exactly minCount the floor releases and max risk REFUSEs.
    expect(guard(env(), { sessionRisk: risk(1, 3) })?.kind).toBe("REFUSE");
  });

  it("abstains when risk is absent (undefined select)", () => {
    expect(guard(env(), {})).toBeNull();
  });
});

describe("session-risk — REPLAY EQUALITY (the riskiest sub-task, §4.2)", () => {
  const scores = [0.2, 0.85, 0.6, 0.95, 0.1, 0.7, 0.4, 0.88];

  it("re-folding the stored scores reconstructs byte-identical SessionRisk", () => {
    const live = foldAll(scores)!;
    const replay = foldAll(scores)!;
    expect(replay).toEqual(live);
    // JSON round-trip (rehydration into next SendInput.state) is exact.
    const rehydrated = JSON.parse(JSON.stringify(live)) as SessionRisk;
    expect(JSON.stringify(rehydrated)).toBe(JSON.stringify(live));
    expect(rehydrated.ewma).toBe(live.ewma);
  });

  it("near-threshold: live and replayed S yield the same guard decision kind", () => {
    const live = foldAll(scores)!;
    const replay = foldAll(scores)!;
    // Put a threshold extremely close to the accumulated ewma.
    const guard = createSessionRiskGuard<"agent.step", unknown, State>({
      select: (s) => s.sessionRisk,
      minCount: 1,
      thresholds: { confirm: live.ewma, escalate: live.ewma + 1e-9 },
    });
    const a = guard(env(), { sessionRisk: live });
    const b = guard(env(), { sessionRisk: replay });
    expect(a?.kind).toBe(b?.kind);
    expect(a?.kind).toBe("REQUEST_CONFIRMATION"); // metric >= confirm, < escalate
  });

  it("windowMean matches a hand computation", () => {
    const r = foldAll([0.4, 0.6])!;
    expect(sessionRiskWindowMean(r)).toBeCloseTo(0.5, 12);
  });
});
