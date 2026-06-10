import { test } from "@playwright/test";
import fs from "node:fs";

/**
 * UI/UX audit crawl — captures full-page screenshots of every reachable web
 * route at desktop / tablet / mobile widths (+ a desktop above-the-fold), into
 * audit-artifacts/screenshots/. Driven by the playwright.config webServer so the
 * dev server boots reliably. Not a correctness test — a screenshot harness.
 */
const WEB = "http://localhost:5181";

const ROUTES = [
  // top-level
  "/", "/how-it-works", "/deploy", "/playground", "/capabilities", "/console",
  "/architecture", "/architecture/data-flow", "/comparisons", "/introspection",
  "/transparency", "/blog", "/roadmap", "/contribute", "/recipes",
  // console replicas
  "/console/audit-explorer", "/console/dashboard", "/console/drift", "/console/red-team",
  "/console/ai-bom", "/console/integrity", "/console/tokens", "/console/approvals",
  "/console/command-risk",
  "/console/decision/6b865891a8dee91a453b0612c476121579af85a23ed4094f18d0d5a81f46be45",
  // capabilities (all 14)
  "/capabilities/pii-guard", "/capabilities/token-budget-guard", "/capabilities/release-gating",
  "/capabilities/command-risk-guard", "/capabilities/red-team", "/capabilities/behavioral-drift",
  "/capabilities/hallucination-scoring", "/capabilities/ai-bom", "/capabilities/config-integrity-seal",
  "/capabilities/policy-coherence-analyzer", "/capabilities/smart-approval-engine",
  "/capabilities/agent-memory-store", "/capabilities/incident-response-pack",
  "/capabilities/access-governance-pack",
  // recipes (all 8)
  "/recipes/over-refund-clamp", "/recipes/block-dangerous-commands", "/recipes/redact-pii",
  "/recipes/cap-token-spend", "/recipes/pause-for-human", "/recipes/gate-prod-deploys",
  "/recipes/least-privilege-access", "/recipes/cap-blast-radius",
  // transparency (all 7)
  "/transparency/pii", "/transparency/ai-bom", "/transparency/drift", "/transparency/red-team",
  "/transparency/command-risk", "/transparency/tokens", "/transparency/integrity",
  // blog (all 4)
  "/blog/launching-adjudicate", "/blog/stop-agent-draining-prod",
  "/blog/human-approval-resume", "/blog/cap-token-spend",
];

function slug(r: string): string {
  return r === "/" ? "home" : r.replace(/^\//, "").replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "-");
}

const HIDE = "#__next-build-watcher,nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay]{display:none!important}";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, fold: true },
  { name: "tablet", width: 768, height: 1024, fold: false },
  { name: "mobile", width: 390, height: 844, fold: false },
] as const;

test.describe.configure({ mode: "parallel" });

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const route of ROUTES) {
      test(`${vp.name} ${route}`, async ({ page }) => {
        test.setTimeout(90_000);
        const dir = `audit-artifacts/screenshots/${vp.name}`;
        fs.mkdirSync(dir, { recursive: true });
        const s = slug(route);
        await page.goto(WEB + route, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(1_000);
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        if (vp.fold) {
          await page.screenshot({ path: `${dir}/${s}__fold.png` });
        }
        await page.screenshot({ path: `${dir}/${s}.png`, fullPage: true });
      });
    }
  });
}
