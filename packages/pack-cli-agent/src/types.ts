import type { AuthorityGraphStore } from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type CliIntentKind = "terminal.run";

export interface TerminalRunPayload {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
}

/**
 * 201 — OPTIONAL injected authority context (032/033/034), mirroring
 * `PixAuthorityContext`. When the host injects it, the authority guard in
 * `authGuards` is BINDING for the mutating UNTRUSTED-min kind `terminal.run`;
 * when absent the guard is inert (pre-201 demo posture).
 *
 * Host-injection contract for cli: the `resource` an envelope's
 * `resourceRefs.resource` names is the cwd / host scope the command acts in (the
 * environment whose owner must authorize a `terminal.run`), and `resourceRefs.owner`
 * is the principal the host's authority graph binds to that scope.
 *
 * ⚠️ IDOR residual (034-F1/F2). `principalOf` is the seam that actually closes
 * IDOR. The host MUST resolve the AUTHENTICATED acting principal from a trusted
 * session→identity map keyed by `actor.sessionId` — NEVER from
 * `resourceRefs.owner` (attacker-controlled) — and its namespace MUST match the
 * authority-graph principal names. WITHOUT `principalOf`, the guard fails CLOSED
 * (REFUSE) rather than falling back to bare declared-owner binding. There is no
 * production authenticated-identity data model yet, so this is the documented
 * host injection point.
 */
export interface CliAuthorityContext {
  /** The injected authority-graph snapshot store (032/033). */
  readonly store: AuthorityGraphStore;
  /**
   * IDOR-closing host-identity seam. Resolves the AUTHENTICATED acting principal
   * from `actor.sessionId` (a trusted host session→identity map) — NEVER from
   * `resourceRefs.owner`. Return `null` for an unauthenticated/unknown session
   * (the guard then REFUSEs, fail-closed). Omit only when the host has no
   * identity model AND accepts the documented IDOR residual.
   */
  readonly principalOf?: (sessionId: string) => string | null;
}

export interface CliState {
  /** Program names (first token, basename) eligible for EXECUTE when safe. */
  readonly allowlist: ReadonlySet<string>;
  /** Allowed working directories. Empty set ⇒ no cwd restriction. */
  readonly allowedCwds: ReadonlySet<string>;
  /** When true, safe commands DEFER awaiting the maintenance-window signal. */
  readonly maintenanceActive?: boolean;
  /**
   * 201 — OPTIONAL injected authority context (032/033/034). When present, the
   * authority guard in `authGuards` is binding for the mutating UNTRUSTED-min
   * kind `terminal.run`; when absent the guard is inert. See `CliAuthorityContext`
   * for the IDOR residual. NOT serialized by `rehydrateCliState` (the store /
   * identity are host infra, not command state) → never enters the audit/replay
   * hash (invariant #4/#5 safe).
   */
  readonly authority?: CliAuthorityContext;
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
