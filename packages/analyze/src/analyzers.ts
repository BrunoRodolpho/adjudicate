/**
 * Tier 1 analyzers — metadata-driven static checks for @adjudicate Packs.
 *
 * Each analyzer is a pure function over the Pack object. No source-file
 * AST parsing yet (deferred to Tier 2 post-M2). The analyzers read:
 *   - `Pack.policy.stateGuards`, `Pack.policy.authGuards`, `Pack.policy.business`
 *   - `Pack.policy.taint.minimumFor(kind)` per intent kind
 *   - `Pack.policy.default`
 *   - `Pack.intents`, `Pack.basisCodes`, `Pack.signals`
 *   - `readGuardMetadata(guard)` for each guard
 */

import type { PackV0 } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import type { Analyzer, Diagnostic } from "./types.js";
import { eachGuard, guardLabel } from "./internal/walk.js";

// ─── AJD-101: MissingMetadataAnalyzer ──────────────────────────────────────

export const missingMetadataAnalyzer: Analyzer = {
  name: "MissingMetadataAnalyzer",
  code: "AJD-101",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    eachGuard(pack, (guard, phase, index) => {
      const meta = readGuardMetadata(guard);
      const hasName =
        meta?.name !== undefined ||
        (typeof (guard as { name?: unknown }).name === "string" &&
          ((guard as { name: string }).name as string).length > 0);
      const hasDescription = meta?.description !== undefined;
      if (!hasName && !hasDescription) {
        diagnostics.push({
          code: "AJD-101",
          severity: "warning",
          message: `Guard ${phase}[${index}] has no metadata (no name and no GuardDescription).`,
          description:
            "Wrap factory-built guards with `nameGuard(\"...\", ...)` so trace + learning events identify them. Per ADR-105, anonymous guards are first-class — but they're invisible to operators investigating audit trails.",
          guardId: `${phase}[${index}]`,
          phase,
          detail: { hasName, hasDescription },
        });
      }
    });
    return diagnostics;
  },
};

// ─── AJD-102: SignalConsistencyAnalyzer ────────────────────────────────────

export const signalConsistencyAnalyzer: Analyzer = {
  name: "SignalConsistencyAnalyzer",
  code: "AJD-102",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    const declaredSignals: ReadonlySet<string> = new Set(pack.signals ?? []);
    const observedSignals = new Set<string>();
    eachGuard(pack, (guard, phase, index) => {
      const meta = readGuardMetadata(guard);
      if (meta?.description?.kind === "state_defer") {
        const signal = meta.description.signal;
        observedSignals.add(signal);
        if (!declaredSignals.has(signal)) {
          diagnostics.push({
            code: "AJD-102",
            severity: "error",
            message: `Guard ${guardLabel(
              guard,
              phase,
              index,
            )} defers on signal '${signal}' but signal is not in Pack.signals.`,
            description:
              "Add the signal to Pack.signals so consumers (Operator Console, replay tools) can enumerate the wire surface this Pack parks on.",
            guardId: guardLabel(guard, phase, index),
            phase,
            detail: { signal, declaredSignals: [...declaredSignals] },
          });
        }
      }
    });
    // The inverse: declared signals with no parking guard. (Note: warning, not error.)
    for (const declared of declaredSignals) {
      if (!observedSignals.has(declared)) {
        diagnostics.push({
          code: "AJD-102",
          severity: "warning",
          message: `Pack declares signal '${declared}' in Pack.signals but no DEFER guard emits it.`,
          description:
            "Either remove the signal from Pack.signals or annotate the parking guard with GuardMetadata.description = { kind: 'state_defer', signal, timeoutMs }.",
          detail: { signal: declared },
        });
      }
    }
    return diagnostics;
  },
};

// ─── AJD-103: BasisCodeConsistencyAnalyzer ─────────────────────────────────
//
// Note: this Tier 1 implementation can only verify metadata-declared codes
// (system_taint variant). Tier 2 (AST) verifies every `basis(...)` call.

export const basisCodeConsistencyAnalyzer: Analyzer = {
  name: "BasisCodeConsistencyAnalyzer",
  code: "AJD-103",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    if (pack.basisCodes === undefined || pack.basisCodes.length === 0) {
      diagnostics.push({
        code: "AJD-103",
        severity: "warning",
        message: "Pack.basisCodes is empty.",
        description:
          "Pack.basisCodes declares the refusal-code vocabulary the Pack may emit. An empty declaration means downstream tooling (audit dashboards, drift detectors) cannot validate this Pack's emissions. Add the codes your guards emit.",
      });
    }
    // Tier 1 cannot reach into guard bodies. The Tier 2 analyzer (Phase
    // M3+) will walk the AST and verify every `basis(...)` call site.
    return diagnostics;
  },
};

