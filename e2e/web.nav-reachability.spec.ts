import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Reachability (Phase 7) — the #1 problem this refactor fixes was the orphaned
 * /transparency hub and missing global nav. This asserts the global nav/footer
 * expose the key routes and that every public route resolves (no 404s/orphans).
 */
test.describe("web nav reachability", () => {
  test("homepage exposes the key routes via global nav/footer", async ({ page }) => {
    await page.goto(`${WEB}/`);
    for (const href of [
      "/capabilities",
      "/console",
      "/transparency",
      "/deploy",
      "/architecture/data-flow",
      "/playground",
    ]) {
      await expect(
        page.locator(`a[href="${href}"]`).first(),
        `homepage should link to ${href}`,
      ).toHaveCount(1);
    }
  });

  const ROUTES = [
    "/",
    "/how-it-works",
    "/deploy",
    "/playground",
    "/capabilities",
    "/console",
    "/console/audit-explorer",
    "/console/dashboard",
    "/architecture",
    "/architecture/data-flow",
    "/comparisons",
    "/introspection",
    "/transparency",
    "/transparency/pii",
    "/transparency/ai-bom",
    "/transparency/drift",
    "/transparency/red-team",
    "/transparency/command-risk",
    "/transparency/tokens",
    "/transparency/integrity",
  ];
  for (const route of ROUTES) {
    test(`route resolves: ${route}`, async ({ page }) => {
      const resp = await page.goto(`${WEB}${route}`);
      expect(resp?.status(), `${route} should not 404`).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
    });
  }

  test("every Tier-1 capability page is reachable from the index", async ({ page }) => {
    await page.goto(`${WEB}/capabilities`);
    const tier1 = [
      "pii-guard",
      "token-budget-guard",
      "release-gating",
      "command-risk-guard",
      "red-team",
      "behavioral-drift",
    ];
    for (const slug of tier1) {
      await expect(
        page.locator(`a[href="/capabilities/${slug}"]`).first(),
      ).toHaveCount(1);
    }
  });
});
