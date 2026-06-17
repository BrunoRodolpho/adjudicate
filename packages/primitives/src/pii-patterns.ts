/**
 * PII pattern registry + ReDoS-safety check (ADR-141, amends ADR-117).
 *
 * `PII_PATTERNS_COMMON` holds locale-agnostic patterns (email, payment-card,
 * phone). Locale-specific patterns live in the locale packages:
 * `@adjudicate/locales-pt-BR` (CPF/CNPJ) and `@adjudicate/locales-en-US` (SSN).
 *
 * `assertSafePattern` is the construction-time catastrophic-backtracking guard:
 * unsafe patterns fail at guard construction, never at request time.
 *
 * COMPLIANCE NOTE: PII detection is jurisdiction-sensitive. These patterns are
 * conservative, anchored/bounded, and linear-time, but are NOT a legal artifact.
 * @needs-legal-review before relying on them for regulated data.
 */

import type { DataClassificationPattern } from "./guards.js";

/**
 * Construction-time ReDoS guard. Heuristically rejects the classic
 * catastrophic-backtracking shape — a group whose body contains an UNBOUNDED
 * quantifier (`*`, `+`, `{n,}`) and which is itself quantified by an unbounded
 * quantifier (e.g. `(a+)+`, `(.*)*`, `([a-z]+){2,}`). Escaped parens/classes are
 * neutralized first so literals like `\(` and `\d` are not mistaken for groups.
 *
 * This is a HEURISTIC, not a proof: it targets nested unbounded quantifiers and
 * does not detect every ReDoS (e.g. overlapping alternations `(a|a)*`, or
 * multi-level nesting `((a+))+`). Patterns SHOULD also be anchored/bounded;
 * that is recommended but not enforced here. Throws on rejection.
 */
export function assertSafePattern(pattern: RegExp, label?: string): void {
  // Replace every escaped char (`\(`, `\)`, `\d`, `\b`, …) with a neutral,
  // non-paren, non-quantifier placeholder so only real group structure remains.
  const stripped = pattern.source.replace(/\\./g, "x");
  // group-open · body · unbounded-inner-quant · body · group-close · unbounded-outer-quant
  const nested = /\([^()]*(?:[*+]|\{\d+,\})[^()]*\)(?:[*+]|\{\d+,\})/;
  if (nested.test(stripped)) {
    const where = label ? ` (${label})` : "";
    throw new Error(
      `assertSafePattern: pattern${where} has a nested unbounded quantifier ` +
        `(e.g. "(a+)+") that risks catastrophic backtracking: /${pattern.source}/`,
    );
  }
}

/**
 * Common, locale-agnostic PII patterns. Anchored (`\b`) and bounded so matching
 * is linear-time. Pass to `createDataClassificationGuard({ patterns })` or
 * compose with locale patterns: `[...PII_PATTERNS_COMMON, cpfPattern]`.
 */
export const PII_PATTERNS_COMMON: ReadonlyArray<DataClassificationPattern> = [
  // RFC-5322-ish email — bounded local/domain parts, no nested quantifiers.
  { id: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  // Payment-card-like: 13–19 digits with optional space/dash separators.
  { id: "pan", pattern: /\b\d(?:[ -]?\d){12,18}\b/ },
  // E.164-ish phone: optional country code + bounded groups.
  { id: "phone", pattern: /\b\+?\d{1,3}[ -]?\(?\d{1,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}\b/ },
];

// Fail fast at import if a shipped pattern is ever made unsafe.
for (const p of PII_PATTERNS_COMMON) assertSafePattern(p.pattern, p.id);
