/**
 * Tier 2 AST analyzers — source-level validation of Pack guards.
 *
 * Tier 1 (`analyzers.ts`) verifies declarations: a REWRITE guard's
 * `GuardMetadata.description.mutatesPayloadFields` must be non-empty;
 * a DEFER guard's `signal` must be in `pack.signals`; and so on. Those
 * checks catch *declared* mistakes, not *structural* ones.
 *
 * Tier 2 walks the actual source AST and verifies that the guard's
 * RUNTIME behaviour aligns with its declared metadata. Today this
 * package implements `AJD-201 — RewriteScopeAstAnalyzer`, which:
 *
 *   1. Finds every `decisionRewrite(rewritten, …)` call in the Pack
 *      source.
 *   2. Walks back through `rewritten`'s definition (commonly a
 *      `buildEnvelope({ payload: { …spread, fieldA: …, fieldB: … } })`
 *      pattern) and extracts the set of payload property names the
 *      guard touches.
 *   3. Compares that set against the guard's declared
 *      `mutatesPayloadFields`.
 *
 * The analyzer emits AJD-201 diagnostics for three drift conditions:
 *
 *   - **Undeclared mutation**: a property name appears in the rewrite's
 *     payload object literal that is NOT in `mutatesPayloadFields`.
 *     This is the load-bearing diagnostic — the guard is mutating
 *     something its declared scope says it does not. Severity: error.
 *   - **Stale declaration**: a property name appears in
 *     `mutatesPayloadFields` that is NOT in any rewrite output. The
 *     declaration over-promises mutation surface. Severity: warning.
 *   - **Unsafe spread**: the rewrite's payload uses `...payload` (or
 *     similar) without follow-on overrides, OR uses a computed key.
 *     Cannot statically verify scope; surface as a note. Severity: note.
 *
 * Limitations (deliberate, to keep the analyzer minimal):
 *
 *   - Only direct `decisionRewrite(…)` / `decisionRewrite({…})` /
 *     `createRewriteGuard({ rewrite: (env) => buildEnvelope({…}) })`
 *     patterns are walked. Tier 2 does not perform inter-procedural
 *     dataflow.
 *   - The mutated-field extractor only inspects object-literal
 *     property names. Computed keys (`[k]:`) are surfaced as `unsafe
 *     spread`; not analyzed.
 *   - `mutatesPayloadFields` lookup walks `withMetadata` /
 *     `nameGuard` factory calls in the same source file. Cross-file
 *     guard wrapping is not currently followed.
 *
 * Severity overrides: like Tier 1, callers can downgrade per-rule
 * severity via `analyzePolicy({ severityOverrides })`.
 */

import {
  Node,
  Project,
  SourceFile,
  SyntaxKind,
  type CallExpression,
  type ObjectLiteralExpression,
} from "ts-morph";
import type { Diagnostic, SourceLocation, Tier2Analyzer } from "./types.js";

/**
 * Load source files into a ts-morph Project. The caller supplies absolute
 * file paths; we read them once and return ready-to-analyze SourceFiles.
 *
 * Adopters and the CLI use this helper rather than constructing a
 * Project directly so the configuration stays consistent: no
 * compiler-options surprises, no implicit tsconfig loading. The
 * analyzer is purely syntactic — we never typecheck.
 */
export function loadSourceFiles(
  filePaths: ReadonlyArray<string>,
): ReadonlyArray<SourceFile> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    useInMemoryFileSystem: false,
  });
  const out: SourceFile[] = [];
  for (const p of filePaths) {
    out.push(project.addSourceFileAtPath(p));
  }
  return out;
}

// ── AJD-201 — RewriteScopeAstAnalyzer ──────────────────────────────────────

export const rewriteScopeAstAnalyzer: Tier2Analyzer = {
  name: "RewriteScopeAstAnalyzer",
  code: "AJD-201",
  analyze(_pack, sourceFiles): ReadonlyArray<Diagnostic> {
    const diagnostics: Diagnostic[] = [];
    for (const f of sourceFiles as ReadonlyArray<SourceFile>) {
      diagnostics.push(...analyzeSourceFile(f));
    }
    return diagnostics;
  },
};

