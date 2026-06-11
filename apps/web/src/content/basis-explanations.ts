/**
 * basis-explanations — client-safe plain-English map for DecisionBasis codes.
 *
 * KEY FORMAT: "category:code" (exactly as `DecisionBasis` emits them), e.g.
 * "taint:level_insufficient". Values are the operator-facing sentence.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PINNED TO: packages/core/src/explain.ts → DEFAULT_EXPLANATION_REGISTRY.templates
 *
 * This is a hand-transcription, NOT an import. The kernel's `explain.ts` is
 * server-only (it pulls in AuditRecord / Decision types and is part of the
 * @adjudicate/core graph); client bundles must stay slim, so we copy the
 * strings here instead of importing them.
 *
 * DRIFT: if a basis code is added/renamed/retemplated in explain.ts, mirror it
 * here. Codes present in `BASIS_CODES` (packages/core/src/basis-codes.ts) but
 * absent from the registry (e.g. schema:intent_hash_mismatch, kill:seal_mismatch,
 * the PII_ and COMMAND_ validation codes) have no canonical sentence upstream —
 * fall back to the raw "category:code" at the call site rather than inventing one.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Template substitution ({fieldName} → basis.detail[fieldName]) is the kernel's
 * job; the few templates that carry placeholders (kill:active, confirmation:received,
 * kernel:*) keep the literal `{field}` here so the source string is faithful. The
 * ReceiptCard renders the sentence as-is and shows `detail` separately.
 */

export const BASIS_EXPLANATIONS: Readonly<Record<string, string>> = {
  // state
  "state:transition_valid": "The action is a valid state transition.",
  "state:transition_illegal": "The action is not a legal state transition.",
  "state:terminal_state":
    "The resource is already in a terminal state and cannot change.",
  // auth
  "auth:scope_sufficient":
    "The caller has sufficient scope to perform this action.",
  "auth:scope_insufficient": "The caller lacks the required scope.",
  "auth:identity_missing":
    "No verified identity was attached to this request.",
  "auth:identity_expired": "The caller's identity proof has expired.",
  // taint
  "taint:level_permitted": "The taint level is acceptable for this action.",
  "taint:level_insufficient":
    "Untrusted input flowed into a privileged action.",
  "taint:propagation_violation":
    "Untrusted data would propagate into a trusted field.",
  // ledger
  "ledger:fresh": "The replay ledger has no record of this intent yet.",
  "ledger:replay_suppressed":
    "A prior identical execution was found in the replay ledger; this attempt was suppressed.",
  "ledger:resource_version_stale":
    "The resource has changed since the request was prepared.",
  // schema
  "schema:version_supported": "The envelope version is supported.",
  "schema:version_unsupported":
    "The envelope version is not supported by this kernel build.",
  "schema:payload_invalid": "The envelope payload failed schema validation.",
  // business
  "business:rule_satisfied": "All business rules passed.",
  "business:rule_violated": "A business rule blocked this action.",
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
  "deadline:exceeded": "Adjudication exceeded the wall-clock budget.",
  // confirmation
  "confirmation:received":
    "The user supplied a confirmation receipt at {confirmedAt}.",
  // kernel
  "kernel:guard_panic":
    "A guard threw an unexpected error during adjudication and was converted to a SECURITY refusal (phase: {phase}, guard: {guard}).",
  "kernel:intent_dispatched":
    "The kernel dispatched this intent (sessionId: {sessionId}).",
} as const;

/**
 * Look up the plain-English sentence for a basis "category:code". Returns
 * `undefined` when the code has no canonical upstream template — callers
 * render the raw key instead of inventing prose.
 */
export function explainBasis(
  category: string,
  code: string,
): string | undefined {
  return BASIS_EXPLANATIONS[`${category}:${code}`];
}
