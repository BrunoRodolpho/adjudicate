import * as path from "node:path";
import chalk from "chalk";
import { detectWorkspace } from "../lib/workspace.js";
import { renderTemplate } from "../lib/template.js";

export interface PackInitOptions {
  /** Override the parent directory the Pack is created under. */
  readonly target?: string;
  /** Override cwd (test injection point). */
  readonly cwd?: string;
  /**
   * Domain template to scaffold from. Defaults to `"basic"` which produces
   * the minimal hello-world Pack. Domain templates ship richer guard
   * patterns (REWRITE/ESCALATE/DEFER/REQUEST_CONFIRMATION) keyed off the
   * domain shape — see `packages/cli/templates/<name>/` for each layout.
   */
  readonly template?: TemplateName;
}

/**
 * Template registry — the allowlist of templates the CLI honors. The
 * `basic` alias is resolved to the existing `pack/` directory so prior
 * `pack init <name>` invocations keep producing the same output.
 */
export const TEMPLATE_NAMES = [
  "basic",
  "payment",
  "approval",
  "kyc",
  "deployment",
] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

const TEMPLATE_DIR_BY_NAME: Readonly<Record<TemplateName, string>> = {
  basic: "pack",
  payment: "payment",
  approval: "approval",
  kyc: "kyc",
  deployment: "deployment",
};

export function isValidTemplateName(name: string): name is TemplateName {
  return (TEMPLATE_NAMES as ReadonlyArray<string>).includes(name);
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

  const templateRequested = options.template ?? "basic";
  if (!isValidTemplateName(templateRequested)) {
    console.error(
      chalk.red("✗"),
      `Unknown template "${templateRequested}". Available: ${TEMPLATE_NAMES.join(", ")}.`,
    );
    process.exit(1);
  }
  const templateDir = TEMPLATE_DIR_BY_NAME[templateRequested];

  const cwd = options.cwd ?? process.cwd();
  const ws = await detectWorkspace(cwd);

  // Target = explicit override, OR workspace's packagesDir (monorepo) /
  // cwd (standalone). Same logical resolution either way.
  const targetParent = options.target ?? ws.packagesDir;
  const targetDir = path.join(targetParent, name);

  const vars = deriveVars(name);

  console.log(chalk.dim("•"), "mode:", chalk.cyan(ws.mode));
  console.log(chalk.dim("•"), "template:", chalk.cyan(templateRequested));
  console.log(chalk.dim("•"), "target:", chalk.cyan(targetDir));
  console.log(
    chalk.dim("•"),
    `Scaffolding Pack from \`${templateRequested}\` template…`,
  );

  try {
    const result = await renderTemplate({
      templateName: templateDir,
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
      chalk.dim("  pnpm test           # runs the conformance test against the scaffolded Pack"),
    );
    console.log(
      chalk.dim("  pnpm build && pnpm test:scenarios   # runs ./scenarios/*.json against the policy"),
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
