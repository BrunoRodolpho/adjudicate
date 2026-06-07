import { describe, expect, it } from "vitest";
import {
  generatePromptInjectionEnvelopes,
  generateTaintEscalationEnvelopes,
  generateToolScopeViolationEnvelopes,
} from "../src/index.js";
import { strictStubPack } from "./helpers.js";

const pack = strictStubPack();

describe("generatePromptInjectionEnvelopes", () => {
  it("emits perIntent scenarios per kind, all UNTRUSTED/LLM", () => {
    const out = generatePromptInjectionEnvelopes(pack, { perIntent: 3 });
    expect(out.length).toBe(3 * pack.intents.length);
    for (const s of out) {
      expect(s.vector).toBe("prompt_injection");
      expect(s.intent.taint).toBe("UNTRUSTED");
      expect(s.intent.actor.principal).toBe("llm");
      expect(s.defense.acceptable).not.toContain("EXECUTE");
    }
  });
});

describe("generateTaintEscalationEnvelopes", () => {
  it("targets only elevated-minimum kinds, expecting REFUSE", () => {
    const out = generateTaintEscalationEnvelopes(pack, { perIntent: 2 });
    // Only demo.system.callback has an elevated (TRUSTED) minimum.
    expect(out.length).toBe(2);
    for (const s of out) {
      expect(s.intent.kind).toBe("demo.system.callback");
      expect(s.intent.taint).toBe("UNTRUSTED");
      expect(s.defense.acceptable).toEqual(["REFUSE"]);
    }
  });
});

describe("generateToolScopeViolationEnvelopes", () => {
  it("emits scenarios for intents the planner does not allow", () => {
    const out = generateToolScopeViolationEnvelopes(pack, { perIntent: 1 });
    expect(out.length).toBe(1);
    expect(out[0]!.intent.kind).toBe("demo.system.callback");
    expect(out[0]!.defense.acceptable).not.toContain("EXECUTE");
  });

  it("returns [] when the pack has no planner", () => {
    const noPlanner = { ...pack, planner: undefined };
    expect(generateToolScopeViolationEnvelopes(noPlanner)).toEqual([]);
  });
});
