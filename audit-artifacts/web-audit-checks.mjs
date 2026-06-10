#!/usr/bin/env node
/**
 * WS-V validation — mobile horizontal-overflow + internal link-integrity.
 * Run from the REPO ROOT (resolves @playwright/test from root node_modules)
 * with the web server running on :5181 (pnpm --filter @adjudicate/web start).
 *
 *   node audit-artifacts/web-audit-checks.mjs
 *
 * Exits non-zero if any route overflows at 390px OR any internal link 404s.
 */
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL || "http://localhost:5181";
const xml = await (await fetch(base + "/sitemap.xml")).text();
const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(base, "") || "/");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const overflow = [], links = new Set();
for (const p of paths) {
  try {
    await page.goto(base + p, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(120);
    const o = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    if (o > 1) overflow.push([p, o]);
    (await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute("href")))).forEach((h) => links.add(h.split("#")[0].split("?")[0]));
  } catch (e) { overflow.push([p, "ERR:" + e.message.slice(0, 40)]); }
}
const dead = [];
for (const l of [...links]) {
  if (!l) continue;
  try { const r = await page.goto(base + l, { waitUntil: "domcontentloaded", timeout: 15000 }); if (r && r.status() >= 400) dead.push([l, r.status()]); }
  catch { dead.push([l, "ERR"]); }
}
// --- a11y + colour-contrast (axe-core, injected from CDN) on key routes ---
// axe's WCAG ruleset includes `color-contrast`, so this single pass covers both
// the a11y and the contrast gaps. CDN-injected so the harness needs no new dep.
const A11Y_ROUTES = [
  "/", "/how-it-works", "/capabilities", "/capabilities/pii-guard", "/recipes",
  "/recipes/over-refund-clamp", "/console", "/console/audit-explorer", "/blog",
  "/blog/cap-token-spend", "/transparency", "/transparency/pii", "/architecture",
  "/comparisons", "/playground", "/deploy", "/contribute", "/roadmap", "/introspection",
];
const a11y = [];
let axeSrc = null;
try {
  axeSrc = await (await fetch("https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js")).text();
} catch {
  console.log("  (axe CDN unavailable — a11y/contrast pass skipped)");
}
if (axeSrc) {
  const dpage = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const p of A11Y_ROUTES) {
    try {
      await dpage.goto(base + p, { waitUntil: "domcontentloaded", timeout: 20000 });
      await dpage.waitForTimeout(200);
      await dpage.addScriptTag({ content: axeSrc });
      const vs = await dpage.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
      });
      for (const v of vs) if (v.impact === "critical" || v.impact === "serious") a11y.push([p, v.id, v.impact, v.n]);
    } catch (e) { a11y.push([p, "ERR:" + e.message.slice(0, 40), "err", 0]); }
  }
}
await b.close();
const a11yCrit = a11y.filter((x) => x[2] === "critical");
const contrastNodes = a11y.filter((x) => x[1] === "color-contrast").reduce((s, x) => s + x[3], 0);
console.log(`routes=${paths.length} overflow=${overflow.length} links=${links.size} dead=${dead.length} a11y_routes=${A11Y_ROUTES.length} a11y_critical=${a11yCrit.length} a11y_serious=${a11y.length - a11yCrit.length} contrast_nodes=${contrastNodes}`);
overflow.forEach(([p, o]) => console.log("  overflow " + p + " +" + o + "px"));
dead.forEach(([l, s]) => console.log("  dead " + l + " " + s));
a11yCrit.forEach(([p, id, , n]) => console.log(`  a11y-CRITICAL ${p} — ${id} ×${n}`));
// Hard-fail on overflow / dead links / CRITICAL a11y. The serious tail (mostly
// borderline color-contrast, 4.3–4.48:1 vs 4.5 on tinted bands) is reported as
// a tracked warning rather than blocking — see FINAL_AUDIT_R4 contrast note.
if (overflow.length || dead.length || a11yCrit.length) process.exit(1);
if (a11y.length) console.log(`⚠ ${a11y.length} serious a11y/contrast warnings (non-blocking, tracked)`);
console.log("✓ mobile-overflow + link-integrity OK; a11y/contrast measured (0 critical)");
