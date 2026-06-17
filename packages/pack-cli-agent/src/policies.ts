import {
  basis,
  BASIS_CODES,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  refuse,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  classifyCommand,
  createCommandRiskGuard,
  createStateDeferGuard,
} from "@adjudicate/primitives";
import {
  CLI_DEFAULT_DEFER_TIMEOUT_MS,
  CLI_MAINTENANCE_SIGNAL,
  cliTaintPolicy,
  commandProgram,
  type CliIntentKind,
  type CliState,
  type TerminalRunPayload,
} from "./types.js";

type CliGuard = Guard<CliIntentKind, unknown, CliState>;

const payloadOf = (p: unknown): Partial<TerminalRunPayload> => (p ?? {}) as Partial<TerminalRunPayload>;
function commandOf(envelope: IntentEnvelope<CliIntentKind, unknown>): string {
  const c = payloadOf(envelope.payload).command;
  return typeof c === "string" ? c : "";
}

// ── state guard: validate the terminal payload + cwd allowlist ───────────────
const validateTerminalPayload: CliGuard = nameGuard("validateTerminalPayload", (envelope, state) => {
  if (envelope.kind !== "terminal.run") return null;
  const p = payloadOf(envelope.payload);
  if (typeof p.command !== "string" || p.command.trim().length === 0) {
    return decisionRefuse(
      refuse("STATE", "command_payload_invalid", "I can't run that command.", "missing or empty command"),
      [basis("schema", BASIS_CODES.schema.PAYLOAD_INVALID, { field: "command" })],
    );
  }
  if (typeof p.cwd === "string" && state.allowedCwds.size > 0 && !state.allowedCwds.has(p.cwd)) {
    return decisionRefuse(
      refuse("BUSINESS_RULE", "cwd_not_allowed", "I can't run a command in that directory.", `cwd ${p.cwd} not allowlisted`),
      [basis("business", BASIS_CODES.business.RULE_VIOLATED, { rule: "cwd_allowlist", cwd: p.cwd })],
    );
  }
  return null;
});

// ── business guards ──────────────────────────────────────────────────────────

// Credential-touching commands ESCALATE to a human. MUST run before the
// command-risk guard: the shipped classifier dispositions "credential" as
// `confirm`, so first-match-wins would otherwise return REQUEST_CONFIRMATION and
// pre-empt the escalation (decision D6).
const escalateCredentialCommands: CliGuard = nameGuard("escalateCredentialCommands", (envelope) => {
  if (envelope.kind !== "terminal.run") return null;
  const command = commandOf(envelope);
  if (command.length === 0) return null;
  const c = classifyCommand(command);
  if (c.category !== "credential") return null;
  return decisionEscalate(
    "human",
    `Credential-touching command requires human review: ${c.matchedRuleIds.join(", ")}`,
    [basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      rule: "credential_escalation",
      category: c.category,
      matchedRuleIds: c.matchedRuleIds,
      command,
    })],
  );
});

// Shipped command-risk classifier (verbatim): destructive → REFUSE/REWRITE,
// network → REQUEST_CONFIRMATION/REWRITE. safe → null (falls through).
const commandRisk: CliGuard = nameGuard(
  "commandRisk",
  createCommandRiskGuard<CliIntentKind, unknown, CliState>({
    matches: (envelope) => envelope.kind === "terminal.run",
    extractCommand: (envelope) => commandOf(envelope),
    commandField: "command",
  }),
);

// During a maintenance window, safe commands DEFER on the pack-id-prefixed
// signal. Placed AFTER command-risk so dangerous commands still REFUSE, not
// DEFER, while in maintenance.
const deferDuringMaintenance: CliGuard = nameGuard(
  "deferDuringMaintenance",
  createStateDeferGuard<CliIntentKind, unknown, CliState>({
    matches: (envelope, state) => envelope.kind === "terminal.run" && state.maintenanceActive === true,
    signal: CLI_MAINTENANCE_SIGNAL,
    timeoutMs: CLI_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [basis("state", BASIS_CODES.state.TRANSITION_VALID, {
      reason: "maintenance_window",
      waitFor: CLI_MAINTENANCE_SIGNAL,
    })],
  }),
);

// EXECUTE only what is PROVABLY safe AND explicitly allowlisted.
const executeAllowlistedSafe: CliGuard = nameGuard("executeAllowlistedSafe", (envelope, state) => {
  if (envelope.kind !== "terminal.run") return null;
  const command = commandOf(envelope);
  if (command.length === 0) return null;
  if (classifyCommand(command).disposition !== "safe") return null;
  const program = commandProgram(command);
  if (!state.allowlist.has(program)) return null;
  return decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED, {
    rule: "allowlisted_safe",
    program,
  })]);
});

// Fail-closed sink: everything that fell through REFUSEs. Converts the demo's
// "EXECUTE anything that falls through" into "REFUSE unless provably safe AND
// allowlisted". Belt-and-suspenders with policy.default = "REFUSE".
const terminalDefaultDeny: CliGuard = nameGuard("terminalDefaultDeny", (envelope) =>
  envelope.kind === "terminal.run"
    ? decisionRefuse(
        refuse("SECURITY", "command_default_deny", "I can't run that command.", "not provably safe and allowlisted"),
        [basis("validation", BASIS_CODES.validation.COMMAND_BLOCKED, { rule: "default_deny" })],
      )
    : null,
);

export const cliAgentPolicyBundle: PolicyBundle<CliIntentKind, unknown, CliState> = {
  stateGuards: [validateTerminalPayload],
  authGuards: [],
  taint: cliTaintPolicy,
  business: [
    escalateCredentialCommands,
    commandRisk,
    deferDuringMaintenance,
    executeAllowlistedSafe,
    terminalDefaultDeny,
  ],
  default: "REFUSE",
};
