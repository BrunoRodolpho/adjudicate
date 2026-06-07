import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test harness (ADR-128). Neither app had E2E coverage before this.
 * Playwright drives the real Next.js apps:
 *   - operator console  → http://localhost:5180
 *   - public web        → http://localhost:5181
 *
 * `webServer` boots both dev servers (reused locally, fresh in CI). Browsers are
 * NOT bundled — run `pnpm e2e:install` once to download them, then `pnpm e2e`.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @adjudicate/console dev",
      url: "http://localhost:5180",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @adjudicate/web dev",
      url: "http://localhost:5181",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
