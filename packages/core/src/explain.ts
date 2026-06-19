/**
 * explainRecord — translate an AuditRecord into a human-readable explanation.
 *
 * Operator-console and support-tool surfaces render this. Adopters override
 * templates per-locale or per-Pack; the default English registry ships with
 * the kernel and covers the core categories (state, auth, taint, ledger,
 * schema, validation, kill, deadline, confirmation, business).
 *
 * Template substitution is intentionally minimal: `{fieldName}` → looked up
 * in the basis `detail` map. A missing field stays as the literal `{x}` so
 * misconfigured registries surface visibly in the console rather than
 * silently swallowing data.
 *
 * The registry is data, not code — adopters can ship locales by extending
 * `templates`. `headlines` is optional; when omitted, a sensible default is
 * derived from the Decision kind.
 */

import type { AuditRecord } from "./audit.js";
import type { Decision } from "./decision.js";

export interface DecisionExplanation {
  readonly intentHash: string;
  readonly headline: string;
  readonly bullets: readonly string[];
  readonly locale: string;
  /**
   * Supersession-chain narration (AuditRecord v3+). Present when the
   * record carries `supersedes` — describes what this record continues
   * from in human-readable form ("Continues a prior REQUEST_CONFIRMATION
   * resolved at 2026-01-15T10:32:08Z"). Operators viewing a single
   * record can follow the chain back without joining tables.
   */
  readonly supersession?: string;
}

export interface ExplanationRegistry {
  readonly locale: string;
  /**
   * Map of `"category:code"` → template string. The basis emits these as
   * `{category, code, detail}`; this template renders them as a bullet. The
   * `{fieldName}` syntax looks up `detail[fieldName]`. Missing keys remain
   * as literal `{fieldName}` to surface mis-templated rows during dev.
   */
  readonly templates: Readonly<Record<string, string>>;
  /**
   * Optional decision-kind-specific headline producers. When a kind has no
   * entry, `defaultHeadline(record)` is used. Producers receive the full
   * record so they can pull amount/principal/etc. out of the envelope.
   */
  readonly headlines?: Readonly<
    Partial<Record<Decision["kind"], (record: AuditRecord) => string>>
  >;
}

const FIELD_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function substitute(
  template: string,
  detail: Readonly<Record<string, unknown>>,
): string {
  return template.replace(FIELD_RE, (match, field: string) => {
    if (field in detail) {
      const v = detail[field];
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    }
    return match; // leave `{field}` literal — surfaces the mis-template
  });
}

function defaultHeadline(record: AuditRecord): string {
  const kind = record.decision.kind;
  const intent = record.envelope.kind;
  switch (kind) {
    case "EXECUTE":
      return `Executed: ${intent}`;
    case "REFUSE":
      return `Refused: ${intent}`;
    case "ESCALATE":
      return `Escalated: ${intent} — awaiting human approval`;
    case "REQUEST_CONFIRMATION":
      return `Awaiting confirmation: ${intent}`;
    case "DEFER":
      return `Deferred: ${intent} — awaiting external signal`;
    case "REWRITE":
      return `Rewritten: ${intent}`;
  }
}

/**
 * Render the bullet list from the record's `decision_basis`, applying
 * templates. Unmatched basis entries fall back to `category:code` literal so
 * the row is never silently dropped.
 */
function renderBullets(
  record: AuditRecord,
  templates: Readonly<Record<string, string>>,
): readonly string[] {
  return record.decision_basis.map((b) => {
    const key = `${b.category}:${b.code}`;
    const tpl = templates[key];
    if (tpl === undefined) return key;
    return substitute(tpl, b.detail ?? {});
  });
}

export function explainRecord(
  record: AuditRecord,
  registry: ExplanationRegistry,
): DecisionExplanation {
  const headlineFn =
    registry.headlines?.[record.decision.kind] ?? defaultHeadline;
  const supersession = narrateSupersession(record, registry);
  return {
    intentHash: record.intentHash,
    headline: headlineFn(record),
    bullets: renderBullets(record, registry.templates),
    locale: registry.locale,
    ...(supersession !== undefined ? { supersession } : {}),
  };
}

/**
 * Narrate the supersession link (AuditRecord v3+). Returns `undefined`
 * when the record carries no `supersedes` field; otherwise returns a
 * single-sentence narration suitable for an operator console.
 */
function narrateSupersession(
  record: AuditRecord,
  registry: ExplanationRegistry,
): string | undefined {
  const s = record.supersedes;
  if (s === undefined) return undefined;
  const tplKey = `supersedes:${s.reason}`;
  const tpl =
    registry.templates[tplKey] ??
    `Continues a prior decision (${s.reason}) recorded at {predecessorAt}.`;
  return substitute(tpl, {
    predecessorAt: s.predecessorAt,
    predecessorIntentHash: s.predecessorIntentHash,
    reason: s.reason,
    ...(s.token !== undefined ? { token: s.token } : {}),
  });
}

