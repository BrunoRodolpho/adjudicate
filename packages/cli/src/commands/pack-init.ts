import * as path from "node:path";
import chalk from "chalk";
import { detectWorkspace } from "../lib/workspace.js";
import { renderTemplate } from "../lib/template.js";

export interface PackInitOptions {
  /** Override the parent directory the Pack is created under. */
  readonly target?: string;
  /** Override cwd (test injection point). */
  readonly cwd?: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function isValidPackName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

/**
 * Derive substitution variables from the user-supplied pack name.
 *
 * For `pack-payments-pix`:
 *   packName       → "pack-payments-pix" (npm package + pack.id)
 *   className      → "PaymentsPix"       (TypeScript exported const + types)
 *   intentPrefix   → "payments-pix"      (kebab dot-prefix in intent kinds)
 *
 * For `my-domain` (no pack- prefix):
 *   packName       → "my-domain"
 *   className      → "MyDomain"
 *   intentPrefix   → "my-domain"
 */
function deriveVars(name: string): Readonly<Record<string, string>> {
  const stripped = name.startsWith("pack-") ? name.slice(5) : name;
  return {
    packName: name,
    className: toPascalCase(stripped),
    intentPrefix: stripped,
  };
}

export async function runPackInit(
  name: string,
  options: PackInitOptions = {},
): Promise<void> {
  if (!isValidPackName(name)) {
    console.error(
      chalk.red("✗"),
      `Invalid pack name "${name}". Must match ${NAME_PATTERN}.`,
    );
    process.exit(1);
  }

  const cwd = options.cwd ?? process.cwd();
  const ws = await detectWorkspace(cwd);

  // Target = explicit override, OR workspace's packagesDir (monorepo) /
  // cwd (standalone). Same logical resolution either way.
  const targetParent = options.target ?? ws.packagesDir;
  const targetDir = path.join(targetParent, name);

  const vars = deriveVars(name);

  console.log(chalk.dim("•"), "mode:", chalk.cyan(ws.mode));
  console.log(chalk.dim("•"), "target:", chalk.cyan(targetDir));

  try {
    const result = await renderTemplate({
      templateName: "pack",
      targetDir,
      vars,
    });
    console.log(
      chalk.green("✓"),
      `Scaffolded ${chalk.bold(name)} (${result.written.length} files)`,
    );
    console.log();
    console.log(chalk.dim("Next steps:"));
    console.log(chalk.dim("  cd"), targetDir);
    if (ws.mode === "monorepo") {
      console.log(
        chalk.dim("  pnpm install   "),
        chalk.dim("# from workspace root — picks up the new package automatically"),
      );
    } else {
      console.log(chalk.dim("  pnpm install"));
    }
    console.log(
      chalk.dim("  pnpm test       # runs the conformance test against the scaffolded Pack"),
    );
    console.log(
      chalk.dim("  adjudicate pack lint   # validates against the kernel"),
    );
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red("✗"), e.message);
    process.exit(1);
  }
}
