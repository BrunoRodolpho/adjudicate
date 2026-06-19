import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 113 — write-isolation acceptance for the Investigations / cases surface.
 *
 * The case surface composes ONLY pure-read procedures (`audit.query`) over the
 * admin SDK's read-only client (typed against `ReadOnlyAdminRouter`). These
 * tests are an executable form of the §8 "the case surface adds NO mutation"
 * acceptance: the surface's source references the read procedure it composes and
 * NONE of the four authorize/weaken mutations — so the OBSERVER plane cannot, by
 * construction, authorize, weaken, or replay-mutate a decision from this surface.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SURFACE_FILES = [
  join(HERE, "useCase.ts"),
  join(HERE, "..", "lib", "case-correlation.ts"),
  join(HERE, "..", "components", "cases", "CaseView.tsx"),
  join(HERE, "..", "components", "cases", "InvestigationsExplorer.tsx"),
  join(HERE, "..", "app", "cases", "page.tsx"),
];

// Strip comments so the mutation grep targets EXECUTABLE code (a docstring may
// legitimately NAME a mutation to explain what is excluded).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const MUTATION_TOKENS = [
  "emergency.update",
  "approval.resolve",
  "governance.recordOutcome",
  "replay.run",
  // tRPC mutation call site shape — the read-only surface uses `.query(...)` only.
  ".mutate(",
];

describe("Investigations surface — composes read procedures only (113)", () => {
  it("the case hook composes the read-only `audit.query` procedure", () => {
    const src = readFileSync(join(HERE, "useCase.ts"), "utf8");
    expect(src).toContain("trpc.audit.query.query");
  });

  it("NO file in the case surface wires an authorize/weaken mutation", () => {
    for (const file of SURFACE_FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of MUTATION_TOKENS) {
        expect(
          code.includes(token),
          `${file} must not reference mutation token "${token}"`,
        ).toBe(false);
      }
    }
  });
});
