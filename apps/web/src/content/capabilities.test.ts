/**
 * @vitest-environment node
 *
 * Barrier test for the capability catalogue. The /capabilities index and the
 * per-capability detail pages depend on this registry, so it must stay honest:
 *
 *   - exactly 14 entries, slug-unique;
 *   - every `adr.path` AND `pkg.sourcePath` resolves to a real file on disk —
 *     a rename in docs/architecture/adr/ or packages/ FAILS here rather than
 *     shipping a dead reference on the public site;
 *   - exactly 6 entries are Tier 1 (the full-page set);
 *   - the four zero-web-presence gaps (hallucination, policy-coherence,
 *     agent-memory, approval) and the two governance packs (incident, access)
 *     are all present and Tier 2.
 *
 * Path resolution is cwd-independent: the repo root is derived from this test
 * file's own location (`import.meta.url`), not process.cwd(), so the test passes
 * whether run from apps/web or the workspace root.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "./capabilities";

// This file lives at apps/web/src/content/capabilities.test.ts. Walk four
// levels up (content → src → web → apps) to reach the repository root.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

describe("CAPABILITIES registry", () => {
  it("has exactly 14 entries", () => {
    expect(CAPABILITIES.length).toBe(14);
  });

  it("has unique slugs", () => {
    const slugs = CAPABILITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has exactly 6 Tier 1 capabilities", () => {
    expect(CAPABILITIES.filter((c) => c.tier === 1).length).toBe(6);
  });

  it("has exactly 8 Tier 2 capabilities", () => {
    expect(CAPABILITIES.filter((c) => c.tier === 2).length).toBe(8);
  });

  it.each(CAPABILITIES.map((c) => [c.slug, c.adr.id, c.adr.path] as const))(
    "%s — adr.path (%s) exists on disk",
    (_slug, _id, path) => {
      const abs = resolve(repoRoot, path);
      expect(existsSync(abs)).toBe(true);
      expect(statSync(abs).isFile()).toBe(true);
    },
  );

  it.each(CAPABILITIES.map((c) => [c.slug, c.pkg.name, c.pkg.sourcePath] as const))(
    "%s — pkg.sourcePath (%s) exists on disk",
    (_slug, _name, sourcePath) => {
      const abs = resolve(repoRoot, sourcePath);
      expect(existsSync(abs)).toBe(true);
      expect(statSync(abs).isFile()).toBe(true);
    },
  );

  it("anchors adr.path under docs/architecture/adr/ and pkg.sourcePath under packages/", () => {
    for (const c of CAPABILITIES) {
      expect(c.adr.path.startsWith("docs/architecture/adr/")).toBe(true);
      expect(c.pkg.sourcePath.startsWith("packages/")).toBe(true);
    }
  });

  // The four zero-web-presence gaps + the two governance packs MUST be in the
  // registry (Tier 2). If any is renamed away, this fails.
  it.each([
    ["hallucination-scoring"],
    ["policy-coherence-analyzer"],
    ["agent-memory-store"],
    ["smart-approval-engine"],
    ["incident-response-pack"],
    ["access-governance-pack"],
  ])("includes the documented Tier-2 gap/pack: %s", (slug) => {
    const entry = CAPABILITIES.find((c) => c.slug === slug);
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe(2);
  });

  // The six Tier-1 full-page capabilities are exactly these.
  it("the Tier-1 set is exactly the six expected slugs", () => {
    const tier1 = CAPABILITIES.filter((c) => c.tier === 1)
      .map((c) => c.slug)
      .sort();
    expect(tier1).toEqual(
      [
        "pii-guard",
        "token-budget-guard",
        "release-gating",
        "command-risk-guard",
        "red-team",
        "behavioral-drift",
      ].sort(),
    );
  });

  it("covers all four families", () => {
    const families = new Set(CAPABILITIES.map((c) => c.family));
    expect([...families].sort()).toEqual([
      "adversarial",
      "budget-integrity",
      "content-safety",
      "workflow",
    ]);
  });

  it("every live-kernel worked example carries an intentKind + payload", () => {
    for (const c of CAPABILITIES) {
      if (c.workedExample.kind === "live-kernel") {
        expect(typeof c.workedExample.intentKind).toBe("string");
        expect(c.workedExample.intentKind.length).toBeGreaterThan(0);
        expect(c.workedExample.payload).toBeTypeOf("object");
      }
      if (c.workedExample.kind === "chart") {
        expect(c.workedExample.transparencyHref.startsWith("/transparency/")).toBe(true);
      }
    }
  });

  it("every entry declares at least one outcome", () => {
    for (const c of CAPABILITIES) {
      expect(c.outcomes.length).toBeGreaterThan(0);
    }
  });
});
