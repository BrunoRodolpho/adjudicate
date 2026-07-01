/**
 * Pre-publish version consistency check.
 *
 * Validates:
 *   1. Every `@adjudicate/*` workspace package has a non-empty,
 *      semver-shaped `version` field in its `package.json`.
 *   2. No two `@adjudicate/*` packages declare contradictory peer
 *      dep ranges against each other (e.g., `@adjudicate/audit`
 *      pinning `@adjudicate/core: ^0.5.0` while `core/package.json`
 *      says `1.0.0`).
 *   3. `@adjudicate/cli` `bin.ts` does NOT hardcode a `.version("…")` string
 *      literal — it must derive its advertised version from package.json at
 *      runtime, so the two can never drift (a stale literal previously broke
 *      the changesets release PR, which bumps package.json but not source).
 *
 * Designed to run pre-publish; exits non-zero on any inconsistency.
 *
 *   pnpm tsx scripts/check-versions.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const PACKAGES_DIR = join(import.meta.dirname ?? "scripts", "..", "packages");

function findPackageDirs(): string[] {
  return readdirSync(PACKAGES_DIR).filter((entry) => {
    const fullPath = join(PACKAGES_DIR, entry);
    try {
      const st = statSync(fullPath);
      if (!st.isDirectory()) return false;
      const pjPath = join(fullPath, "package.json");
      return statSync(pjPath).isFile();
    } catch {
      return false;
    }
  });
}

function readPkg(name: string): PackageJson {
  const pjPath = join(PACKAGES_DIR, name, "package.json");
  return JSON.parse(readFileSync(pjPath, "utf-8")) as PackageJson;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

const errors: string[] = [];

const packageDirs = findPackageDirs();
const pkgByName = new Map<string, PackageJson>();
for (const dir of packageDirs) {
  const pj = readPkg(dir);
  pkgByName.set(pj.name, pj);
}

for (const [name, pj] of pkgByName) {
  if (!SEMVER_RE.test(pj.version)) {
    errors.push(
      `${name}: version "${pj.version}" is not a clean semver string`,
    );
  }
}

// Cross-package dep consistency. Workspace deps use `workspace:*` so
// they always resolve to whatever the linked package ships; we only
// flag fixed-range declarations against in-repo packages.
function checkDepConsistency(
  src: string,
  deps: Record<string, string> | undefined,
  kind: "dependencies" | "peerDependencies" | "devDependencies",
): void {
  if (!deps) return;
  for (const [depName, range] of Object.entries(deps)) {
    if (!pkgByName.has(depName)) continue;
    if (range.startsWith("workspace:")) continue;
    const target = pkgByName.get(depName)!;
    // Reject hard-pinned outside the workspace marker — adopters relying on
    // this check expect every in-repo cross-package edge to be `workspace:*`.
    errors.push(
      `${src}: ${kind}["${depName}"] = "${range}" but workspace package version is "${target.version}". Use "workspace:*" for in-repo packages.`,
    );
  }
}

for (const [name, pj] of pkgByName) {
  checkDepConsistency(name, pj.dependencies, "dependencies");
  checkDepConsistency(name, pj.peerDependencies, "peerDependencies");
  checkDepConsistency(name, pj.devDependencies, "devDependencies");
}

// CLI version derivation. bin.ts must NOT hardcode a `.version("x.y.z")` string
// literal — it must read the version from package.json at runtime so the advertised
// version can never drift from the published one. A hardcoded literal is exactly the
// drift that broke the changesets release PR (package.json bumped, source not).
try {
  const cliBin = readFileSync(
    join(PACKAGES_DIR, "cli", "src", "bin.ts"),
    "utf-8",
  );
  const hardcoded = /\.version\(\s*"[^"]+"\s*\)/.exec(cliBin);
  if (hardcoded) {
    errors.push(
      `@adjudicate/cli: bin.ts hardcodes a .version() string literal (${hardcoded[0]}); derive the version from package.json at runtime (e.g. readFileSync(new URL("../package.json", import.meta.url))) so it cannot drift.`,
    );
  } else if (!/\.version\(/.test(cliBin)) {
    errors.push(
      `@adjudicate/cli: bin.ts no longer calls .version(); the CLI must still advertise its package.json version.`,
    );
  }
} catch {
  // If the CLI bin moves, the check becomes advisory rather than load-bearing.
}

if (errors.length > 0) {
  console.error("check-versions: inconsistencies found:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`check-versions: ${pkgByName.size} packages OK`);