/**
 * Merge multiple `ExplanationRegistry` objects into one. Later registries
 * override earlier ones at the key level — this is what Pack authors do
 * when extending the framework's `DEFAULT_EXPLANATION_REGISTRY` with
 * their domain-specific basis codes. Locale must agree across all
 * inputs (else the merge throws); pass distinct locales by building
 * separate merged registries.
 *
 * The merge is shallow at the template level and shallow at the
 * `headlines` map level. Adopters who need deeper composition (e.g.,
 * conditional templates) wrap the merged registry themselves.
 */
export function mergeExplanationRegistries(
  ...registries: ReadonlyArray<ExplanationRegistry>
): ExplanationRegistry {
  if (registries.length === 0) {
    throw new Error("mergeExplanationRegistries: at least one registry required");
  }
  const locale = registries[0]!.locale;
  for (const r of registries) {
    if (r.locale !== locale) {
      throw new Error(
        `mergeExplanationRegistries: locale mismatch (${locale} vs ${r.locale}). Build per-locale registries separately.`,
      );
    }
  }
  const templates: Record<string, string> = {};
  const headlines: Partial<Record<Decision["kind"], (record: AuditRecord) => string>> = {};
  for (const r of registries) {
    Object.assign(templates, r.templates);
    if (r.headlines) Object.assign(headlines, r.headlines);
  }
  return {
    locale,
    templates,
    ...(Object.keys(headlines).length > 0 ? { headlines } : {}),
  };
}

/**
 * Default English registry. Built from the BASIS_CODES vocabulary; adopters
 * extend this when they introduce new basis codes via module augmentation.
 *
 * The map keys are intentionally `"category:code"` strings (not nested) so
 * a Pack author copying-and-pasting a registry into a translations file can
 * see every line on one line of grep output.
 */
export const DEFAULT_EXPLANATION_REGISTRY: ExplanationRegistry = {
  locale: "en-US",
  templates: {
    // state
    "state:transition_valid":
      "The action is a valid state transition.",
    "state:transition_illegal":
      "The action is not a legal state transition.",
    "state:terminal_state":
      "The resource is already in a terminal state and cannot change.",
    // auth
    "auth:scope_sufficient":
      "The caller has sufficient scope to perform this action.",
    "auth:scope_insufficient":
      "The caller lacks the required scope.",
    "auth:identity_missing":
      "No verified identity was attached to this request.",
    "auth:identity_expired":
      "The caller's identity proof has expired.",
    // taint
    "taint:level_permitted":
      "The taint level is acceptable for this action.",
    "taint:level_insufficient":
      "Untrusted input flowed into a privileged action.",
    "taint:propagation_violation":
      "Untrusted data would propagate into a trusted field.",
    // ledger
    "ledger:fresh":
      "The replay ledger has no record of this intent yet.",
    "ledger:replay_suppressed":
      "A prior identical execution was found in the replay ledger; this attempt was suppressed.",
    "ledger:resource_version_stale":
      "The resource has changed since the request was prepared.",
    // schema
    "schema:version_supported":
      "The envelope version is supported.",
    "schema:version_unsupported":
      "The envelope version is not supported by this kernel build.",
    "schema:payload_invalid":
      "The envelope payload failed schema validation.",
    // business
    "business:rule_satisfied":
      "All business rules passed.",
    "business:rule_violated":
      "A business rule blocked this action.",
    "business:quantity_capped":
      "The requested quantity exceeded a configured cap and was reduced.",
    // validation
    "validation:forbidden_phrase_absent":
      "No forbidden phrases were detected in the input.",
    "validation:homoglyph_normalized":
      "Homoglyph characters in the input were normalized.",
    "validation:unicode_normalized":
      "The input was Unicode-normalized before evaluation.",
    // kill
    "kill:active":
      "The kill switch is active (reason: {reason}, toggled at {toggledAt}).",
    // deadline
    "deadline:exceeded":
      "Adjudication exceeded the wall-clock budget.",
    // confirmation
    "confirmation:received":
      "The user supplied a confirmation receipt at {confirmedAt}.",
    // budget (025 — capabilities-as-budgets)
    "budget:satisfied":
      "A standing budget grant ({budgetId}) satisfied the ask-first threshold for {intentKind} (limit {limit} per {windowSeconds}s).",
    // kernel
    "kernel:guard_panic":
      "A guard threw an unexpected error during adjudication and was converted to a SECURITY refusal (phase: {phase}, guard: {guard}).",
    "kernel:intent_dispatched":
      "The kernel dispatched this intent (sessionId: {sessionId}).",
    // supersession narrations
    "supersedes:confirmation_resolved":
      "Continues a prior REQUEST_CONFIRMATION resolved at {predecessorAt}.",
    "supersedes:defer_resumed":
      "Resumes a prior DEFER signal received at {predecessorAt}.",
    "supersedes:rewrite_executed":
      "Executes the rewritten envelope from a prior REWRITE at {predecessorAt}.",
    "supersedes:replay":
      "Re-evaluates a prior decision recorded at {predecessorAt}.",
    "supersedes:budget_satisfied":
      "Satisfies a prior REQUEST_CONFIRMATION via standing budget {token}, recorded at {predecessorAt}.",
    "supersedes:lgpd_scrub":
      "Continues a LGPD/GDPR anonymization started at {predecessorAt}.",
  },
};
