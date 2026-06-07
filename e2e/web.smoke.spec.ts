import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Public web smoke E2E (ADR-128) — verifies the marketing site boots and the
 * public, aggregates-only transparency surface renders its privacy contract.
 */
test.describe("public web", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto(`${WEB}/`);
    await expect(page.locator("main")).toBeVisible();
  });

  test("transparency page states the aggregates-only contract", async ({ page }) => {
    await page.goto(`${WEB}/transparency`);
    await expect(
      page.getByRole("heading", { name: /governance in the open/i }),
    ).toBeVisible();
    await expect(page.getByText(/aggregates only/i)).toBeVisible();
    await expect(page.getByText(/small-cohort floor/i)).toBeVisible();
  });
});