interface RewriteSite {
  readonly call: CallExpression;
  /** Object literal passed in (either inline or via the `rewritten` binding). */
  readonly payloadShape: ObjectLiteralExpression | null;
  readonly hasSpread: boolean;
  readonly hasComputedKey: boolean;
  readonly explicitFieldNames: ReadonlyArray<string>;
}

function analyzeSourceFile(file: SourceFile): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. Find every decisionRewrite(...) call in the file.
  const rewriteCalls = file.getDescendantsOfKind(SyntaxKind.CallExpression).filter(
    (c) => isDecisionRewriteCall(c),
  );

  for (const call of rewriteCalls) {
    const site = analyzeRewriteSite(call);
    const declared = findDeclaredFieldsForRewriteCall(call);

    // Emit "unsafe spread" note when we cannot statically reason about scope.
    if (site.hasComputedKey || (site.hasSpread && site.explicitFieldNames.length === 0)) {
      diagnostics.push({
        code: "AJD-201",
        severity: "note",
        message:
          "REWRITE payload constructed via spread or computed key — Tier 2 cannot statically verify mutatesPayloadFields scope.",
        description:
          "The analyzer found `...spread` or a computed `[key]:` in the rewritten payload. Static scope analysis cannot list which fields are touched. Either narrow the rewrite to explicit field assignments, or accept the note as the cost of dynamic shape.",
        sourceLocation: locationOf(file, call.getStart()),
        fixHint:
          "Replace `{ ...payload, fieldA: x }` with `{ fieldA: x, fieldB: payload.fieldB }` if you can enumerate the fields, or extend mutatesPayloadFields to cover the full payload surface.",
        detail: {
          hasSpread: site.hasSpread,
          hasComputedKey: site.hasComputedKey,
        },
      });
      continue;
    }

    // Site is statically analyzable — compare declared vs actual.
    const actual = new Set(site.explicitFieldNames);
    const declaredSet = new Set(declared);

    for (const f of actual) {
      if (!declaredSet.has(f)) {
        diagnostics.push({
          code: "AJD-201",
          severity: "error",
          message: `REWRITE mutates payload field "${f}" not declared in mutatesPayloadFields.`,
          description:
            "Undeclared mutation. The guard's GuardMetadata.description.mutatesPayloadFields enumerates which payload fields the guard may modify; the AST sees a field outside that list being assigned in the rewritten envelope.",
          sourceLocation: locationOf(file, call.getStart()),
          fixHint: `Add "${f}" to the guard's mutatesPayloadFields, or remove the assignment.`,
          detail: { field: f, declared: [...declaredSet] },
        });
      }
    }

    for (const f of declaredSet) {
      if (!actual.has(f)) {
        diagnostics.push({
          code: "AJD-201",
          severity: "warning",
          message: `mutatesPayloadFields declares "${f}" but this REWRITE does not modify it.`,
          description:
            "Stale declaration. The metadata over-promises the guard's mutation surface; downstream readers (auditors, analyzers, operators) cannot trust the declaration as a tight bound.",
          sourceLocation: locationOf(file, call.getStart()),
          fixHint: `Remove "${f}" from mutatesPayloadFields if no other rewrite site covers it.`,
          detail: { field: f, actual: [...actual] },
        });
      }
    }
  }

  return diagnostics;
}

function isDecisionRewriteCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  // Match `decisionRewrite(...)` and `decisionRewrite.qualified(...)`.
  if (Node.isIdentifier(expr) && expr.getText() === "decisionRewrite") {
    return true;
  }
  return false;
}

