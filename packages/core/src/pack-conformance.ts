/**
 * Pack conformance — runtime invariants for `PackV0`.
 *
 * `Pack.basisCodes` declares the refusal-code taxonomy a Pack's policy may
 * emit. The compile-time `satisfies PackV0<...>` clause catches structural
 * drift; this module catches drift that the type system cannot see:
 *
 *   - **boot-time** (`assertPackConformance`): validates required fields
 *     are present, intents/basisCodes are non-empty + unique, and
 *     `default = "EXECUTE"` is rejected unless the adopter explicitly
 *     opts in via `{ allowDefaultExecute: true }` (T4 #20).
 *   - **runtime** (`withBasisAudit`): wraps every guard so any decision
 *     whose basis category:code is outside `BASIS_CODES` records a
 *     `basis_code_drift` sink failure. REFUSE codes outside
 *     `pack.basisCodes ∪ KERNEL_REFUSAL_CODES` also record drift.
 *     REWRITE taint regression (rewritten.taint > envelope.taint) records
 *     `rewrite_taint_regression`. DEFER signal outside `pack.signals`
 *     records `defer_signal_drift`. Decisions are NOT blocked — drift is
 *     a telemetry event, mirroring the audit-fail-open posture of the
 *     pre-T4 wrapper.
 *
 * Kernel-vocabulary refusals (schema, taint, default_deny, kill, deadline,
 * ledger_replay_suppressed) are exempt — those codes belong to the
 * framework and live outside the Pack's taxonomy.
 */

import { isKnownBasisCode } from "./basis-codes.js";
import type { Decision } from "./decision.js";
import type { IntentEnvelope } from "./envelope.js";
import { recordSinkFailure } from "./kernel/metrics.js";
import type { Guard, PolicyBundle } from "./kernel/policy.js";
import type { PackV0 } from "./pack.js";
import { taintRank } from "./taint.js";

export class PackConformanceError extends Error {
  constructor(
    public readonly packId: string,
    public readonly violations: ReadonlyArray<string>,
  ) {
    super(
      `Pack "${packId}" failed conformance: ${violations.join("; ")}`,
    );
    this.name = "PackConformanceError";
  }
}

/**
 * Refusal codes the kernel itself may emit (not domain-specific). These
 * codes pass through `withBasisAudit` without contributing to drift —
 * they're the framework's vocabulary, not the Pack's.
 */
export const KERNEL_REFUSAL_CODES: ReadonlySet<string> = new Set([
  "schema_version_unsupported",
  "taint_level_insufficient",
  "default_deny",
  "kill_switch_active",
  "kernel_deadline_exceeded",
  "ledger_replay_suppressed",
]);

export interface AssertPackConformanceOptions {
  /**
   * When false (default), `policy.default = "EXECUTE"` throws
   * `PackConformanceError`. Adopters with read-only Packs explicitly opt
   * in. T4 (#20): the framework should refuse a fail-open default by
   * default — silent EXECUTE on no-guard-matched is the most direct
   * authority leak.
   */
  readonly allowDefaultExecute?: boolean;
}

/**
 * Boot-time conformance check. Throws `PackConformanceError` if the Pack
 * violates any contract invariant. Adopters typically call this once at
 * startup (or `installPack` does it on their behalf).
 */
export function assertPackConformance<
  K extends string,
  P,
  S,
  C,
>(
  pack: PackV0<K, P, S, C>,
  options: AssertPackConformanceOptions = {},
): void {
  const violations: string[] = [];

  if (typeof pack.id !== "string" || pack.id.length === 0) {
    violations.push("id must be a non-empty string");
  }
  if (typeof pack.version !== "string" || pack.version.length === 0) {
    violations.push("version must be a non-empty string");
  }
  if (pack.contract !== "v0") {
    violations.push(`contract must be "v0" (got ${String(pack.contract)})`);
  }
  if (!Array.isArray(pack.intents) || pack.intents.length === 0) {
    violations.push("intents must be a non-empty array");
  } else {
    const seen = new Set<string>();
    for (const k of pack.intents) {
      if (seen.has(k)) {
        violations.push(`duplicate intent kind "${k}"`);
      }
      seen.add(k);
    }
  }
  if (!Array.isArray(pack.basisCodes) || pack.basisCodes.length === 0) {
    violations.push("basisCodes must be a non-empty array");
  } else {
    const seen = new Set<string>();
    for (const c of pack.basisCodes) {
      if (typeof c !== "string" || c.length === 0) {
        violations.push("basisCodes entries must be non-empty strings");
        break;
      }
      if (seen.has(c)) {
        violations.push(`duplicate basis code "${c}"`);
      }
      seen.add(c);
    }
  }
  if (pack.policy === undefined || pack.policy === null) {
    violations.push("policy is required");
  }
  if (pack.planner === undefined || pack.planner === null) {
    violations.push("planner is required");
  }

  // T4 #20: refuse default = EXECUTE unless opted in. The framework's
  // recommended polarity is REFUSE; an EXECUTE default is the most
  // direct authority leak and should be a deliberate, documented choice.
  if (
    pack.policy &&
    pack.policy.default === "EXECUTE" &&
    options.allowDefaultExecute !== true
  ) {
    violations.push(
      "policy.default = \"EXECUTE\" requires explicit { allowDefaultExecute: true } opt-in",
    );
  }

  // T4 #38 (partial): if signals are declared, validate their shape.
  if (pack.signals !== undefined) {
    if (!Array.isArray(pack.signals)) {
      violations.push("signals must be an array when present");
    } else {
      const seen = new Set<string>();
      for (const s of pack.signals) {
        if (typeof s !== "string" || s.length === 0) {
          violations.push("signals entries must be non-empty strings");
          break;
        }
        if (seen.has(s)) {
          violations.push(`duplicate signal "${s}"`);
        }
        seen.add(s);
      }
    }
  }

  if (violations.length > 0) {
    throw new PackConformanceError(pack.id ?? "<unknown>", violations);
  }
}

