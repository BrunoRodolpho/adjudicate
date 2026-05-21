/**
 * Codemod: `nameGuard("name", expr)` → `withMetadata(expr, { name: "name" })`.
 *
 * Background: `nameGuard` is a thin facade over `withMetadata({ name })` (see
 * `@adjudicate/core/kernel/adjudicate.ts`). It will be deprecated in favor of
 * the more general `withMetadata` once the guard-metadata surface absorbs
 * other fields (description, version, deprecation markers). This codemod
 * rewrites adopter code at the call-site so the eventual removal is a no-op.
 *
 * Behaviour:
 *
 *   - Matches CallExpressions whose callee is the identifier `nameGuard`.
 *     Property accesses (e.g. `kernel.nameGuard(...)`) are skipped — the
 *     codemod is conservative; adopters who alias should run it after the
 *     barrel import is normalized.
 *
 *   - Requires exactly two arguments: a string literal name and an
 *     expression. Other shapes are skipped and surfaced as `Skip` entries
 *     in the report. We never silently rewrite something we don't
 *     understand.
 *
 *   - Rewrites in place using `CallExpression.replaceWithText`. Imports
 *     are updated: if `nameGuard` is the only import from `@adjudicate/core`
 *     (or `@adjudicate/core/kernel`), it's swapped for `withMetadata`; if
 *     it's one of several, `withMetadata` is added and `nameGuard` removed.
 *
 *   - Idempotent: a second run finds no `nameGuard` calls and is a no-op.
 */

import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type SourceFile,
} from "ts-morph";

export type CodemodChangeKind = "rewrite" | "skip";

export interface CodemodChange {
  readonly kind: CodemodChangeKind;
  readonly file: string;
  readonly line: number;
  readonly before: string;
  readonly after?: string;
  readonly reason?: string;
}

export interface CodemodReport {
  readonly changes: readonly CodemodChange[];
  readonly filesChanged: number;
}

export interface CodemodOptions {
  /** When true, do not write files — return the report only. */
  readonly dryRun?: boolean;
}

/**
 * Apply the codemod to a single SourceFile. Returns the rewrites it made;
 * caller is responsible for `save()`.
 */
export function applyNameGuardToWithMetadata(
  sourceFile: SourceFile,
): CodemodChange[] {
  const changes: CodemodChange[] = [];
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  let touchedAnyCall = false;

  for (const call of calls) {
    const result = rewriteCall(call, sourceFile.getFilePath());
    if (result) {
      changes.push(result);
      if (result.kind === "rewrite") touchedAnyCall = true;
    }
  }

  if (touchedAnyCall) {
    updateImports(sourceFile);
  }

  return changes;
}

function rewriteCall(call: CallExpression, filePath: string): CodemodChange | undefined {
  const expression = call.getExpression();
  // Only top-level `nameGuard(...)` calls — not `foo.nameGuard(...)`.
  if (!Node.isIdentifier(expression)) return undefined;
  if (expression.getText() !== "nameGuard") return undefined;

  const line = call.getStartLineNumber();
  const before = call.getText();
  const args = call.getArguments();
  if (args.length !== 2) {
    return {
      kind: "skip",
      file: filePath,
      line,
      before,
      reason: `nameGuard expects 2 arguments, got ${args.length}`,
    };
  }

  const nameArg = args[0]!;
  const guardArg = args[1]!;

  if (!Node.isStringLiteral(nameArg) && !Node.isNoSubstitutionTemplateLiteral(nameArg)) {
    return {
      kind: "skip",
      file: filePath,
      line,
      before,
      reason: "first argument is not a string literal",
    };
  }

  const nameText = nameArg.getLiteralText();
  const guardText = guardArg.getText();
  const after = `withMetadata(${guardText}, { name: ${JSON.stringify(nameText)} })`;
  call.replaceWithText(after);

  return {
    kind: "rewrite",
    file: filePath,
    line,
    before,
    after,
  };
}

function updateImports(sourceFile: SourceFile): void {
  const KERNEL_SPECIFIERS = ["@adjudicate/core", "@adjudicate/core/kernel"];
  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!KERNEL_SPECIFIERS.includes(specifier)) continue;

    const named = decl.getNamedImports();
    const nameGuardImport = named.find((n) => n.getName() === "nameGuard");
    if (!nameGuardImport) continue;

    const hasWithMetadata = named.some((n) => n.getName() === "withMetadata");
    if (!hasWithMetadata) {
      decl.addNamedImport("withMetadata");
    }
    nameGuardImport.remove();
  }
}

/**
 * Top-level runner: load every file matching the provided globs into a
 * `Project`, apply the codemod, write the results unless `dryRun`.
 */
export async function runNameGuardToWithMetadata(
  globs: readonly string[],
  options: CodemodOptions = {},
): Promise<CodemodReport> {
  if (globs.length === 0) {
    return { changes: [], filesChanged: 0 };
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false },
  });
  for (const glob of globs) {
    project.addSourceFilesAtPaths(glob);
  }

  const changes: CodemodChange[] = [];
  let filesChanged = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const before = sourceFile.getFullText();
    const fileChanges = applyNameGuardToWithMetadata(sourceFile);
    changes.push(...fileChanges);

    const after = sourceFile.getFullText();
    if (before !== after) {
      filesChanged++;
      if (!options.dryRun) {
        await sourceFile.save();
      }
    }
  }

  return { changes, filesChanged };
}

export const nameGuardToWithMetadata = {
  id: "name-guard-to-with-metadata",
  description:
    'Rewrite `nameGuard("name", g)` to `withMetadata(g, { name: "name" })`.',
  run: runNameGuardToWithMetadata,
} as const;
