import { test, expect } from "@playwright/test";

const CONSOLE = "http://localhost:5180";

/**
 * Console smoke E2E (ADR-128) — verifies the operator console shell boots and
 * the Phase-A a11y/responsive affordances work in a real browser.
 */
test.describe("operator console", () => {
  test("loads the Audit Explorer with a focusable main landmark", async ({ page }) => {
    await page.goto(`${CONSOLE}/`);
    await expect(page).toHaveTitle(/console/i);
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("skip link is the first focusable element", async ({ page }) => {
    await page.goto(`${CONSOLE}/`);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: /skip to main content/i }),
    ).toBeFocused();
  });

  test("primary navigation collapses and expands", async ({ page }) => {
    await page.goto(`${CONSOLE}/`);
    await page.getByRole("button", { name: /collapse navigation/i }).click();
    await expect(
      page.getByRole("button", { name: /expand navigation/i }),
    ).toBeVisible();
  });
});