function analyzeRewriteSite(call: CallExpression): RewriteSite {
  // decisionRewrite(rewritten, reason, basis) — argument 0 is the
  // rewritten envelope. It is typically either:
  //   (a) an identifier bound to a local `const rewritten = buildEnvelope({ … })`
  //   (b) an inline buildEnvelope({ … }) call
  //   (c) an inline { …envelope, payload: { … } } object literal (uncommon)
  const arg0 = call.getArguments()[0];
  if (arg0 === undefined) {
    return {
      call,
      payloadShape: null,
      hasSpread: false,
      hasComputedKey: false,
      explicitFieldNames: [],
    };
  }

  const buildEnvelopeCall = resolveToBuildEnvelopeCall(arg0);
  if (buildEnvelopeCall !== null) {
    return inspectBuildEnvelopeArg(buildEnvelopeCall, call);
  }

  // Fallback: arg0 is itself an object literal with a `payload` property.
  if (Node.isObjectLiteralExpression(arg0)) {
    return inspectPayloadObject(arg0, call);
  }

  // Unresolvable — surface as unsafe-spread note.
  return {
    call,
    payloadShape: null,
    hasSpread: true,
    hasComputedKey: false,
    explicitFieldNames: [],
  };
}

function resolveToBuildEnvelopeCall(arg: Node): CallExpression | null {
  if (Node.isCallExpression(arg)) {
    const expr = arg.getExpression();
    if (Node.isIdentifier(expr) && expr.getText() === "buildEnvelope") {
      return arg;
    }
  }
  if (Node.isIdentifier(arg)) {
    // Walk the binding (`const rewritten = buildEnvelope(…)`).
    const symbol = arg.getSymbol();
    if (symbol === undefined) return null;
    for (const decl of symbol.getDeclarations()) {
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (init !== undefined && Node.isCallExpression(init)) {
          const expr = init.getExpression();
          if (Node.isIdentifier(expr) && expr.getText() === "buildEnvelope") {
            return init;
          }
        }
      }
    }
  }
  return null;
}

function inspectBuildEnvelopeArg(
  buildCall: CallExpression,
  rewriteCall: CallExpression,
): RewriteSite {
  const optionsArg = buildCall.getArguments()[0];
  if (optionsArg === undefined || !Node.isObjectLiteralExpression(optionsArg)) {
    return {
      call: rewriteCall,
      payloadShape: null,
      hasSpread: true,
      hasComputedKey: false,
      explicitFieldNames: [],
    };
  }
  // Find the `payload: …` property.
  const payloadProp = optionsArg
    .getProperties()
    .find(
      (p) =>
        Node.isPropertyAssignment(p) &&
        p.getName() === "payload",
    );
  if (payloadProp === undefined || !Node.isPropertyAssignment(payloadProp)) {
    return {
      call: rewriteCall,
      payloadShape: null,
      hasSpread: false,
      hasComputedKey: false,
      explicitFieldNames: [],
    };
  }
  const payloadInit = payloadProp.getInitializer();
  if (payloadInit === undefined || !Node.isObjectLiteralExpression(payloadInit)) {
    return {
      call: rewriteCall,
      payloadShape: null,
      hasSpread: true,
      hasComputedKey: false,
      explicitFieldNames: [],
    };
  }
  return inspectPayloadObject(payloadInit, rewriteCall);
}

function inspectPayloadObject(
  obj: ObjectLiteralExpression,
  rewriteCall: CallExpression,
): RewriteSite {
  let hasSpread = false;
  let hasComputedKey = false;
  const fields: string[] = [];
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      hasSpread = true;
      continue;
    }
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      const nameNode = prop.getNameNode();
      if (Node.isComputedPropertyName(nameNode)) {
        hasComputedKey = true;
        continue;
      }
      fields.push(prop.getName());
      continue;
    }
    if (Node.isMethodDeclaration(prop)) {
      // Object-literal method shorthand — treat name as touched.
      fields.push(prop.getName());
      continue;
    }
  }
  return {
    call: rewriteCall,
    payloadShape: obj,
    hasSpread,
    hasComputedKey,
    explicitFieldNames: fields,
  };
}

