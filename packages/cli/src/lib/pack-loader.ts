/**
 * Pack discovery — shared resolution logic for `pack lint` and `simulate`.
 *
 * Convention: a "Pack" is a value with the structural shape of `PackV0`
 * (carries `intents`, `policy`, `contract`). The CLI does not require a
 * specific export name — it prefers `default` if present, otherwise the
 * first named export that matches the structural shape.
 *
 * Module spec interpretation:
 *   - Bare specifier (`@adjudicate/pack-payments-pix`, `my-pack`):
 *     resolved by Node's module resolution. Works for npm-installed
 *     packages and workspace symlinks.
 *   - Path specifier (`./packs/my-pack`, `/abs/path/pack`): converted
 *     to a `file://` URL before `import()` so cross-platform path
 *     handling is consistent.
 *   - Directory path: caller resolves to a concrete entry file first
 *     (e.g., `<dir>/src/index.ts`); this module doesn't probe for
 *     conventional locations.
 *
 * The dynamic `import()` requires the loaded module to resolve its own
 * dependencies — typically that means `@adjudicate/core` must be built
 * (its `dist/` must exist for workspace symlinks). The published CLI
 * runs against the built CLI bin; the dev path runs via tsx and the
 * pack source. Either way, the loader is unaware of the distinction.
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";

export function isLikelyPack(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  return "intents" in v && "policy" in v && "contract" in v;
}

export function findPackExport(mod: Record<string, unknown>): unknown {
  if (mod.default && isLikelyPack(mod.default)) return mod.default;
  for (const value of Object.values(mod)) {
    if (isLikelyPack(value)) return value;
  }
  return undefined;
}

/**
 * Resolve a module spec to a form `import()` accepts cross-platform.
 *
 * Bare specifiers pass through unchanged. Relative and absolute paths
 * become `file://` URLs — Node ESM requires this for paths on macOS
 * and Linux, and Windows requires it for both drive letters and
 * forward slashes to resolve correctly.
 */
export function resolveModuleSpec(spec: string, cwd: string): string {
  if (spec.startsWith(".") || spec.startsWith("/") || /^[A-Za-z]:[\\/]/.test(spec)) {
    return pathToFileURL(path.resolve(cwd, spec)).href;
  }
  return spec;
}

/**
 * Load a Pack from a module spec. Returns the Pack value, or `undefined`
 * if no Pack-shaped export is found. Surfaces import errors as thrown
 * `Error`s — caller decides how to report them.
 */
export async function loadPackFromModule(
  spec: string,
  cwd: string,
): Promise<unknown> {
  const resolved = resolveModuleSpec(spec, cwd);
  const mod = (await import(resolved)) as Record<string, unknown>;
  return findPackExport(mod);
}
