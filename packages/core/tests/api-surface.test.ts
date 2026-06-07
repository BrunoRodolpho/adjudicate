/**
 * Invariant: the public API surface of `@adjudicate/core` matches the
 * V1 freeze matrix.
 *
 * Adding or removing an export here is a release-blocker until both
 * [docs/release/api-surface.md](../../../docs/release/api-surface.md)
 * and [docs/release/V1_FREEZE_MATRIX.md](../../../docs/release/V1_FREEZE_MATRIX.md)
 * are updated to match. The snapshot is intentionally noisy on breaks
 * — a refactor that churns this file is a signal to walk the matrix.
 *
 * Run `pnpm -F @adjudicate/core test api-surface` to refresh after
 * intentional changes.
 */

import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";
import * as kernel from "../src/kernel/index.js";
import * as llm from "../src/llm/index.js";

const ROOT_FROZEN: ReadonlyArray<string> = [
  // §1.1 wire-bearing types & constants
  "INTENT_ENVELOPE_VERSION",
  "AUDIT_RECORD_VERSION",
  "BASIS_CODES",
  "KERNEL_REFUSAL_CODES",
  // §1.2 builders / verifiers
  "buildEnvelope",
  "isIntentEnvelope",
  "hasUnknownEnvelopeVersion",
  "buildAuditRecord",
  "verifyAuditRecord",
  "replayEnvelopeFromAudit",
  "sha256Canonical",
  // §1.2 decision constructors
  "decisionExecute",
  "decisionRefuse",
  "decisionEscalate",
  "decisionRequestConfirmation",
  "decisionDefer",
  "decisionRewrite",
  // §1.3 basis helpers
  "basis",
  "isKnownBasisCode",
  // §1.4 Pack contract
  "installPack",
  "assertPackConformance",
  "withBasisAudit",
  "PackConformanceError",
  // §1.6 explanation registry
  "explainRecord",
  "mergeExplanationRegistries",
  "DEFAULT_EXPLANATION_REGISTRY",
  // §1.7 sink helpers
  "noopAuditSink",
  // §1.5 replay classify
  "classify",
  // §1.8 refusal helpers
  "refuse",
  "englishRefusalMessages",
  "resolveRefusalMessage",
  "localizeDecision",
  // taint helpers
  "taintRank",
  "mergeTaint",
  "canPropose",
  "canProposeFieldLevel",
  "meetAll",
  "tainted",
  "isTaintedValue",
  "collectFieldTaints",
];

const KERNEL_FROZEN: ReadonlyArray<string> = [
  "adjudicate",
  "adjudicateWithTrace",
  "adjudicateAndAudit",
  "adjudicateAndLearn",
  "adjudicateWithDeadline",
  "allOf",
  "constant",
  "firstMatch",
  "GuardMetadataSymbol",
  "readGuardMetadata",
  "withMetadata",
  "nameGuard", // deprecation-target
  "describePolicyBundle",
  "GuardFireStats",
  "matchedGuardPhaseFromTrace",
  "matchedGuardIdFromTrace",
  "flattenBasis",
  "hasLearningSink",
  "setLearningSink",
  "recordOutcome",
  "createConsoleLearningSink",
  "_resetLearningSink",
  "InMemoryOutcomeSink",
  "hasOutcomeSink",
  "recordRetrospectiveOutcome",
  "setOutcomeSink",
  "_resetOutcomeSink",
  "createKernelIdentity",
  "createRuntimeContext",
  "getDefaultRuntimeContext",
  "_resetDefaultRuntimeContext",
  "checkRateLimit",
  "createInMemoryRateLimitStore",
  "createRateLimitGuard",
];

const LLM_FROZEN: ReadonlyArray<string> = [
  "staticPlanner",
  "filterReadOnly",
  "isMutating",
  "isReadOnly",
  "assertPlanReadOnly",
  "assertPlanSubsetOfPack",
  "PlanConformanceError",
  "safePlan",
];

function exportedNames(mod: Record<string, unknown>): ReadonlyArray<string> {
  return Object.keys(mod).sort();
}

describe("@adjudicate/core public API surface — v1 freeze matrix", () => {
  it("root barrel: every documented frozen symbol is exported", () => {
    const exported = new Set(exportedNames(root));
    const missing = ROOT_FROZEN.filter((s) => !exported.has(s));
    expect(
      missing,
      `frozen surface declared in V1_FREEZE_MATRIX.md is missing from @adjudicate/core: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("/kernel subpath: every documented frozen symbol is exported", () => {
    const exported = new Set(exportedNames(kernel));
    const missing = KERNEL_FROZEN.filter((s) => !exported.has(s));
    expect(
      missing,
      `frozen surface declared in V1_FREEZE_MATRIX.md is missing from @adjudicate/core/kernel: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("/llm subpath: every documented frozen symbol is exported", () => {
    const exported = new Set(exportedNames(llm));
    const missing = LLM_FROZEN.filter((s) => !exported.has(s));
    expect(
      missing,
      `frozen surface declared in V1_FREEZE_MATRIX.md is missing from @adjudicate/core/llm: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("BASIS_CODES categories are stable", () => {
    const expected = [
      "auth",
      "business",
      "confirmation",
      "deadline",
      "kernel",
      "kill",
      "ledger",
      "schema",
      "state",
      "taint",
      "validation",
    ].sort();
    expect(Object.keys(root.BASIS_CODES).sort()).toEqual(expected);
  });

  it("INTENT_ENVELOPE_VERSION is 2", () => {
    expect(root.INTENT_ENVELOPE_VERSION).toBe(2);
  });

  it("AUDIT_RECORD_VERSION is 5", () => {
    expect(root.AUDIT_RECORD_VERSION).toBe(5);
  });
});
