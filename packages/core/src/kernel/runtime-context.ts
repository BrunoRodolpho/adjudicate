/**
 * RuntimeContext — per-tenant container for the framework's mutable
 * singletons.
 *
 * The kernel ships with several module-level slots that production wiring
 * fills at boot:
 *
 *   - kill switch state (active/reason/toggledAt + env-seed memo)
 *   - MetricsSink (recordDecision/recordRefusal/etc.)
 *   - LearningSink (recordOutcome)
 *   - ShadowTelemetrySink (BASIS_ONLY/DECISION_KIND/PAYLOAD_REWRITE)
 *   - EnforceConfig (`IBX_KERNEL_SHADOW` / `IBX_KERNEL_ENFORCE` parses)
 *
 * Module-level singletons block multi-tenancy: a single Node process
 * cannot host two tenants with independent kill switches, sink fan-out,
 * or per-intent enforce configs without cross-talk. This module
 * introduces a fresh container abstraction:
 *
 *   - `createRuntimeContext()` mints a new isolated container with its
 *     own kill switch / sinks / enforce snapshot. Tenant code holds the
 *     handle and routes reads/writes through it.
 *   - `getDefaultRuntimeContext()` returns the process-wide default
 *     context. Existing module-level callers (`isKilled()`,
 *     `recordDecision()`, etc.) operate on it. Back-compat is total.
 *
 * Existing call sites do not move to the context API automatically;
 * production migration is opt-in. New code paths that accept a
 * `context` parameter (e.g. `adjudicateAndAudit({ context })`) route
 * through it; otherwise everything continues to use the default.
 *
 * Env-seed reseed (#16): `KillSwitchControl.reseedFromEnv()` re-reads
 * `IBX_KILL_SWITCH` even after manual toggles. The default context
 * preserves the existing one-shot behaviour for back-compat; tenant
 * contexts can opt in to per-tenant env vars (e.g.,
 * `IBX_KILL_SWITCH_TENANT_FOO`).
 */

import type { Decision } from "../decision.js";
import type {
  DecisionEvent,
  LedgerOpEvent,
  MetricsSink,
  RefusalEvent,
  ResourceLimitEvent,
  ShadowDivergenceEvent,
  SinkFailureEvent,
} from "./metrics.js";
import type { LearningSink } from "./learning.js";
import type {
  LegacyDecisionResult,
  ShadowTelemetrySink,
} from "./shadow.js";

// ── Kill switch ─────────────────────────────────────────────────────────────

export interface KillSwitchState {
  readonly active: boolean;
  readonly reason: string;
  readonly toggledAt: string;
}

export interface KillSwitchControl {
  isKilled(): boolean;
  state(): KillSwitchState;
  set(active: boolean, reason: string): void;
  /**
   * Re-read the env var (`IBX_KILL_SWITCH` by default; tenant contexts
   * may use a per-tenant variable). Resets the one-shot env-seed memo,
   * so an operator can flip the env and force a re-read without process
   * restart. Returns the new state.
   */
  reseedFromEnv(env?: NodeJS.ProcessEnv): KillSwitchState;
}

interface KillSwitchInternals {
  state: KillSwitchState;
  envSeeded: boolean;
  envVar: string;
}

const INERT_STATE: KillSwitchState = {
  active: false,
  reason: "",
  toggledAt: "1970-01-01T00:00:00.000Z",
};

function envIsActive(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function makeKillSwitchControl(
  envVar: string,
  envSeed: NodeJS.ProcessEnv,
): KillSwitchControl {
  const inner: KillSwitchInternals = {
    state: { ...INERT_STATE },
    envSeeded: false,
    envVar,
  };
  function ensureSeeded(env: NodeJS.ProcessEnv): void {
    if (inner.envSeeded) return;
    inner.envSeeded = true;
    if (envIsActive(env[envVar])) {
      inner.state = {
        active: true,
        reason: `env: ${envVar}`,
        toggledAt: new Date().toISOString(),
      };
    }
  }
  return {
    isKilled() {
      ensureSeeded(envSeed);
      return inner.state.active;
    },
    state() {
      ensureSeeded(envSeed);
      return inner.state;
    },
    set(active: boolean, reason: string) {
      // Manual toggle: prevent the env seed from re-overriding the choice
      // until reseedFromEnv() is called.
      inner.envSeeded = true;
      inner.state = {
        active,
        reason,
        toggledAt: new Date().toISOString(),
      };
    },
    reseedFromEnv(env?: NodeJS.ProcessEnv) {
      inner.envSeeded = false;
      ensureSeeded(env ?? envSeed);
      return inner.state;
    },
  };
}

// ── EnforceConfig ───────────────────────────────────────────────────────────

export interface EnforceConfig {
  isShadowed(intentKind: string, env?: NodeJS.ProcessEnv): boolean;
  isEnforced(intentKind: string, env?: NodeJS.ProcessEnv): boolean;
  reset(): void;
}

interface ParsedList {
  readonly wildcard: boolean;
  readonly kinds: ReadonlySet<string>;
}

function parseList(raw: string | undefined): ParsedList {
  if (!raw) return { wildcard: false, kinds: new Set() };
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.includes("*")) {
    return { wildcard: true, kinds: new Set(parts.filter((p) => p !== "*")) };
  }
  return { wildcard: false, kinds: new Set(parts) };
}

