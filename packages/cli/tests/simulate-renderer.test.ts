import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
  type Decision,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  render,
  type SimulationOutput,
} from "../src/lib/simulate-renderer.js";

const baseEnvelope: IntentEnvelope = buildEnvelope({
  kind: "test.kind",
  payload: { foo: "bar" },
  actor: { principal: "llm", sessionId: "sess-test" },
  taint: "UNTRUSTED",
  nonce: "n-test",
  createdAt: "2026-04-29T12:00:00.000Z",
});

function out(decision: Decision, options: Partial<SimulationOutput> = {}): SimulationOutput {
  return {
    pack: { id: "test-pack" },
    envelope: baseEnvelope,
    decision,
    trace: [
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "taint", outcome: "pass" },
      ...(decision.kind === "EXECUTE"
        ? ([{ phase: "default", outcome: "match" }] as const)
        : ([
            {
              phase: "business",
              index: 0,
              guardName: "matchingGuard",
              outcome: "match",
            },
          ] as const)),
    ],
    ...options,
  };
}

// Strip ANSI escapes for content assertions (so tests don't break under
// chalk's color-on environments). The width-math regex used in the
// renderer covers the same shape.
function plain(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

// ─── Frame ─────────────────────────────────────────────────────────────────

describe("renderer — frame and sections", () => {
  it("box is rounded, fixed-width, and ends at the bottom corner", () => {
    const text = plain(render(
      out(decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])),
      "text",
      { width: 80 },
    ));
    const lines = text.split("\n");
    expect(lines[0]?.startsWith("╭")).toBe(true);
    expect(lines[0]?.endsWith("╮")).toBe(true);
    expect(lines.at(-1)?.startsWith("╰")).toBe(true);
    expect(lines.at(-1)?.endsWith("╯")).toBe(true);
    for (const line of lines) {
      expect(line.length).toBe(80);
    }
  });

  it("clamps width to [70, 120]", () => {
    const tiny = plain(render(out(decisionExecute([])), "text", { width: 30 }));
    expect(tiny.split("\n")[0]?.length).toBe(70);

    const huge = plain(render(out(decisionExecute([])), "text", { width: 500 }));
    expect(huge.split("\n")[0]?.length).toBe(120);
  });

  it("contains the four section headers in order", () => {
    const text = plain(render(
      out(decisionRequestConfirmation("Confirm?", [basis("business", BASIS_CODES.business.RULE_SATISFIED)])),
      "text",
      { width: 90 },
    ));
    const decision = text.indexOf("DECISION:");
    const trace = text.indexOf("Trace");
    const basisIdx = text.indexOf("Basis");
    const prompt = text.indexOf("Prompt");
    expect(decision).toBeGreaterThanOrEqual(0);
    expect(trace).toBeGreaterThan(decision);
    expect(basisIdx).toBeGreaterThan(trace);
    expect(prompt).toBeGreaterThan(basisIdx);
  });
});

// ─── Decision-kind detail sections ─────────────────────────────────────────

