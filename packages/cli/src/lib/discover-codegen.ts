/**
 * `adjudicate discover` codegen — turn an MCP `tools/list` into a
 * CONFORMANT, deny-by-default Pack scaffold.
 *
 * Two pieces live here:
 *
 *   1. `mcpToolNameToIntentKind(prefix, toolName)` — the pure name mapper.
 *   2. `buildDiscoverVars(...)` — derives the substitution variables the
 *      `templates/discover/` set needs to render a conformant Pack +
 *      one REFUSE scenario per discovered tool.
 *
 * Everything here is pure (no I/O) so the codegen is unit-testable
 * against a mocked tool list with no filesystem or network.
 */

/**
 * Wire-API translation, mirroring `@adjudicate/adapter-core`'s
 * `intentKindToApiName`: replace `.` with `_`. Inlined (one line) so the
 * CLI codegen stays self-contained and does not pull the adapter into the
 * CLI dependency graph for a single string transform. The collision the
 * mapper guards against is defined relative to THIS translation.
 */
function intentKindToApiName(name: string): string {
  return name.replaceAll(".", "_");
}

/**
 * Map an MCP tool name to a PREFIX-NAMESPACED dotted intent kind:
 * `${prefix}.${sanitized(toolName)}`.
 *
 * # Collision-avoidance property (the testable invariant)
 *
 * The bridge translates an intent kind to its wire form by replacing
 * every `.` with `_` (see `intentKindToApiName`). That makes a dotted
 * kind `a.b` and a *literal* tool name `a_b` BOTH render to the same wire
 * name `a_b` — an ambiguous collision the adapter cannot reverse.
 *
 * To stay unambiguous, the sanitized tool segment this function emits
 * MUST NOT contain a bare `_`. We therefore:
 *
 *   - lower-case and trim the raw tool name;
 *   - collapse every run of non-`[a-z0-9]` characters (including `_`,
 *     spaces, dots, slashes) to a single `-`;
 *   - strip leading/trailing `-`;
 *   - fall back to `tool` if nothing survives.
 *
 * The ONLY `.` in the produced kind is the single prefix separator. The
 * sanitized segment contains only `[a-z0-9-]`, never `_` and never `.`.
 * Consequently `intentKindToApiName(kind)` produces exactly one `_`
 * (from the prefix dot), and the result can never alias a different
 * dotted kind — i.e. the wire name is never an ambiguous bare `a_b`
 * derived from underscores in the tool name.
 *
 * @param prefix    namespace segment (the Pack's intent prefix). Sanitized
 *                  the same way as the tool segment.
 * @param toolName  the raw MCP tool name.
 */
export function mcpToolNameToIntentKind(
  prefix: string,
  toolName: string,
): string {
  const safePrefix = sanitizeSegment(prefix, "pack");
  const safeTool = sanitizeSegment(toolName, "tool");
  return `${safePrefix}.${safeTool}`;
}

/**
 * Lower-case a raw name and reduce it to the `[a-z0-9-]` alphabet, with
 * `-` as the ONLY separator. Crucially emits NO `_` and NO `.` so the
 * produced segment can never reintroduce the `a.b` <-> `a_b` ambiguity
 * documented on {@link mcpToolNameToIntentKind}.
 */
function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * A discovered tool, projected to exactly what the templates render.
 * Every discovered tool is classified MUTATING by default (the
 * conservative posture: `discover` cannot know a tool is side-effect-free).
 */
export interface DiscoveredIntent {
  /** Raw MCP tool name (kept for the human-readable comment / scenario). */
  readonly toolName: string;
  /** Prefix-namespaced dotted intent kind. */
  readonly intentKind: string;
  /** Wire-API form of `intentKind` (dots → underscores). */
  readonly apiName: string;
}

/**
 * Resolve discovered tools to their intent kinds, de-duplicating any
 * kinds that collapse onto the same sanitized form (two tools that
 * sanitize identically would otherwise produce duplicate intents, which
 * `assertPackConformance` rejects). De-dup keeps first-seen order.
 */
export function discoveredIntents(
  prefix: string,
  tools: ReadonlyArray<{ readonly name: string }>,
): ReadonlyArray<DiscoveredIntent> {
  const seen = new Set<string>();
  const out: DiscoveredIntent[] = [];
  for (const tool of tools) {
    const intentKind = mcpToolNameToIntentKind(prefix, tool.name);
    if (seen.has(intentKind)) continue;
    seen.add(intentKind);
    out.push({
      toolName: tool.name,
      intentKind,
      apiName: intentKindToApiName(intentKind),
    });
  }
  return out;
}

/**
 * Derive the basis code a discovered intent's REFUSE guard declares. A
 * non-empty `basisCodes` list is mandatory — `assertPackConformance`
 * throws on an empty one. We mint one stable refusal code per intent.
 */
export function refusalCodeFor(intentKind: string): string {
  return `${intentKind}.refused`;
}

export interface DiscoverVars {
  /** npm package name + Pack id. */
  readonly packName: string;
  /** PascalCase class/const stem. */
  readonly className: string;
  /** kebab intent prefix. */
  readonly intentPrefix: string;
  /** the discovered intents (mutating, deny-by-default). */
  readonly intents: ReadonlyArray<DiscoveredIntent>;
}

/**
 * The full template-variable bundle for one `discover` run. The string
 * `Record` half feeds the simple `{{key}}` template renderer; the
 * structured `intents` half drives the per-tool generated blocks.
 */
