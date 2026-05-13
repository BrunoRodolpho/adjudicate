import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { assertPackConformance } from "@adjudicate/core";
import { loadPackFromModule } from "../lib/pack-loader.js";

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

  let pack: unknown;
  try {
    pack = await loadPackFromModule(indexPath, cwd);
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