function makeEnforceConfig(
  envSeed: NodeJS.ProcessEnv,
  shadowVar: string,
  enforceVar: string,
): EnforceConfig {
  let snapshotShadow: string | undefined;
  let snapshotEnforce: string | undefined;
  let shadow: ParsedList | null = null;
  let enforce: ParsedList | null = null;

  function ensureLoaded(env: NodeJS.ProcessEnv): void {
    const s = env[shadowVar];
    const e = env[enforceVar];
    if (shadow !== null && snapshotShadow === s && snapshotEnforce === e) {
      return;
    }
    snapshotShadow = s;
    snapshotEnforce = e;
    shadow = parseList(s);
    enforce = parseList(e);
  }

  return {
    isShadowed(kind: string, env: NodeJS.ProcessEnv = envSeed) {
      ensureLoaded(env);
      return shadow!.wildcard || shadow!.kinds.has(kind);
    },
    isEnforced(kind: string, env: NodeJS.ProcessEnv = envSeed) {
      ensureLoaded(env);
      return enforce!.wildcard || enforce!.kinds.has(kind);
    },
    reset() {
      shadow = null;
      enforce = null;
      snapshotShadow = undefined;
      snapshotEnforce = undefined;
    },
  };
}

// ── RuntimeContext ──────────────────────────────────────────────────────────

export interface RuntimeContext {
  /** Identifier for telemetry / logs. Default context is `"default"`. */
  readonly id: string;
  readonly killSwitch: KillSwitchControl;
  readonly metrics: MetricsSinkSlot;
  readonly learning: LearningSinkSlot;
  readonly shadowTelemetry: ShadowTelemetrySinkSlot;
  readonly enforceConfig: EnforceConfig;
}

export interface MetricsSinkSlot {
  readonly current: () => MetricsSink;
  readonly set: (sink: MetricsSink) => void;
  readonly reset: () => void;
  readonly hasExplicit: () => boolean;
  recordLedgerOp(event: LedgerOpEvent): void;
  recordDecision(event: DecisionEvent): void;
  recordRefusal(event: RefusalEvent): void;
  recordSinkFailure(event: SinkFailureEvent): void;
  recordResourceLimit(event: ResourceLimitEvent): void;
  recordShadowDivergence(event: ShadowDivergenceEvent): void;
}

export interface LearningSinkSlot {
  readonly current: () => LearningSink;
  readonly set: (sink: LearningSink) => void;
  readonly reset: () => void;
  readonly hasExplicit: () => boolean;
}

export interface ShadowTelemetrySinkSlot {
  readonly current: () => ShadowTelemetrySink;
  readonly set: (sink: ShadowTelemetrySink) => void;
  readonly reset: () => void;
  recordBasisOnly(intentKind: string, decision: Decision): void;
  alertDecisionKind(
    intentKind: string,
    legacy: LegacyDecisionResult,
    decision: Decision,
  ): void;
  alertPayloadRewrite(intentKind: string, decision: Decision): void;
}

function noopMetricsSink(): MetricsSink {
  return {
    recordLedgerOp() {},
    recordDecision() {},
    recordRefusal() {},
    recordSinkFailure() {},
    recordShadowDivergence() {},
    recordResourceLimit() {},
  };
}

function noopLearningSink(): LearningSink {
  return { recordOutcome() {} };
}

function noopShadowTelemetrySink(): ShadowTelemetrySink {
  return {
    recordBasisOnly() {},
    alertDecisionKind() {},
    alertPayloadRewrite() {},
  };
}

