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
import { CONSOLE_REPLICA_RECORDS_BY_HASH } from "../lib/console-replica-records";

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

  it("every worked-example kind is well-formed for its variant", () => {
    for (const c of CAPABILITIES) {
      const w = c.workedExample;
      switch (w.kind) {
        case "live-kernel":
          expect(typeof w.intentKind).toBe("string");
          expect(w.intentKind.length).toBeGreaterThan(0);
          expect(w.payload).toBeTypeOf("object");
          break;
        case "chart":
          expect(w.transparencyHref.startsWith("/transparency/")).toBe(true);
          break;
        case "receipt":
          // The hash must resolve to a REAL fixture record — a dead hash would
          // render an empty receipt on the public page, so fail here instead.
          expect(typeof w.recordHash).toBe("string");
          expect(w.recordHash.length).toBeGreaterThan(0);
          expect(CONSOLE_REPLICA_RECORDS_BY_HASH.has(w.recordHash)).toBe(true);
          break;
        case "replica":
          expect(w.replicaRoute.startsWith("/console")).toBe(true);
          break;
        case "pack":
          expect(w.intents.length).toBeGreaterThan(0);
          expect(w.outcomes.length).toBeGreaterThan(0);
          break;
        case "illustration":
          expect(w.title.length).toBeGreaterThan(0);
          expect(w.body.length).toBeGreaterThan(0);
          break;
      }
    }
  });

  // The hallucination-scoring receipt MUST feature the hallucinated record
  // (metadata.hallucination_score === 1) — the whole point of the example.
  it("hallucination-scoring features the hallucinated fixture record", () => {
    const cap = CAPABILITIES.find((c) => c.slug === "hallucination-scoring");
    expect(cap?.workedExample.kind).toBe("receipt");
    if (cap?.workedExample.kind !== "receipt") return;
    const rec = CONSOLE_REPLICA_RECORDS_BY_HASH.get(cap.workedExample.recordHash);
    expect(rec).toBeDefined();
    expect(
      (rec?.metadata as { hallucination_score?: number } | undefined)
        ?.hallucination_score,
    ).toBe(1);
    // consoleAppearance.replicaRoute deep-links the same record's decision page.
    expect(cap.consoleAppearance.replicaRoute).toBe(
      `/console/decision/${cap.workedExample.recordHash}`,
    );
  });

  // The two governance packs render their REAL declared intents.
  it("the governance packs declare their real intents", () => {
    const expected: Record<string, readonly string[]> = {
      "incident-response-pack": [
        "incident.remediation.execute",
        "incident.escalate",
        "incident.monitor.callback",
      ],
      "access-governance-pack": [
        "access.request",
        "access.review.resolve",
        "access.revoke",
      ],
    };
    for (const [slug, intents] of Object.entries(expected)) {
      const cap = CAPABILITIES.find((c) => c.slug === slug);
      expect(cap?.workedExample.kind).toBe("pack");
      if (cap?.workedExample.kind !== "pack") continue;
      expect(cap.workedExample.intents).toEqual(intents);
    }
  });

  it("every entry declares at least one outcome", () => {
    for (const c of CAPABILITIES) {
      expect(c.outcomes.length).toBeGreaterThan(0);
    }
  });
});
