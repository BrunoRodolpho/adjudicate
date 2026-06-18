import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type CliIntentKind = "terminal.run";

export interface TerminalRunPayload {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
}

export interface CliState {
  /** Program names (first token, basename) eligible for EXECUTE when safe. */
  readonly allowlist: ReadonlySet<string>;
  /** Allowed working directories. Empty set ⇒ no cwd restriction. */
  readonly allowedCwds: ReadonlySet<string>;
  /** When true, safe commands DEFER awaiting the maintenance-window signal. */
  readonly maintenanceActive?: boolean;
}

/**
 * Pack-id-prefixed DEFER signal (decision L3): the prefix keeps the composition
 * analyzer (#11) from false-positiving on a signal collision (AJD-108).
 */
export const CLI_MAINTENANCE_SIGNAL = "pack-cli-agent:maintenance_window";
export const CLI_DEFAULT_DEFER_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Terminal commands are LLM-proposed (UNTRUSTED floor). No system-only kinds —
 * the real gating is the command-risk classifier + the default-deny sink, not
 * the taint floor. `terminal.run` from an LLM must reach the guards to be
 * adjudicated, so the floor stays at UNTRUSTED.
 */
export const cliTaintPolicy = createSystemTaintPolicy({ systemOnlyKinds: [] });

/** Program name (first token, basename) used for the EXECUTE allowlist check. */
export function commandProgram(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return first.split("/").pop() ?? first;
}
