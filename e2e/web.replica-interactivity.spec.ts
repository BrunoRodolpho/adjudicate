import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Console-replica interactivity (nice-to-haves) — the analytics replicas became
 * client-interactive over the committed fixtures. Verifies the interactions work
 * and that the command-risk invariant holds across filter states.
 */
test.describe("console replica interactivity", () => {
  test("ai-bom: clicking a pack in the rail switches the detail pane", async ({
    page,
  }) => {
    await page.goto(`${WEB}/console/ai-bom`);
    const heading = page.getByTestId("aibom-detail-heading");
    await expect(heading).toBeVisible();
    const before = (await heading.innerText()).trim();
    const railButtons = page.locator('[data-testid="aibom-rail"] button');
    expect(await railButtons.count()).toBeGreaterThan(1);
    await railButtons.nth(1).click();
    await expect(heading).not.toHaveText(before); // retries until the client swap lands
    // still inside the illustrative chrome
    await expect(page.getByText(/illustrative replica/i)).toBeVisible();
  });

  test("command-risk: category filter never reveals command text", async ({
    page,
  }) => {
    await page.goto(`${WEB}/console/command-risk`);
    const leaks = ["rm -rf", "curl ", "| sh", "sudo ", "chmod ", "/dev/sd"];
    // baseline + every category filter must stay command-text-free
    for (const name of [/destructive/i, /credential/i, /network/i, /all/i]) {
      const radio = page.getByRole("radio", { name }).first();
      if (await radio.count()) {
        await radio.click();
        await expect(radio).toBeChecked();
      }
      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const leak of leaks) {
        expect(body, `"${leak}" must not leak under ${name}`).not.toContain(leak);
      }
    }
  });

  test("approvals: tabs switch the visible panel", async ({ page }) => {
    await page.goto(`${WEB}/console/approvals`);
    const resolved = page.getByRole("tab", { name: /resolved/i }).first();
    await expect(resolved).toBeVisible();
    await resolved.click();
    await expect(resolved).toHaveAttribute("aria-selected", "true");
    // the display-only banner stays visible in every tab
    await expect(page.getByTestId("approvals-display-only-banner")).toBeVisible();
  });

  test("per-capability OG image is wired into metadata", async ({ page }) => {
    await page.goto(`${WEB}/capabilities/pii-guard`);
    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveAttribute("content", /og\/capabilities\/pii-guard\.png/);
  });
});
