// Per-intent enforcement + shadow configuration.
//
// IBX-IGE v2.0 mandates that the kernel-vs-legacy authority flip happen
// per-intent class, not globally. A single `IBX_KERNEL_ENFORCE=true` would
// be the highest-risk production cutover in the framework's lifecycle —
// blast radius spans every mutating intent at once. Per-intent rollout
// stages high-risk intents (financial reversals) behind low-risk ones
// (read-like mutations), each with its own 7-day shadow soak.
//
// Env vars:
//   IBX_KERNEL_SHADOW  — comma-separated list of intent kinds (or "*")
//                        that run adjudicate() alongside legacy. Logs
//                        divergences but legacy stays authoritative.
//   IBX_KERNEL_ENFORCE — comma-separated list (or "*") where adjudicate()
//                        IS authoritative. Bypasses the legacy boolean path.

const WILDCARD = "*"

function parseList(raw: string | undefined): { wildcard: boolean; kinds: ReadonlySet<string> } {
  if (!raw) return { wildcard: false, kinds: new Set() }
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.includes(WILDCARD)) {
    return { wildcard: true, kinds: new Set(parts.filter((p) => p !== WILDCARD)) }
  }
  return { wildcard: false, kinds: new Set(parts) }
}

let _shadow: { wildcard: boolean; kinds: ReadonlySet<string> } | null = null
let _enforce: { wildcard: boolean; kinds: ReadonlySet<string> } | null = null
let _envSnapshot: { shadow: string | undefined; enforce: string | undefined } | null = null

function ensureLoaded(env: NodeJS.ProcessEnv): void {
  const shadow = env["IBX_KERNEL_SHADOW"]
  const enforce = env["IBX_KERNEL_ENFORCE"]
  if (
    _envSnapshot &&
    _envSnapshot.shadow === shadow &&
    _envSnapshot.enforce === enforce
  ) {
    return
  }
  _shadow = parseList(shadow)
  _enforce = parseList(enforce)
  _envSnapshot = { shadow, enforce }
}

/** Is this intent kind covered by `IBX_KERNEL_SHADOW`? */
export function isShadowed(intentKind: string, env: NodeJS.ProcessEnv = process.env): boolean {
  ensureLoaded(env)
  return _shadow!.wildcard || _shadow!.kinds.has(intentKind)
}

/** Is this intent kind covered by `IBX_KERNEL_ENFORCE`? */
export function isEnforced(intentKind: string, env: NodeJS.ProcessEnv = process.env): boolean {
  ensureLoaded(env)
  return _enforce!.wildcard || _enforce!.kinds.has(intentKind)
}

/** @internal — reset the cached env snapshot (for tests). */
export function _resetEnforceConfig(): void {
  _shadow = null
  _enforce = null
  _envSnapshot = null
}

// ── T7 (#17): typo guard for IBX_KERNEL_SHADOW / IBX_KERNEL_ENFORCE. ──

import { recordSinkFailure } from "./metrics.js"

export interface EnforceConfigValidation {
  /** Tokens in IBX_KERNEL_SHADOW that are absent from `knownIntents`. */
  readonly unknownShadow: readonly string[]
  /** Tokens in IBX_KERNEL_ENFORCE that are absent from `knownIntents`. */
  readonly unknownEnforce: readonly string[]
}

/**
 * Validate that every token in `IBX_KERNEL_SHADOW` and
 * `IBX_KERNEL_ENFORCE` is present in `knownIntents` (typically the union
 * of every installed Pack's `intents`). Unrecognized tokens silently
 * leave their intent on the legacy path — exactly the cutover hazard
 * the staged rollout is trying to prevent. T7 surfaces the typo as a
 * one-time `console.warn` plus a `recordSinkFailure({ errorClass:
 * "enforce_config_typo" })` so an operator dashboards the misconfig.
 *
 * Wildcard `*` is honoured (no token check).
 *
 * Adopters call this once at boot, after `installPack` and before
 * traffic. Returns the parsed sets for further inspection.
 */
