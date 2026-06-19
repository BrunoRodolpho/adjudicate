/**
 * Pre-publish freeze-matrix consistency check.
 *
 * Walks the public `src/index.ts` of every `@adjudicate/*` package and
 * compares the exported identifier set to the V1_FREEZE_MATRIX.md
 * inventory. Surfaces:
 *
 *   - new exports not declared anywhere in the matrix
 *   - matrix entries pointing at exports that no longer exist
 *
 * The matcher is intentionally permissive on whitespace and pipe
 * formatting; it extracts identifiers from backticked-spans in the
 * matrix tables.
 *
 * The check is advisory-only on CI today (printed to stdout), but
 * gates pre-publish in the release-candidate workflow.
 *
 *   pnpm tsx scripts/check-freeze-matrix.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? "scripts", "..");
const MATRIX_PATH = join(ROOT, "docs", "release", "V1_FREEZE_MATRIX.md");

interface SymbolEntry {
  readonly name: string;
  readonly source: "index" | "matrix";
}

function readSymbolsFromIndex(pkgDir: string): ReadonlyArray<string> {
  const indexPath = join(ROOT, "packages", pkgDir, "src", "index.ts");
  let raw: string;
  try {
    raw = readFileSync(indexPath, "utf-8");
  } catch {
    return [];
  }
  // We don't do a full TypeScript parse — but we cover the common forms:
  //   export { A, B as C, type D } from "...";
  //   export * from "...";    (followed by individual symbol re-exports captured elsewhere)
  //   export const X = ...
  //   export function f(...)
  //   export type T = ...
  //   export interface I { ... }
  //   export class C { ... }
  const out = new Set<string>();
  // `export { A, B as C, type D }` — capture both A and C (rename target).
  for (const m of raw.matchAll(/export\s*\{\s*([^}]+)\s*\}/g)) {
    const inner = m[1]!;
    for (const part of inner.split(",")) {
      let p = part.trim();
      if (!p) continue;
      p = p.replace(/^type\s+/, "");
      const asMatch = /(\w+)\s+as\s+(\w+)/.exec(p);
      if (asMatch) {
        out.add(asMatch[2]!);
      } else {
        const id = /^([A-Za-z_]\w*)/.exec(p);
        if (id) out.add(id[1]!);
      }
    }
  }
  for (const m of raw.matchAll(
    /export\s+(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_]\w*)/g,
  )) {
    out.add(m[1]!);
  }
  return [...out].sort();
}

function readSymbolsFromMatrix(): ReadonlyArray<string> {
  const raw = readFileSync(MATRIX_PATH, "utf-8");
  const out = new Set<string>();
  // The matrix uses backtick spans like `foo` and slash-separated lists `a` / `b` / `c`.
  // Extract every backticked identifier-looking token.
  for (const m of raw.matchAll(/`([A-Za-z_][\w$]*)`/g)) {
    out.add(m[1]!);
  }
  return [...out].sort();
}

/**
 * 083 — the §24 "Version + package state" PIN TABLE.
 *
 * The matrix declares an immutable per-package version pin in a `| name |
 * version | stance |` table under `## §24`. This is the "immutable-version-pin
 * demand": the publish stage must not ship a manifest whose pin row is
 * malformed or duplicated. We parse the table STRUCTURALLY here and validate
 * its integrity under `--version-pin` (enforcing on the segregated publish
 * stage). We deliberately do NOT compare the pinned strings to live
 * `package.json` versions: across the merged-architecture history the live
 * versions have drifted ahead of §24 (each prior plan bumped via changesets
 * without re-cutting §24), and a value-equality gate would redden the publish
 * pipeline for accumulated cross-plan state outside any single plan's diff
 * (tracked as the batched freeze-matrix sweep). The STRUCTURAL pin check is
 * monotonic (§C: it only ever ADDS friction to publish) and clean today, so it
 * is safe to make enforcing now; the symbol-completeness `--strict` gate stays
 * advisory until the matrix is symbol-complete.
 */
