import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Workspace detection.
 *
 * Walks up from cwd looking for `pnpm-workspace.yaml` with a `packages:`
 * glob. When found, returns `monorepo` mode with the workspace root and
 * the canonical packages directory. When not found, returns `standalone`
 * mode with cwd as the target.
 *
 * The detection is intentionally minimal — we only need to know:
 *   1. Is there a workspace file with a `packages/*`-shaped glob?
 *   2. Where is the workspace root?
 *
 * Edge cases not handled (deliberate Phase 3a scope):
 *   - Workspaces with `packages:` globs other than `packages/*`
 *     (e.g., `apps/*` only). Adopters with custom layouts pass --target.
 *   - Yarn / npm workspaces. pnpm-only for now; the package's manifest
 *     is the single signal we look for.
 */

export type WorkspaceMode = "monorepo" | "standalone";

export interface WorkspaceContext {
  readonly mode: WorkspaceMode;
  /** Root of the workspace (monorepo) or cwd (standalone). */
  readonly rootDir: string;
  /** Canonical directory new Packs land in. */
  readonly packagesDir: string;
}

const PACKAGES_GLOB = /^\s*-\s*["']?packages\/\*["']?\s*$/m;

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function detectWorkspace(
  startDir: string = process.cwd(),
): Promise<WorkspaceContext> {
  let dir = path.resolve(startDir);
  // Walk up until filesystem root.
  while (dir !== path.dirname(dir)) {
    const wsFile = path.join(dir, "pnpm-workspace.yaml");
    if (await fileExists(wsFile)) {
      const content = await fs.readFile(wsFile, "utf8");
      // Cheap parse — pnpm-workspace.yaml has predictable shape. We
      // look for the `packages/*` glob; absent that, we treat it as a
      // workspace with non-canonical layout and fall back to standalone.
      if (PACKAGES_GLOB.test(content)) {
        return {
          mode: "monorepo",
          rootDir: dir,
          packagesDir: path.join(dir, "packages"),
        };
      }
    }
    dir = path.dirname(dir);
  }
  return {
    mode: "standalone",
    rootDir: startDir,
    packagesDir: startDir,
  };
}
