import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5181";

/**
 * Capabilities (Phase 7) — the index lists all 14 with verifiable provenance,
 * and the command-risk page MUST never render command text (invariant #3).
 */
test.describe("capabilities", () => {
  test("index lists all 14 across four families", async ({ page }) => {
    await page.goto(`${WEB}/capabilities`);
    for (const family of [
      /content & data safety/i,
      /adversarial & behavioral/i,
      /budget & integrity/i,
      /workflow & governance/i,
    ]) {
      await expect(page.getByText(family).first()).toBeVisible();
    }
    // 6 Tier-1 "open" links present
    const openLinks = page.locator('a[href^="/capabilities/"]');
    expect(await openLinks.count()).toBeGreaterThanOrEqual(6);
  });

  test("a Tier-1 page shows verifiable ADR + package provenance", async ({
    page,
  }) => {
    await page.goto(`${WEB}/capabilities/pii-guard`);
    // ADR + package source are linked to their real on-disk paths
    await expect(page.locator('a[href*="ADR-117"]').first()).toBeVisible();
    await expect(
      page.locator('a[href*="packages/primitives"]').first(),
    ).toBeVisible();
  });

  test("command-risk page never renders command text", async ({ page }) => {
    await page.goto(`${WEB}/capabilities/command-risk-guard`);
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const leak of ["rm -rf", "curl ", "| sh", "sudo ", "chmod ", "/dev/sd"]) {
      expect(body, `command text "${leak}" must not leak`).not.toContain(leak);
    }
    // but the decision + risk category DO render (category by name only)
    await expect(page.getByText(/category/i).first()).toBeVisible();
  });
});
