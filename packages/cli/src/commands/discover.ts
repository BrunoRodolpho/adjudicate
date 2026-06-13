import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { detectWorkspace } from "../lib/workspace.js";
import { renderTemplate } from "../lib/template.js";
import {
  listMcpTools,
  type FetchToolList,
  type McpTool,
} from "../lib/mcp-client.js";
import {
  buildDiscoverVars,
  renderDiscoverBlocks,
  renderScenarioFiles,
} from "../lib/discover-codegen.js";

/**
 * `adjudicate discover <mcp-endpoint>` — build-time command.
 *
 * Connects to an MCP server over HTTP/SSE, calls `tools/list`, and
 * scaffolds a CONFORMANT, deny-by-default adjudicate Pack from the
 * advertised tools. Every discovered tool becomes a MUTATING intent kind
 * gated by a REFUSE guard; `policy.default` is REFUSE; one REFUSE
 * scenario is emitted per tool. The generated Pack passes
 * `assertPackConformance` and `runConformance` out of the box but
 * authorizes nothing — the operator hardens it from a known-safe floor.
 *
 * v1 scope: HTTP/SSE transport only (stdio deferred).
 */

export interface DiscoverOptions {
  /** Pack name to scaffold. Defaults to a name derived from the endpoint. */
  readonly name?: string;
  /** Override the parent directory the Pack is created under. */
  readonly target?: string;
  /** Override cwd (test injection point). */
  readonly cwd?: string;
  /**
   * Injectable MCP transport. Defaults to the built-in HTTP/SSE client.
   * Tests pass a stub returning a canned tool list — NO network.
   */
  readonly fetchToolList?: FetchToolList;
  /** stdout sink (test injection point). Defaults to `console.log`. */
  readonly stdout?: (line: string) => void;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

/**
 * Derive a default kebab pack name from an MCP endpoint. `https://
 * api.example.com/mcp` → `pack-example-com-mcp`. Falls back to
 * `pack-mcp-discovered` when nothing usable can be extracted.
 */
export function deriveNameFromEndpoint(endpoint: string): string {
  let host = endpoint;
  try {
    const url = new URL(endpoint);
    host = `${url.hostname}${url.pathname}`;
  } catch {
    // Non-URL endpoint — sanitize the raw string.
  }
  const slug = host
    .toLowerCase()
    .replace(/^https?-?/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  const base = slug.length > 0 ? slug : "mcp-discovered";
  return `pack-${base}`;
}

interface DeriveVarsResult {
  readonly packName: string;
  readonly className: string;
  readonly intentPrefix: string;
}

function deriveVars(name: string): DeriveVarsResult {
  const stripped = name.startsWith("pack-") ? name.slice(5) : name;
  return {
    packName: name,
    className: toPascalCase(stripped),
    intentPrefix: stripped,
  };
}

export async function runDiscover(
  endpoint: string,
  options: DiscoverOptions = {},
): Promise<void> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));

  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    console.error(chalk.red("✗"), "An MCP endpoint is required.");
    process.exit(1);
  }

  const name = options.name ?? deriveNameFromEndpoint(endpoint);
  if (!NAME_PATTERN.test(name)) {
    console.error(
      chalk.red("✗"),
      `Invalid pack name "${name}". Must match ${NAME_PATTERN}. Pass --name to override.`,
    );
    process.exit(1);
  }

  // ── 1. Discover tools via the (injectable) MCP transport. ──────────
  let tools: ReadonlyArray<McpTool>;
  try {
    tools = await listMcpTools(endpoint, options.fetchToolList);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red("✗"), `MCP discovery failed: ${e.message}`);
    process.exit(1);
  }

  if (tools.length === 0) {
    console.error(
      chalk.red("✗"),
      `MCP endpoint ${endpoint} advertised no tools — nothing to scaffold.`,
    );
    process.exit(1);
  }

  // ── 2. Codegen — pure derivation of vars + dynamic source blocks. ──
  const baseVars = deriveVars(name);
  const vars = buildDiscoverVars(
    baseVars.packName,
    baseVars.className,
    baseVars.intentPrefix,
    tools,
  );
  const blocks = renderDiscoverBlocks(vars);

  // ── 3. Resolve target directory (same logic as `pack init`). ───────
  const cwd = options.cwd ?? process.cwd();
  const ws = await detectWorkspace(cwd);
  const targetParent = options.target ?? ws.packagesDir;
  const targetDir = path.join(targetParent, name);

  stdout(`${chalk.dim("•")} endpoint: ${chalk.cyan(endpoint)}`);
  stdout(`${chalk.dim("•")} discovered: ${chalk.cyan(String(tools.length))} tool(s)`);
  stdout(`${chalk.dim("•")} intents: ${chalk.cyan(String(vars.intents.length))} (deduped)`);
  stdout(`${chalk.dim("•")} target: ${chalk.cyan(targetDir)}`);

  // ── 4. Render the static template set with the dynamic blocks. ─────
  try {
    const result = await renderTemplate({
      templateName: "discover",
      targetDir,
      vars: {
        packName: vars.packName,
        className: vars.className,
        intentPrefix: vars.intentPrefix,
        intentKindUnionBlock: blocks.intentKindUnionBlock,
        toolClassificationBlock: blocks.toolClassificationBlock,
        guardsBlock: blocks.guardsBlock,
        businessListBlock: blocks.businessListBlock,
        packIntentsBlock: blocks.packIntentsBlock,
        basisCodesBlock: blocks.basisCodesBlock,
      },
    });

    // ── 5. Write one REFUSE scenario per discovered tool. ────────────
    const scenariosDir = path.join(targetDir, "scenarios");
    await fs.mkdir(scenariosDir, { recursive: true });
    const scenarios = renderScenarioFiles(vars);
    for (const scenario of scenarios) {
      await fs.writeFile(
        path.join(scenariosDir, scenario.filename),
        scenario.contents,
        "utf8",
      );
    }

    const written = result.written.length + scenarios.length;
    stdout(
      `${chalk.green("✓")} Scaffolded ${chalk.bold(name)} (${written} files, ${scenarios.length} REFUSE scenarios)`,
    );
    stdout("");
    stdout(chalk.dim("Generated a DENY-BY-DEFAULT scaffold — it authorizes nothing yet."));
    stdout(chalk.dim("Next steps:"));
    stdout(`${chalk.dim("  cd")} ${targetDir}`);
    if (ws.mode === "monorepo") {
      stdout(
        `${chalk.dim("  pnpm install   ")}${chalk.dim("# from workspace root — picks up the new package")}`,
      );
    } else {
      stdout(chalk.dim("  pnpm install"));
    }
    stdout(chalk.dim("  pnpm test           # runs conformance against the generated Pack"));
    stdout(chalk.dim("  # then replace each refuse* guard in src/policy.ts with real logic"));
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red("✗"), e.message);
    process.exit(1);
  }
}
