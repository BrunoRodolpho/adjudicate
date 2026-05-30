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

// ── Per-intent shadow/enforce lookup ─────────────────────────────────────────
//
// ConfigReviewer-001: the module-level `isShadowed` / `isEnforced` wrappers
// previously defaulted `env` to `process.env` and re-read it per call. That
// is a footgun for any future "kernel authoritative per intent" wiring — a
// commit dropping them into the decision path would silently read env inside
// adjudicate(), violating the deterministic-core invariant. They have been
// removed. Callers route through `RuntimeContext.enforceConfig.{isShadowed,
// isEnforced}` instead, which is seeded once from a captured `envSeed` at
// context creation and never reaches for live `process.env`. The wildcard /
// comma-list parsing lives in `parseList` (still used by
// `validateEnforceConfig` below and re-implemented in `runtime-context.ts`).

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
// LOAD-BEARING (ConfigReviewer-003): one-shot memo. Once true, neither the
// env snapshot nor a later explicit env re-reads the kill state — this is
// what gives `setKillSwitch()` precedence over the env pre-seed and what
// keeps `isKilled()` from re-reading on the adjudicate() hot path. Only
// `_resetKillSwitch()` (tests) and an explicit env arg (reseed) clear it.
let _killSwitchSeededFromEnv = false

// ConfigReviewer-003: capture process.env ONCE at module load rather than
// defaulting the read functions to live `process.env`. The previous default
// (`env = process.env`) meant the module-level `isKilled()` /
// `getKillSwitchState()` — which `adjudicate()` calls with no argument on the
// hot path — held a live reference to `process.env`. Seeding is already
// one-shot via the memo above, so live env was never actually re-read after
// the first call; snapshotting makes that explicit and removes the footgun of
// a future change reading mutable env mid-decision. Callers that genuinely
// need to re-seed (tests, operator reseed) still pass an explicit env arg.
const KILL_SWITCH_ENV_SNAPSHOT: NodeJS.ProcessEnv = { ...process.env }

function killSwitchEnvActive(env: NodeJS.ProcessEnv): boolean {
  const raw = env["IBX_KILL_SWITCH"]
  if (raw === undefined) return false
  const v = raw.toLowerCase().trim()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

// Determinism sentinel for env-seeded kills. The kill `toggledAt` flows into
// the Decision basis detail, and `adjudicate()` must be deterministic over
// (envelope, state, policy). If env-seeding stamped `new Date()`, two replicas
// booting at different times would emit different Decision bytes for the same
// envelope — audit-hash drift, and the replay-determinism property test breaks.
// Operator toggles via `setKillSwitch()` happen OUTSIDE adjudicate(), so they
// keep a real wall-clock timestamp.
const KILL_SWITCH_ENV_SEED_AT = "1970-01-01T00:00:00.000Z"

function ensureKillSwitchSeeded(env: NodeJS.ProcessEnv = KILL_SWITCH_ENV_SNAPSHOT): void {
  if (_killSwitchSeededFromEnv) return
  _killSwitchSeededFromEnv = true
  if (killSwitchEnvActive(env)) {
    _killSwitch = {
      active: true,
      reason: "env: IBX_KILL_SWITCH",
      toggledAt: KILL_SWITCH_ENV_SEED_AT,
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
 *
 * `env` defaults to a one-time module snapshot of `process.env` (captured at
 * import), NOT live `process.env` — see `KILL_SWITCH_ENV_SNAPSHOT`. Pass an
 * explicit env to force a (one-shot) re-seed; the memo still gates it.
 */
export function isKilled(env: NodeJS.ProcessEnv = KILL_SWITCH_ENV_SNAPSHOT): boolean {
  ensureKillSwitchSeeded(env)
  return _killSwitch.active
}

/**
 * Read the current kill-switch state (active flag, reason, toggle timestamp).
 * Used by adopters that want to surface the reason in user-facing messages,
 * or to emit a synthetic AuditRecord on toggle.
 *
 * `env` defaults to the one-time module snapshot (not live `process.env`),
 * matching `isKilled` — keeps the adjudicate() hot path off mutable env.
 */
export function getKillSwitchState(env: NodeJS.ProcessEnv = KILL_SWITCH_ENV_SNAPSHOT): KillSwitchState {
  ensureKillSwitchSeeded(env)
  // Return a shallow copy so external callers cannot mutate the module-level
  // singleton via the returned reference. The KillSwitchState interface is
  // readonly, but JS readonly is shallow — a cast + direct mutation would
  // otherwise corrupt subsequent `isKilled()` / adjudicate() reads.
  return { ..._killSwitch }
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