export function buildDiscoverVars(
  packName: string,
  className: string,
  intentPrefix: string,
  tools: ReadonlyArray<{ readonly name: string }>,
): DiscoverVars {
  return {
    packName,
    className,
    intentPrefix,
    intents: discoveredIntents(intentPrefix, tools),
  };
}

// ─── Code-block rendering (pure) ─────────────────────────────────────────────
//
// These produce the dynamic source fragments the `templates/discover/`
// `{{...}}` placeholders are substituted with. Kept pure (string in,
// string out) so codegen is fully unit-testable.

/** Stable PascalCase guard-identifier stem for an intent (no leading digit). */
function guardStem(intent: DiscoveredIntent): string {
  const parts = intent.intentKind
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const joined = parts.join("");
  return /^[0-9]/.test(joined) ? `T${joined}` : joined;
}

export function guardConstName(intent: DiscoveredIntent): string {
  return `refuse${guardStem(intent)}`;
}

function jsonString(s: string): string {
  return JSON.stringify(s);
}

/** `  | "prefix.tool-a"\n  | "prefix.tool-b"` — the IntentKind union body. */
export function renderIntentKindUnionBlock(
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents
    .map((i) => `  | ${jsonString(i.intentKind)}`)
    .join("\n");
}

/**
 * `    "tool-a",` per tool — the body of the MUTATING `Set` in the
 * `ToolClassification` object. Every discovered tool is MUTATING by default
 * (the conservative posture); READ_ONLY is emitted empty for re-classification.
 */
export function renderToolClassificationBlock(
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents.map((i) => `    ${jsonString(i.toolName)},`).join("\n");
}

/** One named REFUSE guard per tool. */
export function renderGuardsBlock(
  className: string,
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents
    .map((i) => {
      const name = guardConstName(i);
      const code = refusalCodeFor(i.intentKind);
      return [
        `const ${name}: Guard<`,
        `  ${className}IntentKind,`,
        `  unknown,`,
        `  ${className}State`,
        `> = (envelope) => {`,
        `  if (envelope.kind !== ${jsonString(i.intentKind)}) return null;`,
        `  // SCAFFOLD: deny-by-default. Replace with real domain logic for`,
        `  // the MCP tool ${jsonString(i.toolName)}.`,
        `  return decisionRefuse(`,
        `    refuse(`,
        `      "SECURITY",`,
        `      ${jsonString(code)},`,
        `      "This action is not yet authorized by the policy.",`,
        `      ${jsonString(`unimplemented guard for MCP tool ${i.toolName}`)},`,
        `    ),`,
        `    [`,
        `      basis("business", BASIS_CODES.business.RULE_VIOLATED, {`,
        `        tool: ${jsonString(i.toolName)},`,
        `      }),`,
        `    ],`,
        `  );`,
        `};`,
      ].join("\n");
    })
    .join("\n\n");
}

/** `    refuseToolA,\n    refuseToolB,` — the business guard list body. */
export function renderBusinessListBlock(
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents.map((i) => `    ${guardConstName(i)},`).join("\n");
}

/** `    "prefix.tool-a",` per tool — the Pack.intents body. */
export function renderPackIntentsBlock(
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents.map((i) => `    ${jsonString(i.intentKind)},`).join("\n");
}

/** `    "prefix.tool-a.refused",` per tool — the Pack.basisCodes body. */
export function renderBasisCodesBlock(
  intents: ReadonlyArray<DiscoveredIntent>,
): string {
  return intents
    .map((i) => `    ${jsonString(refusalCodeFor(i.intentKind))},`)
    .join("\n");
}

export interface DiscoverBlocks {
  readonly intentKindUnionBlock: string;
  readonly toolClassificationBlock: string;
  readonly guardsBlock: string;
  readonly businessListBlock: string;
  readonly packIntentsBlock: string;
  readonly basisCodesBlock: string;
}

/** All dynamic source blocks for the `templates/discover/` placeholders. */
export function renderDiscoverBlocks(vars: DiscoverVars): DiscoverBlocks {
  return {
    intentKindUnionBlock: renderIntentKindUnionBlock(vars.intents),
    toolClassificationBlock: renderToolClassificationBlock(vars.intents),
    guardsBlock: renderGuardsBlock(vars.className, vars.intents),
    businessListBlock: renderBusinessListBlock(vars.intents),
    packIntentsBlock: renderPackIntentsBlock(vars.intents),
    basisCodesBlock: renderBasisCodesBlock(vars.intents),
  };
}

/**
 * Render the one REFUSE scenario per discovered tool. Each scenario
 * proposes the intent with UNTRUSTED taint (the LLM-origin case) and
 * expects REFUSE — which the deny-by-default policy guarantees. Returns a
 * `{ filename → JSON string }` map; the command writes them to disk.
 */
export function renderScenarioFiles(
  vars: DiscoverVars,
): ReadonlyArray<{ readonly filename: string; readonly contents: string }> {
  return vars.intents.map((intent, idx) => {
    const scenario = {
      intent: {
        kind: intent.intentKind,
        payload: {},
        actor: { principal: "llm", sessionId: "discover-example" },
        taint: "UNTRUSTED",
        nonce: `discover-refuse-${idx + 1}`,
      },
      state: { entities: {} },
      expected: { kind: "REFUSE" },
    };
    return {
      filename: `${intent.apiName}-refuse.json`,
      contents: `${JSON.stringify(scenario, null, 2)}\n`,
    };
  });
}
