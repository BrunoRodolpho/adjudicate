import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 114 — write-isolation acceptance for the Escalate / recommend surface.
 *
 * The escalate surface is the ONE write the observer plane permits. These tests
 * prove (as an executable form of the §8 acceptance) that the surface wires
 * ONLY the friction-monotone `escalate.raise` mutation and NONE of the four
 * authorize/weaken mutations — so the OBSERVER plane cannot, from this surface,
 * authorize, weaken, lower a threshold, override a refusal, or mint an EXECUTE.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SURFACE_FILES = [
  join(HERE, "useRaiseEscalation.ts"),
  join(HERE, "..", "components", "escalate", "EscalatePanel.tsx"),
  join(HERE, "..", "app", "escalate", "page.tsx"),
];

// Strip comments so the grep targets EXECUTABLE code (a docstring legitimately
// NAMES the excluded mutations to explain what is forbidden).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// The four AUTHORIZE/WEAKEN mutations — NONE may appear in the escalate surface.
const FORBIDDEN_MUTATIONS = [
  "emergency.update",
  "approval.resolve",
  "governance.recordOutcome",
  "replay.run",
];

describe("Escalate surface — wires ONLY the friction-monotone escalate write (114)", () => {
  it("the escalate hook composes the single `escalate.raise` mutation", () => {
    const src = readFileSync(join(HERE, "useRaiseEscalation.ts"), "utf8");
    expect(src).toContain("trpc.escalate.raise.mutate");
  });

  it("NO file in the escalate surface wires an authorize/weaken mutation", () => {
    for (const file of SURFACE_FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of FORBIDDEN_MUTATIONS) {
        expect(
          code.includes(token),
          `${file} must not reference authorize/weaken mutation "${token}"`,
        ).toBe(false);
      }
    }
  });

  it("the escalate surface contains NO friction-decreasing recommendation control", () => {
    const panel = stripComments(
      readFileSync(
        join(HERE, "..", "components", "escalate", "EscalatePanel.tsx"),
        "utf8",
      ),
    );
    // No allow/bypass/override/EXECUTE recommendation value anywhere in the
    // executable code — the radio set is closed to pause/review/escalate.
    for (const forbidden of [
      'value: "allow"',
      'value: "bypass"',
      'value: "override"',
      'value: "EXECUTE"',
    ]) {
      expect(panel.includes(forbidden)).toBe(false);
    }
  });
});