function makeMetricsSinkSlot(): MetricsSinkSlot {
  let sink: MetricsSink = noopMetricsSink();
  let explicit = false;
  return {
    current: () => sink,
    set(s) {
      sink = s;
      explicit = true;
    },
    reset() {
      sink = noopMetricsSink();
      explicit = false;
    },
    hasExplicit: () => explicit,
    recordLedgerOp(event) {
      sink.recordLedgerOp(event);
    },
    recordDecision(event) {
      sink.recordDecision(event);
    },
    recordRefusal(event) {
      sink.recordRefusal(event);
    },
    recordSinkFailure(event) {
      sink.recordSinkFailure(event);
    },
    recordResourceLimit(event) {
      sink.recordResourceLimit?.(event);
    },
    recordShadowDivergence(event) {
      sink.recordShadowDivergence(event);
    },
  };
}

function makeLearningSinkSlot(): LearningSinkSlot {
  let sink: LearningSink = noopLearningSink();
  let explicit = false;
  return {
    current: () => sink,
    set(s) {
      sink = s;
      explicit = true;
    },
    reset() {
      sink = noopLearningSink();
      explicit = false;
    },
    hasExplicit: () => explicit,
  };
}

function makeShadowTelemetrySinkSlot(): ShadowTelemetrySinkSlot {
  let sink: ShadowTelemetrySink = noopShadowTelemetrySink();
  return {
    current: () => sink,
    set(s) {
      sink = s;
    },
    reset() {
      sink = noopShadowTelemetrySink();
    },
    recordBasisOnly(kind, decision) {
      sink.recordBasisOnly(kind, decision);
    },
    alertDecisionKind(kind, legacy, decision) {
      sink.alertDecisionKind(kind, legacy, decision);
    },
    alertPayloadRewrite(kind, decision) {
      sink.alertPayloadRewrite(kind, decision);
    },
  };
}

export interface CreateRuntimeContextOptions {
  readonly id?: string;
  readonly metrics?: MetricsSink;
  readonly learning?: LearningSink;
  readonly shadowTelemetry?: ShadowTelemetrySink;
  readonly envSeed?: NodeJS.ProcessEnv;
  /** Custom env-var name for the kill switch. Default: `"IBX_KILL_SWITCH"`. */
  readonly killSwitchEnvVar?: string;
  /** Custom shadow-list env var. Default: `"IBX_KERNEL_SHADOW"`. */
  readonly shadowEnvVar?: string;
  /** Custom enforce-list env var. Default: `"IBX_KERNEL_ENFORCE"`. */
  readonly enforceEnvVar?: string;
}

let _idCounter = 0;
function nextId(): string {
  return `ctx-${++_idCounter}`;
}

export function createRuntimeContext(
  options: CreateRuntimeContextOptions = {},
): RuntimeContext {
  const envSeed = options.envSeed ?? process.env;
  const killSwitchEnvVar = options.killSwitchEnvVar ?? "IBX_KILL_SWITCH";
  const shadowEnvVar = options.shadowEnvVar ?? "IBX_KERNEL_SHADOW";
  const enforceEnvVar = options.enforceEnvVar ?? "IBX_KERNEL_ENFORCE";

  const metricsSlot = makeMetricsSinkSlot();
  if (options.metrics) metricsSlot.set(options.metrics);

  const learningSlot = makeLearningSinkSlot();
  if (options.learning) learningSlot.set(options.learning);

  const shadowSlot = makeShadowTelemetrySinkSlot();
  if (options.shadowTelemetry) shadowSlot.set(options.shadowTelemetry);

  return {
    id: options.id ?? nextId(),
    killSwitch: makeKillSwitchControl(killSwitchEnvVar, envSeed),
    metrics: metricsSlot,
    learning: learningSlot,
    shadowTelemetry: shadowSlot,
    enforceConfig: makeEnforceConfig(envSeed, shadowEnvVar, enforceEnvVar),
  };
}

let _defaultContext: RuntimeContext | null = null;

/**
 * Returns the process-wide default RuntimeContext. Module-level kernel
 * functions (`isKilled`, `recordDecision`, etc.) read and write this
 * context. Adopters that want isolation use `createRuntimeContext()` and
 * route through their tenant context instead.
 *
 * Lazily initialised on first read so test harnesses that mutate
 * `process.env` after import still see fresh seeds.
 */
export function getDefaultRuntimeContext(): RuntimeContext {
  if (_defaultContext === null) {
    _defaultContext = createRuntimeContext({ id: "default" });
  }
  return _defaultContext;
}

/** @internal — for tests. Drops and re-creates the default context. */
export function _resetDefaultRuntimeContext(): void {
  _defaultContext = null;
}
