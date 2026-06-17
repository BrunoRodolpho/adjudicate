/**
 * @adjudicate/locales-en-US — US English (en-US) PII patterns.
 *
 * Locale-specific companion to `@adjudicate/primitives`' `PII_PATTERNS_COMMON`.
 * Pass directly to `createDataClassificationGuard({ patterns })` or compose:
 *
 * ```ts
 * import { PII_PATTERNS_COMMON } from "@adjudicate/primitives";
 * import { ssnPattern } from "@adjudicate/locales-en-US";
 * const patterns = [...PII_PATTERNS_COMMON, ssnPattern];
 * ```
 *
 * Structurally compatible with `DataClassificationPattern` (no dependency on
 * primitives). Anchored and bounded so matching is linear-time; passes
 * `assertSafePattern`.
 *
 * COMPLIANCE: format matcher only (NNN-NN-NNNN, separators optional); does not
 * validate area/group/serial allocation rules. @needs-legal-review before use on
 * regulated data.
 */

export interface LocalePiiPattern {
  readonly id: string;
  readonly pattern: RegExp;
}

/** US Social Security Number — `123-45-6789` (separators optional). */
export const ssnPattern: LocalePiiPattern = {
  id: "ssn",
  pattern: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/,
};

/** All en-US PII patterns, for convenient spread into a guard's patterns. */
export const usPiiPatterns: ReadonlyArray<LocalePiiPattern> = [ssnPattern];
