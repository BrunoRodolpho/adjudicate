/**
 * Default check set assembled in stable id-order. The order matters:
 * `runConformance()` invokes checks in this order, and the resulting
 * `ConformanceReport.results` reflects it. Tooling that pretty-prints
 * the report (CI logs, the future Console "Pack conformance" panel)
 * relies on this for a consistent display.
 *
 * Stable order also keeps `passed: true` reports byte-identical across
 * runs — important for snapshot tests in adopter projects.
 */

import { basisVocabularyPurityCheck } from "./checks/basis-vocabulary-purity.js";
import { defaultPolarityCheck } from "./checks/default-polarity.js";
import { guardOrderingCheck } from "./checks/guard-ordering.js";
import { intentHashDeterministicCheck } from "./checks/intent-hash-deterministic.js";
import { noPayloadSelfConfirmationCheck } from "./checks/no-payload-self-confirmation.js";
import { replayDeterminismCheck } from "./checks/replay-determinism.js";
import { untrustedNeverExecutesCheck } from "./checks/untrusted-never-executes.js";
import type { ConformanceCheck } from "./types.js";

export const DEFAULT_CHECKS: ReadonlyArray<ConformanceCheck> = [
  untrustedNeverExecutesCheck,
  replayDeterminismCheck,
  intentHashDeterministicCheck,
  basisVocabularyPurityCheck,
  guardOrderingCheck,
  defaultPolarityCheck,
  noPayloadSelfConfirmationCheck,
];
