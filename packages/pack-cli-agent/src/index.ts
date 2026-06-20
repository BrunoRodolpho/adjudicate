/**
 * @adjudicate/pack-cli-agent — default-deny CLI/terminal agent Pack (ADR-139).
 *
 * Composes the SHIPPED createCommandRiskGuard into a complete, fail-closed Pack
 * that exercises all six Decision outcomes for terminal.run:
 *   - REFUSE    malformed payload / disallowed cwd / irrecoverable command (rm -rf /)
 *   - ESCALATE  credential-touching commands (~/.ssh, aws credentials, secrets)
 *   - REWRITE   strippable dangerous flag (e.g. rm -r --force → rm -r)
 *   - REQUEST_CONFIRMATION  recoverable network/destructive command (curl …)
 *   - DEFER     safe command during a maintenance window
 *   - EXECUTE   provably-safe AND explicitly-allowlisted command
 *
 * Closes the inline demo's fail-open hole (kernel-runner.ts): instead of
 * "EXECUTE anything that falls through", the default-deny sink + policy.default
 * REFUSE mean "EXECUTE only what is provably safe and allowlisted".
 */
import type { PackV0 } from "@adjudicate/core";
import { cliAgentPolicyBundle } from "./policies.js";
import { CLI_MAINTENANCE_SIGNAL, type CliIntentKind, type CliState } from "./types.js";

/** Rehydrate CliState from JSON (arrays → Sets) for replay/cross-process load. */
export function rehydrateCliState(raw: unknown): CliState {
  const r = (raw ?? {}) as { allowlist?: unknown; allowedCwds?: unknown; maintenanceActive?: unknown };
  const toSet = (v: unknown): ReadonlySet<string> =>
    v instanceof Set
      ? (v as Set<string>)
      : Array.isArray(v)
        ? new Set(v.filter((x): x is string => typeof x === "string"))
        : new Set<string>();
  return {
    allowlist: toSet(r.allowlist),
    allowedCwds: toSet(r.allowedCwds),
    maintenanceActive: r.maintenanceActive === true,
  };
}

export * from "./types.js";
export { cliAgentPolicyBundle } from "./policies.js";

export const cliAgentPack = {
  id: "pack-cli-agent",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: ["terminal.run"],
  policy: cliAgentPolicyBundle,
  planner: {
    plan: () => ({ visibleReadTools: [] as const, allowedIntents: ["terminal.run"] as const }),
  },
  basisCodes: [
    "schema:payload_invalid",
    "business:rule_violated",
    "business:rule_satisfied",
    "validation:command_blocked",
    "validation:command_flag_stripped",
    "state:transition_valid",
    // 201 — the authority guard's REFUSE code (Refusal.code, bare — the form
    // `withBasisAudit` drift-checks). Declaring it suppresses the observe-only
    // `basis_code_drift` telemetry on the §D #8 owner-predicate refusal.
    "tenant_binding_violation",
  ],
  signals: [CLI_MAINTENANCE_SIGNAL],
  rehydrateState: rehydrateCliState,
} as const satisfies PackV0<CliIntentKind, unknown, CliState, unknown>;
