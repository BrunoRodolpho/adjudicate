import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Console replica honesty invariant (Phase 7) — "no fake live data" is treated
 * as a security control. Every replica MUST carry the visible "Illustrative
 * replica" label; the live tail MUST read SIMULATED, never "live"/"polling".
 */
test.describe("console replicas — honesty invariant", () => {
  test("audit explorer: illustrative label + SIMULATED badge + populated table", async ({
    page,
  }) => {
    await page.goto(`${WEB}/console/audit-explorer`);
    await expect(page.getByText(/illustrative replica/i)).toBeVisible();
    await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
    // never claims a live/polling transport
    await expect(page.getByText(/\bpolling\b/i)).toHaveCount(0);
    // alive by default — at least one known fixture intent renders
    await expect(
      page.getByText("deployment.rollback.execute").first(),
    ).toBeVisible();
  });

  test("decision detail renders the full receipt inside the labeled chrome", async ({
    page,
  }) => {
    // pixOvershootRefundRewrite — a REWRITE record
    await page.goto(
      `${WEB}/console/decision/6b865891a8dee91a453b0612c476121579af85a23ed4094f18d0d5a81f46be45`,
    );
    await expect(page.getByText(/illustrative replica/i)).toBeVisible();
    await expect(page.getByText("REWRITE").first()).toBeVisible();
  });

  test("dashboard renders a chart + decision totals inside labeled chrome", async ({
    page,
  }) => {
    await page.goto(`${WEB}/console/dashboard`);
    await expect(page.getByText(/illustrative replica/i)).toBeVisible();
    await expect(page.locator("svg").first()).toBeVisible();
    await expect(page.getByText("EXECUTE").first()).toBeVisible();
  });

  test("apps/web ships no admin/DB transport in the page payload", async ({
    page,
  }) => {
    await page.goto(`${WEB}/console/audit-explorer`);
    const html = await page.content();
    expect(html).not.toContain("/api/admin/stream");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("REDIS_URL");
  });
});
