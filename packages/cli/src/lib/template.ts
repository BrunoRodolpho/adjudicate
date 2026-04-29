import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Template renderer.
 *
 * Templates live as `.tpl` files under `packages/cli/templates/`. They
 * contain `{{placeholder}}` markers that get substituted at render time.
 * The renderer copies the directory tree, reads each `.tpl` file,
 * substitutes, and writes the rendered file at the target — STRIPPING
 * the `.tpl` suffix so `package.json.tpl` becomes `package.json`.
 *
 * Substitution is a simple `String.prototype.replaceAll` chain — no
 * Handlebars / Mustache dep. Placeholders are documented per template
 * file at the top.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Templates ship adjacent to the source. After build, they live next to
 * `dist/`; in dev (`tsx` loading source), they live next to `src/`. We
 * walk up from the calling module to find them.
 */
function findTemplatesRoot(): string {
  // From `packages/cli/src/lib/template.ts` → `../../templates`
  // From `packages/cli/dist/lib/template.js` → `../../templates`
  return path.resolve(__dirname, "..", "..", "templates");
}

export type TemplateVars = Readonly<Record<string, string>>;

export interface RenderTemplateOptions {
  readonly templateName: string;
  readonly targetDir: string;
  readonly vars: TemplateVars;
  /**
   * When true, fails if any target file already exists. Default `true` —
   * `pack init` should not silently clobber existing files.
   */
  readonly failOnConflict?: boolean;
}

export interface RenderResult {
  readonly written: readonly string[];
}

function substitute(content: string, vars: TemplateVars): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

async function* walkDir(root: string, relPrefix = ""): AsyncGenerator<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const rel = path.join(relPrefix, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full, rel);
    } else if (entry.isFile()) {
      yield rel;
    }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function renderTemplate(
  opts: RenderTemplateOptions,
): Promise<RenderResult> {
  const templateDir = path.join(findTemplatesRoot(), opts.templateName);
  const failOnConflict = opts.failOnConflict ?? true;
  const written: string[] = [];

  if (!(await fileExists(templateDir))) {
    throw new Error(
      `[template] template directory not found: ${templateDir}`,
    );
  }

  await fs.mkdir(opts.targetDir, { recursive: true });

  for await (const rel of walkDir(templateDir)) {
    const sourcePath = path.join(templateDir, rel);
    // Strip .tpl suffix from output filename. `package.json.tpl` → `package.json`.
    const relStripped = rel.endsWith(".tpl") ? rel.slice(0, -4) : rel;
    const targetPath = path.join(opts.targetDir, relStripped);

    if (failOnConflict && (await fileExists(targetPath))) {
      throw new Error(
        `[template] target file already exists: ${targetPath}`,
      );
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const raw = await fs.readFile(sourcePath, "utf8");
    const rendered = substitute(raw, opts.vars);
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(targetPath);
  }

  return { written };
}