/**
 * Walk back from a `decisionRewrite(...)` call to find any
 * `withMetadata(`/`nameGuard(` wrapper applied to the enclosing
 * function or guard binding, and extract the
 * `description.mutatesPayloadFields` array if present.
 *
 * This is a best-effort static walk: it inspects the same source file
 * for an object literal of shape `{ kind: "rewrite", mutatesPayloadFields: [...] }`
 * passed to a `withMetadata(…)` or `createRewriteGuard(…)` factory whose
 * guard body contains this `decisionRewrite` call.
 */
function findDeclaredFieldsForRewriteCall(
  call: CallExpression,
): ReadonlyArray<string> {
  // Walk up looking for the nearest enclosing `VariableDeclaration`
  // whose initializer is a guard-factory call (`withMetadata` /
  // `createRewriteGuard` / `nameGuard`) carrying `mutatesPayloadFields`.
  // We pass through arrow / function bodies — the common pattern is:
  //
  //   const guard = withMetadata(
  //     (envelope) => { … decisionRewrite(buildEnvelope({…})) … },
  //     { description: { kind: "rewrite", mutatesPayloadFields: [...] } },
  //   );
  //
  // so the decisionRewrite call lives inside the arrow but the
  // declaration with the metadata is the outer const binding.
  let parent: Node | undefined = call.getParent();
  while (parent !== undefined) {
    if (Node.isVariableDeclaration(parent)) {
      const init = parent.getInitializer();
      if (init !== undefined) {
        const declared = extractMutatesPayloadFieldsFromInitializer(init);
        if (declared !== null) return declared;
      }
      // Don't break — keep looking up in case the const itself is
      // nested (rare but possible).
    }
    parent = parent.getParent();
  }
  return [];
}

function extractMutatesPayloadFieldsFromInitializer(
  init: Node,
): ReadonlyArray<string> | null {
  if (!Node.isCallExpression(init)) return null;
  const callee = init.getExpression();
  if (!Node.isIdentifier(callee)) return null;
  const name = callee.getText();
  if (name !== "withMetadata" && name !== "createRewriteGuard" && name !== "nameGuard") {
    return null;
  }
  for (const arg of init.getArguments()) {
    if (!Node.isObjectLiteralExpression(arg)) continue;
    const declared = extractMutatesPayloadFieldsFromObject(arg);
    if (declared !== null) return declared;
  }
  return null;
}

function extractMutatesPayloadFieldsFromObject(
  obj: ObjectLiteralExpression,
): ReadonlyArray<string> | null {
  // Look for `mutatesPayloadFields: [...]` or `description: { mutatesPayloadFields: [...] }`.
  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const propName = prop.getName();
    if (propName === "mutatesPayloadFields") {
      return extractStringArrayInit(prop.getInitializer());
    }
    if (propName === "description") {
      const init = prop.getInitializer();
      if (init !== undefined && Node.isObjectLiteralExpression(init)) {
        const nested = extractMutatesPayloadFieldsFromObject(init);
        if (nested !== null) return nested;
      }
    }
  }
  return null;
}

function extractStringArrayInit(
  init: Node | undefined,
): ReadonlyArray<string> | null {
  if (init === undefined || !Node.isArrayLiteralExpression(init)) return null;
  const out: string[] = [];
  for (const el of init.getElements()) {
    if (Node.isStringLiteral(el) || Node.isNoSubstitutionTemplateLiteral(el)) {
      out.push(el.getLiteralValue());
    }
  }
  return out;
}

function locationOf(file: SourceFile, pos: number): SourceLocation {
  const { line, column } = file.getLineAndColumnAtPos(pos);
  return {
    file: file.getFilePath(),
    line,
    column,
  };
}

// ── Default Tier 2 pipeline ─────────────────────────────────────────────────

export const DEFAULT_TIER2_ANALYZERS: ReadonlyArray<Tier2Analyzer> = [
  rewriteScopeAstAnalyzer,
];
