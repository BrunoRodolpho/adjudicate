/**
 * render-capability-og.ts — render one per-capability OG still per registry
 * entry to `apps/web/public/og/capabilities/<slug>.png`.
 *
 * The composition (`CapabilityDetailOG`) is PARAMETERIZED: props are derived
 * from the {@link CAPABILITIES} registry so the 14 cards stay a barrier — add a
 * capability to the registry and it gets an OG image here, no per-slug script.
 *
 * Rendering strategy:
 *   1. Preferred — programmatic `@remotion/bundler` + `@remotion/renderer`:
 *      bundle the entry ONCE, then loop `renderStill` with per-slug inputProps.
 *      This is far faster than spawning a process per capability.
 *   2. Fallback — if those packages are not resolvable in this workspace, shell
 *      out to the Remotion CLI once per capability:
 *        remotion still video/og-index.ts CapabilityDetailOG \
 *          public/og/capabilities/<slug>.png --props=<json> --frame=0
 *
 * Run via `pnpm --filter @adjudicate/web og:render-capabilities-each`.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../src/content/capabilities";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(SCRIPT_DIR, "..");
const ENTRY = join(WEB_ROOT, "video", "og-index.ts");
const COMPOSITION_ID = "CapabilityDetailOG";
const OUT_DIR = join(WEB_ROOT, "public", "og", "capabilities");

/** The shape `CapabilityDetailOG` consumes — derived from the registry. */
interface CapabilityDetailOGProps {
  readonly name: string;
  readonly family: string;
  readonly oneLiner: string;
  readonly outcomes: ReadonlyArray<string>;
  readonly adrId: string;
  readonly tier: number;
  readonly pkgName: string;
  readonly slug: string;
}

function propsFor(
  cap: (typeof CAPABILITIES)[number],
): CapabilityDetailOGProps {
  return {
    name: cap.name,
    family: cap.family,
    oneLiner: cap.oneLiner,
    outcomes: [...cap.outcomes],
    adrId: cap.adr.id,
    tier: cap.tier,
    pkgName: cap.pkg.name,
    slug: cap.slug,
  };
}

function outPathFor(slug: string): string {
  return join(OUT_DIR, `${slug}.png`);
}

/**
 * Programmatic renderer — bundle once, render every still. Returns `false` if
 * the @remotion packages are not resolvable so the caller can fall back to the
 * CLI. Any OTHER error (a real render failure) is rethrown.
 */
async function renderProgrammatically(): Promise<boolean> {
  let bundle: typeof import("@remotion/bundler").bundle;
  let renderStill: typeof import("@remotion/renderer").renderStill;
  let selectComposition: typeof import("@remotion/renderer").selectComposition;
  try {
    ({ bundle } = await import("@remotion/bundler"));
    ({ renderStill, selectComposition } = await import("@remotion/renderer"));
  } catch {
    return false;
  }

  console.log("Bundling Remotion entry (programmatic renderer)…");
  const serveUrl = await bundle({ entryPoint: ENTRY });

  for (const cap of CAPABILITIES) {
    const inputProps = propsFor(cap);
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    const output = outPathFor(cap.slug);
    await renderStill({
      composition,
      serveUrl,
      output,
      inputProps,
      frame: 0,
      imageFormat: "png",
      overwrite: true,
    });
    console.log(`  ✓ ${cap.slug} → ${output}`);
  }
  return true;
}

/** CLI fallback — one `remotion still` invocation per capability. */
function renderViaCli(): void {
  console.log("Rendering via Remotion CLI (one still per capability)…");
  for (const cap of CAPABILITIES) {
    const inputProps = propsFor(cap);
    const output = outPathFor(cap.slug);
    execFileSync(
      "pnpm",
      [
        "exec",
        "remotion",
        "still",
        ENTRY,
        COMPOSITION_ID,
        output,
        `--props=${JSON.stringify(inputProps)}`,
        "--frame=0",
        "--image-format=png",
      ],
      { cwd: WEB_ROOT, stdio: "inherit" },
    );
    console.log(`  ✓ ${cap.slug} → ${output}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const renderedProgrammatically = await renderProgrammatically();
  if (!renderedProgrammatically) {
    renderViaCli();
  }

  console.log(
    `\nDone — rendered ${CAPABILITIES.length} capability OG stills to ${OUT_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
