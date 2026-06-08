import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Playground (Phase 7) — the rebuilt Guided + Sandbox modes run the REAL kernel.
 * Asserts a Guided step actually hits /api/playground/adjudicate and renders a
 * real decision, and that the Sandbox surfaces a schema-aware form (not raw JSON
 * up front).
 */
test.describe("playground runs the real kernel", () => {
  test("guided step produces a real audited decision", async ({ page }) => {
    await page.goto(`${WEB}/playground`);
    // defaults to Guided — open a scenario
    const card = page.getByRole("button", { name: /refund/i }).first();
    await expect(card).toBeVisible();
    await card.click();

    const runBtn = page.getByRole("button", { name: /run/i }).first();
    await expect(runBtn).toBeVisible();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/playground/adjudicate"),
        { timeout: 30_000 },
      ),
      runBtn.click(),
    ]);
    expect(resp.status()).toBe(200);
    // a real decision outcome renders (label is uppercased via CSS, so the DOM
    // text is title-case — match case-insensitively)
    await expect(
      page
        .getByText(/rewrite|execute|request confirmation|refuse|defer|escalate/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sandbox renders a schema-aware form with raw JSON demoted", async ({
    page,
  }) => {
    await page.goto(`${WEB}/playground`);
    const tab = page.getByRole("tab", { name: /configure|sandbox|test/i }).first();
    await tab.click();
    // a real form control exists (not a bare JSON textarea up front)
    await expect(page.locator("input, select").first()).toBeVisible();
    // raw JSON is present but demoted behind an "Advanced" disclosure
    await expect(page.getByText(/advanced.*raw json/i)).toBeVisible();
  });
});