// ─── AJD-104: RewriteScopeAnalyzer ─────────────────────────────────────────
//
// Tier 1 implementation checks GuardMetadata.description.kind === "rewrite"
// against the declared mutatesPayloadFields. Tier 2 walks the AST to verify
// the guard's actual REWRITE return value matches.

export const rewriteScopeAnalyzer: Analyzer = {
  name: "RewriteScopeAnalyzer",
  code: "AJD-104",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    eachGuard(pack, (guard, phase, index) => {
      const meta = readGuardMetadata(guard);
      if (meta?.description?.kind === "rewrite") {
        if (
          meta.description.mutatesPayloadFields === undefined ||
          meta.description.mutatesPayloadFields.length === 0
        ) {
          diagnostics.push({
            code: "AJD-104",
            severity: "error",
            message: `Guard ${guardLabel(
              guard,
              phase,
              index,
            )} declares kind='rewrite' but mutatesPayloadFields is empty.`,
            description:
              "REWRITE guards MUST declare which payload fields they may modify. Tier 2 analyzers enforce this at the AST level; for Tier 1 we require non-empty declaration.",
            guardId: guardLabel(guard, phase, index),
            phase,
          });
        }
      }
      // ADR-117: a data_classification guard with action REWRITE redacts
      // fields drawn from scannedFields — the same REWRITE-scope discipline
      // applies. An empty scannedFields whitelist declares no scope.
      if (
        meta?.description?.kind === "data_classification" &&
        meta.description.action === "REWRITE" &&
        meta.description.scannedFields.length === 0
      ) {
        diagnostics.push({
          code: "AJD-104",
          severity: "error",
          message: `Guard ${guardLabel(
            guard,
            phase,
            index,
          )} declares kind='data_classification' action='REWRITE' but scannedFields is empty.`,
          description:
            "Data-classification REWRITE guards MUST declare the payload fields they may scan/redact (scannedFields). An empty whitelist declares no scope.",
          guardId: guardLabel(guard, phase, index),
          phase,
        });
      }
    });
    return diagnostics;
  },
};

// ─── AJD-105: TaintPolicyAnalyzer ──────────────────────────────────────────

export const taintPolicyAnalyzer: Analyzer = {
  name: "TaintPolicyAnalyzer",
  code: "AJD-105",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    const intents = pack.intents ?? [];
    const taint = (pack.policy as { taint: { minimumFor(k: string): unknown } })
      .taint;
    for (const kind of intents) {
      let result: unknown;
      try {
        result = taint.minimumFor(kind);
      } catch {
        diagnostics.push({
          code: "AJD-105",
          severity: "error",
          message: `Pack.policy.taint.minimumFor('${kind}') threw.`,
          description:
            "Every declared intent kind must produce a Taint value (SYSTEM/TRUSTED/UNTRUSTED) without throwing. A throwing taint policy panics the kernel via the T-002 guard-isolation path.",
          detail: { kind },
        });
        continue;
      }
      if (result !== "SYSTEM" && result !== "TRUSTED" && result !== "UNTRUSTED") {
        diagnostics.push({
          code: "AJD-105",
          severity: "error",
          message: `Pack.policy.taint.minimumFor('${kind}') returned an invalid Taint value.`,
          description:
            "TaintPolicy.minimumFor must return one of SYSTEM, TRUSTED, UNTRUSTED.",
          detail: { kind, returned: result },
        });
      }
    }
    return diagnostics;
  },
};

// ─── AJD-106: DefaultPolarityAnalyzer ──────────────────────────────────────

export const defaultPolarityAnalyzer: Analyzer = {
  name: "DefaultPolarityAnalyzer",
  code: "AJD-106",
  analyze<K extends string, P, S, C>(pack: PackV0<K, P, S, C>) {
    const diagnostics: Diagnostic[] = [];
    const policy = pack.policy as { default: "REFUSE" | "EXECUTE" };
    if (policy.default === "EXECUTE") {
      diagnostics.push({
        code: "AJD-106",
        severity: "warning",
        message: "Pack.policy.default = 'EXECUTE' (fail-open).",
        description:
          "Fail-open default means an intent that no positive guard matches is EXECUTEd. Use only for read-only or confirmation intent kinds; for any mutation surface, prefer 'REFUSE' (fail-closed). Suppress this diagnostic via `assertPackConformance({ allowDefaultExecute: true })`.",
        detail: { default: "EXECUTE" },
      });
    }
    return diagnostics;
  },
};

/** Default analyzer pipeline. Ordered by AJD code. */
export const DEFAULT_ANALYZERS: ReadonlyArray<Analyzer> = [
  missingMetadataAnalyzer,
  signalConsistencyAnalyzer,
  basisCodeConsistencyAnalyzer,
  rewriteScopeAnalyzer,
  taintPolicyAnalyzer,
  defaultPolarityAnalyzer,
];
