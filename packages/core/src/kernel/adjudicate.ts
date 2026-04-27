/**
 * adjudicate() — the pure deterministic heart of the framework.
 *
 * Takes a proposed IntentEnvelope, the current state snapshot, and a
 * PolicyBundle. Returns a single Decision. No LLM calls. No side effects. No
 * randomness. Same inputs always produce the same output — the replay harness
 * depends on this.
 *
 * Evaluation order (strict — do not reorder):
 *   1. Kill switch    — operator-engaged global override (engages before schema)
 *   2. Schema version — unknown versions are SECURITY refusals
 *   3. stateGuards    — legality of the transition the intent proposes
 *   4. taint gate     — provenance check via canPropose() (T8: moved ahead of auth)
 *   5. authGuards     — caller identity and scope
 *   6. business       — domain-specific rules
 *   7. policy.default
 *
 * **T8 reorder:** the taint gate runs BEFORE auth guards. Auth guards
 * with side effects (logging principals, querying permission services)
 * previously executed on UNTRUSTED inputs; now UNTRUSTED short-circuits
 * before any auth side effect. The refusal-code distribution in audit
 * history shifts as a result — taint refusals on UNTRUSTED inputs that
 * would also have failed auth now surface the taint refusal instead.
 *
 * Each guard returning null contributes a "pass" basis to the final decision.
 */

import { basis, BASIS_CODES, type DecisionBasis } from "../basis-codes.js";
import { canPropose } from "../taint.js";
import {
  decisionExecute,
  decisionRefuse,
  type Decision,
} from "../decision.js";
import {
  INTENT_ENVELOPE_VERSION,
  type IntentEnvelope,
} from "../envelope.js";
import { refuse } from "../refusal.js";
import { getKillSwitchState, isKilled } from "./enforce-config.js";
import type { PolicyBundle } from "./policy.js";
import { makePassBasis } from "./basis.js";

export function adjudicate<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
): Decision {
  // 0. Kill switch — operator-engaged global override. Engages BEFORE the
  //    schema-version check so a malformed envelope still gets refused with
  //    a clear "system is in maintenance" code rather than the generic
  //    schema_version_unsupported.
  if (isKilled()) {
    const kill = getKillSwitchState();
    return decisionRefuse(
      refuse(
        "SECURITY",
        "kill_switch_active",
        "Sistema temporariamente indisponível.",
        `Kill switch active: ${kill.reason} (toggled at ${kill.toggledAt})`,
      ),
      [
        basis("kill", BASIS_CODES.kill.ACTIVE, {
          reason: kill.reason,
          toggledAt: kill.toggledAt,
        }),
      ],
    );
  }

  const accumulated: DecisionBasis[] = [];

  // 1. Schema version gate — we accept only the known version. Callers that
  //    receive decoded JSON use hasUnknownEnvelopeVersion() upstream; this
  //    check is the last line of defense inside the kernel.
  if (envelope.version !== INTENT_ENVELOPE_VERSION) {
    return decisionRefuse(
      refuse(
        "SECURITY",
        "schema_version_unsupported",
        "Não foi possível processar essa ação no momento.",
        `Unknown envelope version: ${String((envelope as { version?: unknown }).version)}`,
      ),
      [
        basis("schema", BASIS_CODES.schema.VERSION_UNSUPPORTED, {
          seen: (envelope as { version?: unknown }).version,
          supported: INTENT_ENVELOPE_VERSION,
        }),
      ],
    );
  }
  accumulated.push(basis("schema", BASIS_CODES.schema.VERSION_SUPPORTED));

  // 2. State guards
  for (const guard of policy.stateGuards) {
    const d = guard(envelope, state);
    if (d !== null) return enrichBasis(d, accumulated);
  }
  accumulated.push(makePassBasis("state"));

  // 3. Taint gate (T8 reorder: now BEFORE auth, so UNTRUSTED inputs
  //    short-circuit before any auth-guard side effect runs).
  //    Declarative, driven by policy.taint. `canPropose()` is the single
  //    call — do not walk payload fields by inspection. Field-level taint
  //    (v1.1) gains precision transparently through this call.
  if (!canPropose(envelope.taint, envelope.kind, policy.taint)) {
    return decisionRefuse(
      refuse(
        "SECURITY",
        "taint_level_insufficient",
        "Não posso realizar essa ação com a informação disponível.",
        `Taint ${envelope.taint} insufficient for intent kind ${envelope.kind}`,
      ),
      [
        ...accumulated,
        basis("taint", BASIS_CODES.taint.LEVEL_INSUFFICIENT, {
          actual: envelope.taint,
          kind: envelope.kind,
        }),
      ],
    );
  }
  accumulated.push(makePassBasis("taint"));

  // 4. Auth guards (T8 reorder: now AFTER taint).
  for (const guard of policy.authGuards) {
    const d = guard(envelope, state);
    if (d !== null) return enrichBasis(d, accumulated);
  }
  accumulated.push(makePassBasis("auth"));

  // 5. Business rules
  for (const guard of policy.business) {
    const d = guard(envelope, state);
    if (d !== null) return enrichBasis(d, accumulated);
  }
  accumulated.push(makePassBasis("business"));

  // 6. Policy default
  if (policy.default === "EXECUTE") {
    return decisionExecute(accumulated);
  }
  return decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "default_deny",
      "Essa ação não é permitida neste momento.",
    ),
    accumulated,
  );
}

/**
 * Prepend the accumulated "pass" bases to a Decision returned by a guard.
 * This preserves the full audit trail of everything that ran before the
 * short-circuit.
 */
function enrichBasis(decision: Decision, passed: DecisionBasis[]): Decision {
  const merged: DecisionBasis[] = [...passed, ...decision.basis];
  switch (decision.kind) {
    case "EXECUTE":
      return { kind: "EXECUTE", basis: merged };
    case "REFUSE":
      return { kind: "REFUSE", refusal: decision.refusal, basis: merged };
    case "ESCALATE":
      return {
        kind: "ESCALATE",
        to: decision.to,
        reason: decision.reason,
        basis: merged,
      };
    case "REQUEST_CONFIRMATION":
      return {
        kind: "REQUEST_CONFIRMATION",
        prompt: decision.prompt,
        basis: merged,
      };
    case "DEFER":
      return {
        kind: "DEFER",
        signal: decision.signal,
        timeoutMs: decision.timeoutMs,
        basis: merged,
      };
    case "REWRITE":
      return {
        kind: "REWRITE",
        rewritten: decision.rewritten,
        reason: decision.reason,
        basis: merged,
      };
  }
}
