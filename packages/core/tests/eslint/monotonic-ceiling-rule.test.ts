/**
 * Self-test for the custom `@adjudicate/monotonic-ceiling` ESLint rule (plan 061
 * / T4; index §C / invariant #7). Exercises the rule AS REGISTERED by the shared
 * flat config `@adjudicate/eslint-config` (`packages/eslint-config/index.js`):
 *
 *   - it FLAGS a friction-decreasing weakening construction (reassigning a
 *     `decision` binding to `decisionExecute(...)` or `{ kind: "EXECUTE" }`);
 *   - it ALLOWS the deterministic confirmation-receipt carve-out when allowlisted
 *     with an `eslint-disable-next-line @adjudicate/monotonic-ceiling` directive;
 *   - it does NOT flag strengthening reassignments (e.g. to a REFUSE) or the
 *     initial decision binding.
 *
 * The end-to-end cases run through ESLint's `Linter` with the REAL shared flat
 * config (so the rule is resolved under its registered name `@adjudicate/
 * monotonic-ceiling`, exactly as `adjudicate-and-audit.ts`'s disable directive
 * references it). The isolated detection matrix uses ESLint's `RuleTester`.
 *
 * Runs under `pnpm -F @adjudicate/core test` (a §5 gate).
 */

import { describe, it, expect } from "vitest";
import { Linter, RuleTester } from "eslint";
import rule from "@adjudicate/eslint-config/monotonic-ceiling-rule";
import sharedConfig from "@adjudicate/eslint-config";

// ── End-to-end: drive the REAL shared flat config through the Linter ──
// Resolve the config block that registers our rule, so we lint with the exact
// plugin namespace (`@adjudicate/monotonic-ceiling`) the carve-out references.
type ConfigBlock = {
  files?: string[];
  rules?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
};
const blocks = sharedConfig as ConfigBlock[];
const ruleBlock = blocks.find((b) => b.rules && "@adjudicate/monotonic-ceiling" in b.rules)!;

// A minimal flat config that registers ONLY our plugin + rule (drop the type-aware
// and import plugins so the Linter needs no extra parser services for this probe).
const e2eConfig = [
  {
    plugins: { "@adjudicate": ruleBlock.plugins!["@adjudicate"] },
    rules: { "@adjudicate/monotonic-ceiling": "error" },
    languageOptions: { ecmaVersion: 2022 as const, sourceType: "module" as const },
  },
];

function lint(code: string) {
  return new Linter().verify(code, e2eConfig as never);
}

describe("custom rule @adjudicate/monotonic-ceiling (end-to-end via shared config)", () => {
  it("FLAGS a weakening `decision = decisionExecute(...)` reassignment", () => {
    const msgs = lint(
      "function f(decision, basis) { decision = decisionExecute([...basis]); }",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.ruleId).toBe("@adjudicate/monotonic-ceiling");
  });

  it("ALLOWS the same reassignment when allowlisted (confirmation-receipt carve-out)", () => {
    const msgs = lint(
      [
        "function f(decision, basis) {",
        "  // eslint-disable-next-line @adjudicate/monotonic-ceiling -- deterministic receipt",
        "  decision = decisionExecute([...basis]);",
        "}",
      ].join("\n"),
    );
    // The carve-out directive suppresses the violation AND is itself used (no
    // 'unused disable directive' problem reported).
    expect(msgs).toHaveLength(0);
  });

  it("the registered rule id matches the carve-out's disable directive", () => {
    expect(ruleBlock.rules!["@adjudicate/monotonic-ceiling"]).toBe("error");
    const plugin = ruleBlock.plugins!["@adjudicate"] as { rules?: Record<string, unknown> };
    expect(plugin.rules?.["monotonic-ceiling"]).toBe(rule);
  });
});

// ── Isolated detection matrix via RuleTester (no plugin namespacing) ──
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("custom rule @adjudicate/monotonic-ceiling (detection matrix)", () => {
  it("flags weakening constructions, ignores strengthening and initial bindings", () => {
    tester.run("monotonic-ceiling", rule as never, {
      valid: [
        // Strengthening a decision (to a REFUSE) is allowed — it RAISES friction.
        { code: "function f(decision) { decision = replaySuppressedRefusal(); }" },
        // The initial binding (declaration) is not a weakening reassignment.
        { code: "function f() { const decision = decisionExecute([]); return decision; }" },
        // Reassigning a DIFFERENTLY-named binding is out of scope.
        { code: "function f(other) { other = decisionExecute([]); }" },
      ],
      invalid: [
        {
          code: "function f(decision, basis) { decision = decisionExecute([...basis]); }",
          errors: [{ messageId: "weaken" }],
        },
        {
          code: 'function f(decision) { decision = { kind: "EXECUTE", basis: [] }; }',
          errors: [{ messageId: "weaken" }],
        },
        {
          code: "function f(ctx) { ctx.decision = decisionExecute([]); }",
          errors: [{ messageId: "weaken" }],
        },
      ],
    });
    expect(true).toBe(true);
  });
});