export function validateEnforceConfig(
  knownIntents: ReadonlySet<string>,
  env: NodeJS.ProcessEnv = process.env,
  warn: (msg: string) => void = (m) => console.warn(m),
): EnforceConfigValidation {
  const shadow = parseList(env["IBX_KERNEL_SHADOW"])
  const enforce = parseList(env["IBX_KERNEL_ENFORCE"])

  const unknownShadow: string[] = shadow.wildcard
    ? []
    : Array.from(shadow.kinds).filter((k) => !knownIntents.has(k))
  const unknownEnforce: string[] = enforce.wildcard
    ? []
    : Array.from(enforce.kinds).filter((k) => !knownIntents.has(k))

  if (unknownShadow.length > 0) {
    warn(
      `[adjudicate] IBX_KERNEL_SHADOW contains unrecognized intents: ${unknownShadow.join(", ")}. ` +
        `These tokens will silently leave their intent on the legacy path.`,
    )
    recordSinkFailure({
      sink: "console",
      subject: `enforce-config:shadow:${unknownShadow.join(",")}`,
      errorClass: "enforce_config_typo",
      consecutiveFailures: 1,
    })
  }
  if (unknownEnforce.length > 0) {
    warn(
      `[adjudicate] IBX_KERNEL_ENFORCE contains unrecognized intents: ${unknownEnforce.join(", ")}. ` +
        `These tokens will silently leave their intent on the legacy path.`,
    )
    recordSinkFailure({
      sink: "console",
      subject: `enforce-config:enforce:${unknownEnforce.join(",")}`,
      errorClass: "enforce_config_typo",
      consecutiveFailures: 1,
    })
  }

  return { unknownShadow, unknownEnforce }
}

// ── Kill switch ─────────────────────────────────────────────────────────────
//
// Runtime-toggleable global override. When active, `adjudicate()` short-
// circuits BEFORE any other gate (including the schema-version check) to
// SECURITY refusal `kill_switch_active`. Used during incidents — operators
// flip the switch via `setKillSwitch(true, "reason")` and authority is
// revoked across every intent kind regardless of `IBX_KERNEL_ENFORCE`
// membership.
//
// Env-var pre-seed: `IBX_KILL_SWITCH=1` (or `true`/`yes`/`on`) starts the
// kernel with the switch already engaged. Runtime API has precedence over
// the env value once it's been called.

interface KillSwitchState {
  readonly active: boolean
  readonly reason: string
  readonly toggledAt: string // ISO-8601
}

let _killSwitch: KillSwitchState = {
  active: false,
  reason: "",
  toggledAt: "1970-01-01T00:00:00.000Z",
}
let _killSwitchSeededFromEnv = false

function killSwitchEnvActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env["IBX_KILL_SWITCH"]
  if (raw === undefined) return false
  const v = raw.toLowerCase().trim()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

function ensureKillSwitchSeeded(env: NodeJS.ProcessEnv = process.env): void {
  if (_killSwitchSeededFromEnv) return
  _killSwitchSeededFromEnv = true
  if (killSwitchEnvActive(env)) {
    _killSwitch = {
      active: true,
      reason: "env: IBX_KILL_SWITCH",
      toggledAt: new Date().toISOString(),
    }
  }
}

/**
 * Toggle the kill switch. Subsequent `adjudicate()` calls return SECURITY
 * refusals with code `kill_switch_active`. Setting `active = false` releases
 * the switch — adjudication resumes for all intent kinds.
 *
 * The toggle itself is an operator action — adopters who wire `auditKillSwitchToggle()`
 * (see `getKillSwitchAuditEvent`) can persist it to their AuditSink.
 */
export function setKillSwitch(active: boolean, reason: string): void {
  _killSwitchSeededFromEnv = true // prevent env from re-overriding after manual toggle
  _killSwitch = {
    active,
    reason,
    toggledAt: new Date().toISOString(),
  }
}

/**
 * Is the kill switch currently active?
 */
export function isKilled(env: NodeJS.ProcessEnv = process.env): boolean {
  ensureKillSwitchSeeded(env)
  return _killSwitch.active
}

/**
 * Read the current kill-switch state (active flag, reason, toggle timestamp).
 * Used by adopters that want to surface the reason in user-facing messages,
 * or to emit a synthetic AuditRecord on toggle.
 */
export function getKillSwitchState(env: NodeJS.ProcessEnv = process.env): KillSwitchState {
  ensureKillSwitchSeeded(env)
  return _killSwitch
}

/** @internal — reset for tests. */
export function _resetKillSwitch(): void {
  _killSwitch = {
    active: false,
    reason: "",
    toggledAt: "1970-01-01T00:00:00.000Z",
  }
  _killSwitchSeededFromEnv = false
}
