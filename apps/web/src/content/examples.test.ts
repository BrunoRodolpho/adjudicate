/**
 * @vitest-environment node
 *
 * Guards the /deploy examples strip against link rot. Every EXAMPLES[].path is
 * a repo-root-relative directory that must exist on disk — a renamed or removed
 * example FAILS this test rather than shipping a dead card on the public site.
 *
 * Path resolution is cwd-independent: the repo root is derived from this test
 * file's own location (`import.meta.url`), not from process.cwd(), so the test
 * passes whether run from apps/web or the workspace root.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";

// This file lives at apps/web/src/content/examples.test.ts. Walk four levels
// up (content → src → web → apps) to reach the repository root.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

describe("EXAMPLES registry", () => {
  it("references at least one example", () => {
    expect(EXAMPLES.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = EXAMPLES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(EXAMPLES.map((e) => [e.slug, e.path] as const))(
    "%s — path exists on disk and is a directory",
    (_slug, path) => {
      const abs = resolve(repoRoot, path);
      expect(existsSync(abs)).toBe(true);
      expect(statSync(abs).isDirectory()).toBe(true);
    },
  );

  it.each(EXAMPLES.map((e) => [e.slug, e.path] as const))(
    "%s — path is under examples/ (no escaping the registry contract)",
    (_slug, path) => {
      expect(path.startsWith("examples/")).toBe(true);
    },
  );

  it.each(EXAMPLES.map((e) => [e.slug, e.githubHref, e.path] as const))(
    "%s — githubHref points at the same path on the OSS mirror",
    (_slug, githubHref, path) => {
      expect(githubHref).toContain(path);
      expect(githubHref.startsWith("https://github.com/")).toBe(true);
    },
  );
});