/**
 * Wrap every guard in the Pack's PolicyBundle so the wrapper observes
 * drift events without altering Decisions:
 *
 *   - REFUSE with `refusal.code` outside `pack.basisCodes ∪ KERNEL`
 *     records `basis_code_drift`.
 *   - Any decision with a basis category:code outside `BASIS_CODES`
 *     records `basis_vocabulary_drift`.
 *   - REWRITE with `rewritten.taint` of higher rank than `envelope.taint`
 *     records `rewrite_taint_regression`.
 *   - DEFER with a `signal` outside `pack.signals` (when declared)
 *     records `defer_signal_drift`.
 *
 * Decisions are returned unchanged. The wrapper mirrors the audit-fail-open
 * posture of the pre-T4 wrapper: drift is observed, not blocked.
 */
export function withBasisAudit<
  K extends string,
  P,
  S,
  C,
>(pack: PackV0<K, P, S, C>): PackV0<K, P, S, C> {
  const declaredCodes = new Set<string>(pack.basisCodes);
  const declaredSignals = pack.signals
    ? new Set<string>(pack.signals)
    : null;
  return {
    ...pack,
    policy: wrapBundle(pack.policy, declaredCodes, declaredSignals, pack.id),
  };
}

function wrapBundle<K extends string, P, S>(
  bundle: PolicyBundle<K, P, S>,
  declaredCodes: ReadonlySet<string>,
  declaredSignals: ReadonlySet<string> | null,
  packId: string,
): PolicyBundle<K, P, S> {
  const wrap = (
    guards: ReadonlyArray<Guard<K, P, S>>,
  ): ReadonlyArray<Guard<K, P, S>> =>
    guards.map((g) => wrapGuard(g, declaredCodes, declaredSignals, packId));
  return {
    stateGuards: wrap(bundle.stateGuards),
    authGuards: wrap(bundle.authGuards),
    taint: bundle.taint,
    business: wrap(bundle.business),
    default: bundle.default,
  };
}

function wrapGuard<K extends string, P, S>(
  guard: Guard<K, P, S>,
  declaredCodes: ReadonlySet<string>,
  declaredSignals: ReadonlySet<string> | null,
  packId: string,
): Guard<K, P, S> {
  return (envelope: IntentEnvelope<K, P>, state: S) => {
    const decision: Decision | null = guard(envelope, state);
    if (decision !== null) {
      auditDecision(decision, envelope, declaredCodes, declaredSignals, packId);
    }
    return decision;
  };
}

function auditDecision<K extends string, P>(
  decision: Decision,
  envelope: IntentEnvelope<K, P>,
  declaredCodes: ReadonlySet<string>,
  declaredSignals: ReadonlySet<string> | null,
  packId: string,
): void {
  // ── 1. Refusal-code drift (existing behaviour). ───────────────────
  if (decision.kind === "REFUSE") {
    const code = decision.refusal.code;
    if (!declaredCodes.has(code) && !KERNEL_REFUSAL_CODES.has(code)) {
      recordSinkFailure({
        sink: "console",
        subject: `pack:${packId}:${code}`,
        errorClass: "basis_code_drift",
        consecutiveFailures: 1,
      });
    }
  }

  // ── 2. T4: basis-vocabulary drift across all decision kinds. ──────
  for (const b of decision.basis) {
    if (!isKnownBasisCode(b)) {
      recordSinkFailure({
        sink: "console",
        subject: `pack:${packId}:${b.category}:${String(b.code)}`,
        errorClass: "basis_vocabulary_drift",
        consecutiveFailures: 1,
      });
    }
  }

  // ── 3. T4: REWRITE taint regression. ─────────────────────────────
  if (decision.kind === "REWRITE") {
    if (taintRank(decision.rewritten.taint) > taintRank(envelope.taint)) {
      recordSinkFailure({
        sink: "console",
        subject: `pack:${packId}:rewrite:${envelope.taint}->${decision.rewritten.taint}`,
        errorClass: "rewrite_taint_regression",
        consecutiveFailures: 1,
      });
    }
  }

  // ── 4. T4: DEFER signal vocabulary drift. ────────────────────────
  if (decision.kind === "DEFER" && declaredSignals !== null) {
    if (!declaredSignals.has(decision.signal)) {
      recordSinkFailure({
        sink: "console",
        subject: `pack:${packId}:defer:${decision.signal}`,
        errorClass: "defer_signal_drift",
        consecutiveFailures: 1,
      });
    }
  }
}
