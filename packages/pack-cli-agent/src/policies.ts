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

/** The `args` array, string-filtered. A real runner executes command + args. */
function argsOf(envelope: IntentEnvelope<CliIntentKind, unknown>): ReadonlyArray<string> {
  const a = payloadOf(envelope.payload).args;
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Full proposed command line = `command` + `args`, joined. The risk classifier
 * and credential escalation MUST see THIS, not `command` alone: an LLM that
 * splits the dangerous part into `args` — `{command:"rm", args:["-rf","/"]}` or
 * `{command:"cat", args:["~/.ssh/id_rsa"]}` — would otherwise bypass the entire
 * risk chain, since the classifier only ever saw "rm"/"cat" (ADR-139 §args).
 */
function fullCommandOf(envelope: IntentEnvelope<CliIntentKind, unknown>): string {
  const command = commandOf(envelope);
  const args = argsOf(envelope);
  return args.length > 0 ? [command, ...args].join(" ") : command;
}

/**
 * Shell metacharacters + filename-expansion characters. Any of these means the
 * proposed command is NOT a single literal invocation: a shell would spawn/chain
 * a different command (`;` `&&` `|` backtick `$()` `<` `>` `(` `)`), or expand
 * globs/home (`*` `?` `~`) into different effective arguments (`rm *` deletes the
 * cwd). The EXECUTE path rejects them — the classifier's "matched no deny rule"
 * verdict is NOT proof of safety once a shell gets to reinterpret the string.
 */
const SHELL_METACHARACTERS = /[`$;&|<>(){}\n\r\\'"*?~]/;

/**
 * Programs whose job is to DELEGATE execution to another (often non-allowlisted)
 * program. Allowlisting `env`/`xargs`/`sh`/`timeout` must NOT become a vehicle to
 * run `rm` (`env FOO=1 rm -rf /`, `xargs rm`, `sh -c 'rm …'`) — that defeats the
 * allowlist's program-IDENTITY guarantee (the structured/wrapper analogue of
 * shell substitution). Denied on the EXECUTE path regardless of the allowlist.
 *
 * This list is BEST-EFFORT, not exhaustive — see isProvablySafeShape's contract
 * note. It covers shells, language interpreters, generic launchers, and common
 * tools with a documented shell-escape (vi/less/gdb/make/…).
 */
const EXEC_DELEGATING_PROGRAMS = new Set<string>([
  // generic launchers / wrappers
  "env", "xargs", "timeout", "nohup", "nice", "setsid", "stdbuf", "watch", "time",
  "ionice", "chroot", "unshare", "flock", "sudo", "doas", "su", "ssh", "script",
  "expect", "socat", "parallel", "rlwrap", "run-parts", "busybox",
  // shells
  "sh", "bash", "zsh", "dash", "ksh", "fish", "csh", "tcsh", "pwsh", "powershell",
  // language interpreters
  "node", "deno", "bun", "python", "python2", "python3", "perl", "ruby", "php",
  "lua", "tclsh", "wish", "awk", "gawk", "nawk", "rscript",
  // tools with a documented shell-escape / recipe execution
  "gdb", "lldb", "vi", "vim", "nvim", "view", "ex", "less", "more", "man",
  "emacs", "make", "cmake", "screen", "tmux",
]);

/**
 * Argument markers that smuggle a child command into an otherwise-benign carrier
 * program (GNU tar checkpoint/`--to-program`, `find -exec`, `sort
 * --compress-program`, `rsync --rsh`, `git -c core.pager=`/`alias.`, ssh
 * `ProxyCommand`, …). These reach EXECUTE with an allowlisted carrier yet run an
 * arbitrary command. BEST-EFFORT — see isProvablySafeShape's contract note.
 */
const DELEGATION_ARG_MARKER =
  /(^|=)(exec|run|command)=|--?exec(dir)?\b|--checkpoint-action\b|--to-command\b|--to-program\b|--(use-)?compress-program\b|--rsh\b|--pager\b|--editor\b|core\.pager\b|\balias\.|ProxyCommand\b/i;

/** A command that delegates execution to another program is never a safe EXECUTE shape. */
function delegatesExecution(program: string, command: string, args: ReadonlyArray<string>): boolean {
  if (EXEC_DELEGATING_PROGRAMS.has(program)) return true;
  return [command, ...args].some((token) => DELEGATION_ARG_MARKER.test(token));
}

/**
 * Positive structural safety gate for the EXECUTE path. A command is a provably
 * safe SHAPE only when: (a) neither the command nor any arg carries a shell/glob
 * metacharacter (so it requires explicit literal paths — pass values with spaces
 * via the structured `args` array, not quotes); (b) the program token is a bare
 * name (no `/`) — a path-qualified program (`/bin/rm`) lets the basename allowlist
 * and the classifier disagree about which program runs; and (c) it does not
 * delegate execution to another program (wrapper program or `-exec`-style marker).
 *
 * SCOPE OF THE GUARANTEE (read before trusting EXECUTE): this guarantees the
 * named, allowlisted program runs with LITERAL args and cannot be reinterpreted,
 * expanded, substituted, or used as a launcher for a *different* program. It does
 * NOT — and a program-name allowlist fundamentally CANNOT — guarantee that a
 * dual-use program is harmless: an allowlisted `rm`/`chmod`/`dd` can still destroy
 * data, and a multitool may expose a delegation flag this best-effort denylist
 * does not yet enumerate. THEREFORE: operators MUST allowlist only single-purpose,
 * non-delegating tools (e.g. `ls`, `cat`, `echo`, `pwd`, `date`, `head`, `wc`) —
 * NOT shells, interpreters, or multitools (`sh`, `python`, `tar`, `git`, `find`,
 * `env`, `make`). The wrapper/marker denylists below are defense-in-depth that
 * shrink the blast radius of a mis-allowlisted carrier; they are not a substitute
 * for a disciplined allowlist. The command-risk classifier additionally REFUSEs
 * the catastrophic destructive forms it knows (rm -rf /, dd/mkfs/shred to a device).
 */
function isProvablySafeShape(command: string, args: ReadonlyArray<string>): boolean {
  for (const token of [command, ...args]) {
    if (SHELL_METACHARACTERS.test(token)) return false;
  }
  const program = command.trim().split(/\s+/)[0] ?? "";
  if (program.includes("/")) return false;
  return !delegatesExecution(program, command, args);
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
  const command = fullCommandOf(envelope);
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
    extractCommand: (envelope) => fullCommandOf(envelope),
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

// EXECUTE only what is PROVABLY safe AND explicitly allowlisted. "Provably safe"
// is a positive shape check (single bare-program invocation, no shell
// metacharacters, args classified too), NOT merely "the deny-list classifier
// found nothing" — see isProvablySafeShape / fullCommandOf.
const executeAllowlistedSafe: CliGuard = nameGuard("executeAllowlistedSafe", (envelope, state) => {
  if (envelope.kind !== "terminal.run") return null;
  const command = commandOf(envelope);
  if (command.length === 0) return null;
  // Classify command + args together so a dangerous arg still blocks EXECUTE.
  if (classifyCommand(fullCommandOf(envelope)).disposition !== "safe") return null;
  // Positive shape gate: reject substitution/chaining/redirection + path-qualified
  // programs before the allowlist is ever consulted.
  if (!isProvablySafeShape(command, argsOf(envelope))) return null;
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