describe("renderer — decision-specific detail blocks", () => {
  it("EXECUTE: no detail block (basis-only)", () => {
    const text = plain(render(
      out(decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])),
      "text",
      { width: 90 },
    ));
    expect(text).not.toContain("Refusal");
    expect(text).not.toContain("Prompt");
    expect(text).not.toContain("Defer");
  });

  it("REFUSE: surfaces kind, code, user-facing, and detail", () => {
    const decision = decisionRefuse(
      refuse(
        "BUSINESS_RULE",
        "test.too_low",
        "Cannot proceed, please retry.",
        "score=42, threshold=50",
      ),
      [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
    );
    const text = plain(render(out(decision), "text", { width: 90 }));
    expect(text).toContain("Refusal");
    expect(text).toContain("BUSINESS_RULE");
    expect(text).toContain("test.too_low");
    expect(text).toContain("Cannot proceed");
    expect(text).toContain("score=42");
  });

  it("ESCALATE: surfaces target and reason", () => {
    const text = plain(render(
      out(decisionEscalate("supervisor", "Out of policy", [basis("business", BASIS_CODES.business.RULE_SATISFIED)])),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("Escalation");
    expect(text).toContain("supervisor");
    expect(text).toContain("Out of policy");
  });

  it("DEFER: surfaces signal and timeout", () => {
    const text = plain(render(
      out(decisionDefer("payment.confirmed", 900_000, [basis("state", BASIS_CODES.state.TRANSITION_VALID)])),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("Defer");
    expect(text).toContain("payment.confirmed");
    expect(text).toContain("900000");
  });

  it("REWRITE: surfaces reason + new hash", () => {
    const rewritten = buildEnvelope({
      kind: "test.kind",
      payload: { foo: "rewritten" },
      actor: { principal: "llm", sessionId: "sess-test" },
      taint: "UNTRUSTED",
      nonce: "n-test",
      createdAt: "2026-04-29T12:00:00.000Z",
    });
    const text = plain(render(
      out(decisionRewrite(rewritten, "Clamped to bounds", [basis("business", BASIS_CODES.business.QUANTITY_CAPPED)])),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("Rewrite");
    expect(text).toContain("Clamped to bounds");
    expect(text).toContain(rewritten.intentHash.slice(0, 12));
  });
});

// ─── Trace formatting ──────────────────────────────────────────────────────

describe("renderer — trace formatting", () => {
  it("shows guard names from the trace", () => {
    const text = plain(render(
      out(decisionExecute([])),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("kill");
    expect(text).toContain("schema");
    expect(text).toContain("taint");
    expect(text).toContain("default");
  });

  it("shows phase[index] format for array phases", () => {
    const text = plain(render(
      {
        pack: { id: "test-pack" },
        envelope: baseEnvelope,
        decision: decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]),
        trace: [
          { phase: "kill", outcome: "pass" },
          { phase: "schema", outcome: "pass" },
          { phase: "taint", outcome: "pass" },
          {
            phase: "business",
            index: 0,
            guardName: "firstGuard",
            outcome: "pass",
          },
          {
            phase: "business",
            index: 1,
            guardName: "secondGuard",
            outcome: "match",
          },
        ],
      },
      "text",
      { width: 90 },
    ));
    expect(text).toContain("business[0]");
    expect(text).toContain("firstGuard");
    expect(text).toContain("business[1]");
    expect(text).toContain("secondGuard");
    expect(text).toContain("MATCH");
  });

  it("anonymous guards (no guardName) still show phase[index]", () => {
    const text = plain(render(
      {
        pack: { id: "test-pack" },
        envelope: baseEnvelope,
        decision: decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]),
        trace: [
          { phase: "kill", outcome: "pass" },
          { phase: "schema", outcome: "pass" },
          { phase: "taint", outcome: "pass" },
          { phase: "business", index: 0, outcome: "match" },
        ],
      },
      "text",
      { width: 90 },
    ));
    expect(text).toContain("business[0]");
    expect(text).toContain("MATCH");
  });
});

// ─── Expected / match indicator ────────────────────────────────────────────

describe("renderer — expected outcome", () => {
  it("renders 'match' when expected.kind equals decision.kind", () => {
    const text = plain(render(
      out(decisionExecute([]), { expected: { kind: "EXECUTE" } }),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("Expected");
    expect(text).toContain("EXECUTE — match");
  });

  it("renders MISMATCH when expected.kind differs from decision.kind", () => {
    const text = plain(render(
      out(decisionExecute([]), { expected: { kind: "REFUSE" } }),
      "text",
      { width: 90 },
    ));
    expect(text).toContain("MISMATCH");
    expect(text).toContain("got EXECUTE");
  });

  it("omits the Expected row when no expected is supplied", () => {
    const text = plain(render(out(decisionExecute([])), "text", { width: 90 }));
    expect(text).not.toContain("Expected");
  });
});

// ─── JSON format ───────────────────────────────────────────────────────────

describe("renderer — JSON format", () => {
  it("returns valid parseable JSON with the full SimulationOutput shape", () => {
    const text = render(
      out(decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])),
      "json",
    );
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.pack).toEqual({ id: "test-pack" });
    expect(parsed.decision).toBeDefined();
    expect(parsed.trace).toBeDefined();
    expect(parsed.envelope).toBeDefined();
  });
});
