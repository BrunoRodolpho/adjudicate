import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { assertPackConformance } from "@adjudicate/core";

export interface PackLintOptions {
  readonly cwd?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Heuristic Pack-export discovery. Prefers a default export; falls
 * back to the first exported value with the structural shape of a
 * Pack (intents + policy + contract).
 */
function findPackExport(mod: Record<string, unknown>): unknown {
  if (mod.default && isLikelyPack(mod.default)) return mod.default;
  for (const value of Object.values(mod)) {
    if (isLikelyPack(value)) return value;
  }
  return undefined;
}

function isLikelyPack(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  return "intents" in v && "policy" in v && "contract" in v;
}

/**
 * `pack lint` — validates a Pack against the kernel's conformance
 * contract. The CLI does NOT reimplement the lint rules; it asks the
 * kernel via `assertPackConformance`. Single source of truth for what
 * a "valid Pack" means.
 *
 * The dynamic import requires `@adjudicate/core` to be built (its
 * `dist/` must exist for workspace symlink resolution). When run
 * via `pnpm adjudicate` (workspace dev) or `npm install -g
 * @adjudicate/cli` (published), the loader handles the .ts file
 * via tsx.
 */
export async function runPackLint(
  packPath?: string,
  options: PackLintOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const packDir = path.resolve(cwd, packPath ?? ".");
  const indexPath = path.join(packDir, "src", "index.ts");

  if (!(await fileExists(indexPath))) {
    console.error(
      chalk.red("✗"),
      `No src/index.ts found at ${chalk.bold(packDir)}`,
    );
    process.exit(1);
  }

  let mod: Record<string, unknown>;
  try {
    // file:// URL for cross-platform import; .ts loaded via the active
    // tsx loader (when running via `pnpm adjudicate`) or compiled
    // dist (when running the published bin).
    mod = (await import(`file://${indexPath}`)) as Record<string, unknown>;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(
      chalk.red("✗"),
      `Failed to import ${indexPath}: ${e.message}`,
    );
    console.error(
      chalk.dim(
        "  Hint: ensure @adjudicate/core is built (`pnpm -r build` from workspace root).",
      ),
    );
    process.exit(1);
  }

  const pack = findPackExport(mod);
  if (!pack) {
    console.error(
      chalk.red("✗"),
      `No Pack export found in ${indexPath}.`,
    );
    console.error(
      chalk.dim(
        "  The CLI looks for a default export OR an exported object with intents+policy+contract.",
      ),
    );
    process.exit(1);
  }

  try {
    assertPackConformance(pack as never);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red("✗"), `Pack conformance failed:`);
    console.error(chalk.dim("  " + e.message));
    process.exit(1);
  }

  const p = pack as {
    id: string;
    intents: readonly string[];
    basisCodes: readonly string[];
  };
  console.log(
    chalk.green("✓"),
    `Pack ${chalk.bold(p.id)} passes kernel conformance`,
  );
  console.log(chalk.dim("  intents:    "), p.intents.length);
  console.log(chalk.dim("  basis codes:"), p.basisCodes.length);
}
