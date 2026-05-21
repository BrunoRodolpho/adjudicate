/**
 * Tests for v0.6 additions to `explainRecord`:
 *   - `mergeExplanationRegistries` for Pack-supplied template extensions
 *   - `DecisionExplanation.supersession` narration for v3+ records
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPLANATION_REGISTRY,
  explainRecord,
  mergeExplanationRegistries,
  type AuditRecord,
  type ExplanationRegistry,
  type IntentEnvelope,
} from "../src/index.js";

const intentHash = "f".repeat(64);

const baseEnvelope: IntentEnvelope = {
  version: 2,
  kind: "test.kind",
  payload: {},
  createdAt: new Date().toISOString(),
  nonce: "n-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  intentHash,
};

function recordWithSupersession(reason: AuditRecord["supersedes"] extends infer T ? (T & { reason: string })["reason"] : never): AuditRecord {
  return {
    version: 4,
    intentHash,
    envelope: baseEnvelope,
    decision: { kind: "EXECUTE", basis: [] },
    decision_basis: [],
    at: "2026-04-21T10:32:08Z",
    durationMs: 1,
    supersedes: {
      predecessorIntentHash: "e".repeat(64),
      predecessorAt: "2026-04-21T10:00:00Z",
      reason,
    },
  } as AuditRecord;
}

describe("mergeExplanationRegistries", () => {
  it("merges templates from multiple registries (later wins)", () => {
    const a: ExplanationRegistry = {
      locale: "en-US",
      templates: { "x:y": "from A", "common:k": "A version" },
    };
    const b: ExplanationRegistry = {
      locale: "en-US",
      templates: { "p:q": "from B", "common:k": "B version" },
    };
    const merged = mergeExplanationRegistries(a, b);
    expect(merged.templates["x:y"]).toBe("from A");
    expect(merged.templates["p:q"]).toBe("from B");
    expect(merged.templates["common:k"]).toBe("B version"); // later wins
  });

  it("merges headlines from multiple registries (later wins)", () => {
    const a: ExplanationRegistry = {
      locale: "en-US",
      templates: {},
      headlines: {
        EXECUTE: () => "A executed",
      },
    };
    const b: ExplanationRegistry = {
      locale: "en-US",
      templates: {},
      headlines: {
        EXECUTE: () => "B executed",
        REFUSE: () => "B refused",
      },
    };
    const merged = mergeExplanationRegistries(a, b);
    const sample = {
      decision: { kind: "EXECUTE" as const, basis: [] },
      envelope: baseEnvelope,
    } as AuditRecord;
    expect(merged.headlines?.EXECUTE?.(sample)).toBe("B executed");
    expect(merged.headlines?.REFUSE).toBeDefined();
  });

  it("throws on locale mismatch", () => {
    const a: ExplanationRegistry = { locale: "en-US", templates: {} };
    const b: ExplanationRegistry = { locale: "pt-BR", templates: {} };
    expect(() => mergeExplanationRegistries(a, b)).toThrow(/locale mismatch/);
  });

  it("merges with DEFAULT_EXPLANATION_REGISTRY for Pack extensions", () => {
    const packRegistry: ExplanationRegistry = {
      locale: "en-US",
      templates: {
        "business:rule_violated":
          "Pack-specific override: {rule}", // overrides default
        "domain:custom_code":
          "Domain-specific code with {fieldA}",
      },
    };
    const merged = mergeExplanationRegistries(
      DEFAULT_EXPLANATION_REGISTRY,
      packRegistry,
    );
    expect(merged.templates["business:rule_violated"]).toContain(
      "Pack-specific override",
    );
    expect(merged.templates["domain:custom_code"]).toContain(
      "Domain-specific code",
    );
    // Default-only templates survive.
    expect(merged.templates["state:transition_valid"]).toContain(
      "valid state transition",
    );
  });
});

describe("explainRecord supersession narration", () => {
  it("narrates confirmation_resolved with default template", () => {
    const record = recordWithSupersession("confirmation_resolved");
    const explanation = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(explanation.supersession).toContain("REQUEST_CONFIRMATION");
    expect(explanation.supersession).toContain("2026-04-21T10:00:00Z");
  });

  it("narrates defer_resumed", () => {
    const record = recordWithSupersession("defer_resumed");
    const explanation = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(explanation.supersession).toContain("DEFER");
  });

  it("narrates rewrite_executed", () => {
    const record = recordWithSupersession("rewrite_executed");
    const explanation = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(explanation.supersession).toContain("REWRITE");
  });

  it("narrates replay with default fallback when registry has no template", () => {
    const customRegistry: ExplanationRegistry = {
      locale: "en-US",
      templates: {}, // no supersedes:replay
    };
    const record = recordWithSupersession("replay");
    const explanation = explainRecord(record, customRegistry);
    expect(explanation.supersession).toContain("Continues a prior decision");
  });

  it("omits supersession when record has no supersedes field", () => {
    const record = {
      version: 4,
      intentHash,
      envelope: baseEnvelope,
      decision: { kind: "EXECUTE" as const, basis: [] },
      decision_basis: [],
      at: new Date().toISOString(),
      durationMs: 1,
    } as AuditRecord;
    const explanation = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
    expect(explanation.supersession).toBeUndefined();
  });

  it("supersession respects custom Pack-supplied templates", () => {
    const customRegistry = mergeExplanationRegistries(
      DEFAULT_EXPLANATION_REGISTRY,
      {
        locale: "en-US",
        templates: {
          "supersedes:confirmation_resolved":
            "User confirmed at {predecessorAt} via token {token}.",
        },
      },
    );
    const record = recordWithSupersession("confirmation_resolved");
    const explanation = explainRecord(record, customRegistry);
    expect(explanation.supersession).toBe(
      "User confirmed at 2026-04-21T10:00:00Z via token {token}.",
    );
  });
});
