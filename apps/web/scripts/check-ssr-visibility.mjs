#!/usr/bin/env node
/**
 * WS-A regression guard — "content is visible without JavaScript."
 *
 * Scans the prerendered HTML under .next/server/app for fully-invisible inline
 * `opacity:0` styles. The marketing site's reveal/motion layer must enhance an
 * already-visible baseline (transform-only hidden states), never gate whether
 * content EXISTS — so the server HTML must never ship content at opacity:0.
 * Dimmed states (opacity:0.3 / 0.35) are intentional and allowed.
 *
 * Run after `next build`:  node scripts/check-ssr-visibility.mjs
 * Exits non-zero (fails CI) if any route ships fully-invisible content.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = ".next/server/app";

// Match a fully-zero opacity inline style only (not opacity:0.3 etc.).
const ZERO_OPACITY = /opacity:0(?=["';\s])/g;

let files;
try {
  files = globSync(`${APP_DIR}/**/*.html`);
} catch {
  console.error(
    `[check-ssr-visibility] could not read ${APP_DIR} — run \`next build\` first.`,
  );
  process.exit(2);
}

if (!files.length) {
  console.error(
    `[check-ssr-visibility] no prerendered HTML in ${APP_DIR} — run \`next build\` first.`,
  );
  process.exit(2);
}

const offenders = [];
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const hits = (html.match(ZERO_OPACITY) || []).length;
  if (hits > 0) offenders.push({ file: file.replace(`${APP_DIR}/`, ""), hits });
}

if (offenders.length) {
  console.error(
    `\n✗ WS-A regression: ${offenders.length} prerendered route(s) ship fully-invisible (opacity:0) content:\n`,
  );
  for (const o of offenders) console.error(`  ${o.file}  (${o.hits})`);
  console.error(
    `\nReveal/motion hidden states must be transform-only (no opacity:0) so SSR/no-JS/crawlers see content. See src/lib/motion.ts.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ SSR visibility OK — ${files.length} prerendered routes, 0 fully-invisible content elements.`,
);
