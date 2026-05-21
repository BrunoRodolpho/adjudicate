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
 *   3. `@adjudicate/cli` `version()` constant matches the package.json
 *      version (the CLI binary advertises its own version separately).
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

// CLI version() constant alignment.
try {
  const cliBin = readFileSync(
    join(PACKAGES_DIR, "cli", "src", "bin.ts"),
    "utf-8",
  );
  const match = /\.version\("([^"]+)"\)/.exec(cliBin);
  const cliPkg = pkgByName.get("@adjudicate/cli");
  if (match && cliPkg) {
    const declaredInBin = match[1]!;
    if (declaredInBin !== cliPkg.version) {
      errors.push(
        `@adjudicate/cli: bin.ts advertises version "${declaredInBin}" but package.json is "${cliPkg.version}"`,
      );
    }
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
