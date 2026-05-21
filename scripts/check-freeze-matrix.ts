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
const exitCode = strict && undeclaredExports.length > 0 ? 1 : 0;

console.log(`check-freeze-matrix: ${allIndexSymbols.size} packages, ${everyIndexSymbol.size} index exports, ${matrixSymbols.size} matrix entries`);
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
