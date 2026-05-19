/**
 * @adjudicate/migrate — codemod runner for adjudicate API migrations.
 *
 * Each codemod is a deterministic, ts-morph-driven rewrite that adopters can
 * run during a deprecation window. Codemods are scoped narrowly:
 *
 *   - They rewrite a single call shape at a time
 *   - They prefer skipping ambiguous cases over silently producing wrong
 *     output
 *   - They are idempotent — re-running a codemod against already-migrated
 *     source is a no-op
 *
 * The package is intentionally small. Codemods are not where we discover
 * what the API surface should be — that happens via ADRs. By the time a
 * codemod ships, the destination API is already stable; the codemod is
 * mechanical.
 */

export type {
  CodemodChange,
  CodemodChangeKind,
  CodemodOptions,
  CodemodReport,
} from "./codemods/name-guard-to-with-metadata.js";

export {
  applyNameGuardToWithMetadata,
  nameGuardToWithMetadata,
  runNameGuardToWithMetadata,
} from "./codemods/name-guard-to-with-metadata.js";

export { runCodemod, listCodemods, type CodemodDescriptor } from "./runner.js";
