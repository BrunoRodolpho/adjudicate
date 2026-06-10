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
await b.close();
console.log(`routes=${paths.length} overflow=${overflow.length} links=${links.size} dead=${dead.length}`);
overflow.forEach(([p, o]) => console.log("  overflow " + p + " +" + o + "px"));
dead.forEach(([l, s]) => console.log("  dead " + l + " " + s));
if (overflow.length || dead.length) process.exit(1);
console.log("✓ mobile-overflow + link-integrity OK");