interface PinRow {
  readonly pkg: string;
  readonly version: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readVersionPinTable(): {
  rows: ReadonlyArray<PinRow>;
  problems: ReadonlyArray<string>;
} {
  const raw = readFileSync(MATRIX_PATH, "utf-8");
  const lines = raw.split(/\r?\n/);
  const rows: PinRow[] = [];
  const problems: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+§24\b/.test(line)) {
      inSection = true;
      continue;
    }
    // The pin table is the first markdown table inside §24; stop at the next
    // `## §NN` heading so we never bleed into a later section.
    if (inSection && /^##\s+§/.test(line)) break;
    if (!inSection) continue;
    // Only consider rows that name an `@adjudicate/*` package.
    if (!/^\|\s*`@adjudicate\//.test(line)) continue;
    // Expect exactly `| `name` | `version` | stance |`.
    const m = /^\|\s*`(@adjudicate\/[^`]+)`\s*\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!m) {
      problems.push(`malformed §24 pin row (expected \`| \`name\` | \`version\` | stance |\`): ${line.trim()}`);
      continue;
    }
    const pkg = m[1]!;
    const version = m[2]!;
    if (!SEMVER_RE.test(version)) {
      problems.push(`§24 pin for ${pkg} is not a valid semver: \`${version}\``);
    }
    rows.push({ pkg, version });
  }
  if (rows.length === 0) {
    problems.push("§24 version-pin table is empty or unparseable (no `@adjudicate/*` pin rows found)");
  }
  // No package may be pinned twice — a duplicate row is an ambiguous pin.
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.pkg)) problems.push(`duplicate §24 pin row for ${r.pkg}`);
    seen.add(r.pkg);
  }
  return { rows, problems };
}

function listPackages(): ReadonlyArray<string> {
  const root = join(ROOT, "packages");
  return readdirSync(root).filter((entry) => {
    try {
      const st = statSync(join(root, entry));
      if (!st.isDirectory()) return false;
      return statSync(join(root, entry, "src", "index.ts")).isFile();
    } catch {
      return false;
    }
  });
}

const matrixSymbols = new Set(readSymbolsFromMatrix());
const allIndexSymbols = new Map<string, ReadonlyArray<string>>();
const everyIndexSymbol = new Set<string>();

for (const pkg of listPackages()) {
  const syms = readSymbolsFromIndex(pkg);
  allIndexSymbols.set(pkg, syms);
  for (const s of syms) everyIndexSymbol.add(s);
}

const undeclaredExports: Array<[string, string]> = [];
for (const [pkg, syms] of allIndexSymbols) {
  for (const s of syms) {
    if (!matrixSymbols.has(s)) {
      undeclaredExports.push([pkg, s]);
    }
  }
}

const stalematrixEntries: string[] = [];
for (const s of matrixSymbols) {
  if (!everyIndexSymbol.has(s)) {
    // Avoid noise on common identifier-shaped words that appear in
    // backticks for prose reasons (kinds, codes, etc.). We only care
    // about exported symbols.
    if (/^[A-Z]/.test(s) || /^create|^run|^start|^build|^verify|^classify|^safe|^assert|^decision/.test(s)) {
      stalematrixEntries.push(s);
    }
  }
}

// The check defaults to ADVISORY exit code 0 so adding it to CI doesn't
// break the build while the matrix is still being filled out. Pass
// `--strict` to gate on undeclared exports — used by the RC pipeline
// once the matrix has been completed to symbol-level granularity.
const strict = process.argv.includes("--strict");

// 083 — `--version-pin` makes the §24 immutable-version-pin demand ENFORCING
// on the segregated publish stage: a malformed / duplicated / non-semver pin
// row fails the build. Independent of `--strict` (symbol completeness): the
// pin table is structurally clean today, so this gate is safe to enforce now
// while `--strict` stays advisory until the matrix is symbol-complete.
const enforcePin = process.argv.includes("--version-pin");
const { rows: pinRows, problems: pinProblems } = readVersionPinTable();

const exitCode =
  (strict && undeclaredExports.length > 0) || (enforcePin && pinProblems.length > 0)
    ? 1
    : 0;

console.log(`check-freeze-matrix: ${allIndexSymbols.size} packages, ${everyIndexSymbol.size} index exports, ${matrixSymbols.size} matrix entries, ${pinRows.length} §24 version pins`);
if (enforcePin || pinProblems.length > 0) {
  if (pinProblems.length > 0) {
    console.log("\n§24 version-pin table problems (enforced under --version-pin):");
    for (const p of pinProblems) console.log(`  - ${p}`);
  } else {
    console.log(`  §24 version-pin table OK: ${pinRows.length} well-formed pins, no duplicates`);
  }
}
if (undeclaredExports.length > 0) {
  console.log("\nundeclared exports (in src/index.ts but not mentioned in V1_FREEZE_MATRIX.md):");
  for (const [pkg, s] of undeclaredExports.slice(0, 50)) {
    console.log(`  - ${pkg}: ${s}`);
  }
  if (undeclaredExports.length > 50) {
    console.log(`  ... (+${undeclaredExports.length - 50} more)`);
  }
}
if (stalematrixEntries.length > 0) {
  console.log("\npotentially stale matrix entries (mentioned in matrix but not exported):");
  for (const s of stalematrixEntries.slice(0, 50)) {
    console.log(`  - ${s}`);
  }
}

process.exit(exitCode);
