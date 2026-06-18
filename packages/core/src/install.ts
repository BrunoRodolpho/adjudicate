/**
 * installPack — opinionated bootstrap for adopters that want sensible
 * defaults instead of plumbing every sink + conformance check by hand.
 *
 * What it does, in order:
 *
 *   1. Calls `assertPackConformance(pack)` — fails fast on malformed Packs.
 *   2. If no MetricsSink is installed, wires `createConsoleMetricsSink()`
 *      and emits a one-time `console.warn` so production deployments do
 *      not silently rely on console output.
 *   3. Returns the Pack wrapped via `withBasisAudit(...)` so refusal-code
 *      drift records a `basis_code_drift` sink-failure event.
 *
 * Adopters who manage their own observability call the lower-level
 * primitives (`assertPackConformance`, `withBasisAudit`, `setMetricsSink`)
 * directly. `installPack` is pure convenience — it never installs anything
 * destructive.
 */

import {
  createConsoleLearningSink,
  hasLearningSink,
  setLearningSink,
} from "./kernel/learning.js";
import { recordAuthoritySnapshot } from "./decision.js";
import type { AuthorityGraph, RecordedAuthoritySnapshot } from "./envelope.js";
import { createConsoleMetricsSink, hasMetricsSink, setMetricsSink } from "./kernel/metrics.js";
import { assertPlanSubsetOfPack } from "./llm/planner-conformance.js";
import {
  assertPackConformance,
  recordAuthoritySnapshotOnPack,
  withBasisAudit,
} from "./pack-conformance.js";
import type { PackV0 } from "./pack.js";

export interface InstallPackOptions {
  /**
   * When true (default), `installPack` wires `createConsoleMetricsSink()`
   * if no sink is currently set, emitting a `console.warn` to flag the
   * default. Pass false to opt out — tests typically do this.
   */
  readonly installDefaultMetrics?: boolean;
  /**
   * When true (default), `installPack` wires `createConsoleLearningSink()`
   * if no LearningSink is currently set. Same opt-out story as metrics.
   */
  readonly installDefaultLearning?: boolean;
  /**
   * When true (default), the returned Pack's policy is wrapped via
   * `withBasisAudit` so refusal-code drift is observable. Pass false only
   * if the adopter applies their own decoration.
   */
  readonly auditBasisDrift?: boolean;
  /**
   * T4 (#20): allow Packs that ship `policy.default = "EXECUTE"`. Off by
   * default — `assertPackConformance` throws on EXECUTE-default unless
   * this opt-in is passed. Read-only Packs (e.g., a "search" or "summary"
   * pack with no mutating intents) legitimately want this.
   */
  readonly allowDefaultExecute?: boolean;
  /**
   * Override for the warn line. Tests inject a vi.fn(); production uses
   * the default `console.warn`.
   */
  readonly warn?: (message: string) => void;
  /**
   * 033 — the authority-graph SNAPSHOT to INJECT into this pack's decisions.
   * `installPack` is the documented injection seam (no existing guard injection,
   * no signature check). When supplied, `installPack` content-addresses the graph
   * (`recordAuthoritySnapshot`) and exposes the RECORDED snapshot on the returned
   * `InstalledPack.authoritySnapshot`, which the impure audit shell records onto
   * the `AuditRecord` so the decision is REPLAYABLE (§D-5, invariant #5).
   *
   * **Injection seam only — 033 wires NO authority guard** (that is 034) and the
   * graph rides as an INJECTED STATE/recorded input, NOT a hashed envelope field
   * (invariant #4 untouched). The pack's `authGuards` are NOT modified here; the
   * snapshot is recorded, not consulted by any guard.
   */
  readonly authoritySnapshot?: AuthorityGraph;
}

export type InstalledDefault = "metrics" | "learning";

export interface InstalledPack<
  K extends string = string,
  P = unknown,
  S = unknown,
  C = unknown,
> {
  readonly pack: PackV0<K, P, S, C>;
  readonly installedDefaults: ReadonlyArray<InstalledDefault>;
  /**
   * 033 — the RECORDED authority snapshot (graph + content-address) when an
   * `authoritySnapshot` was injected at install. ABSENT (`undefined`) otherwise,
   * so non-injecting adopters see no behavioral change. The audit shell records
   * this onto each `AuditRecord` (via `buildAuditRecord({ authoritySnapshot })`)
   * so the decision replays bit-identically over the recorded snapshot (§D-5).
   */
  readonly authoritySnapshot?: RecordedAuthoritySnapshot;
}

export function installPack<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  options: InstallPackOptions = {},
): InstalledPack<K, P, S, C> {
  const installDefaultMetrics = options.installDefaultMetrics ?? true;
  const installDefaultLearning = options.installDefaultLearning ?? true;
  const auditBasisDrift = options.auditBasisDrift ?? true;
  const warn = options.warn ?? ((msg) => console.warn(msg));

  assertPackConformance(pack, {
    allowDefaultExecute: options.allowDefaultExecute,
  });

  // 012 / T4: gate the plan at install — not opt-in at Pack construction.
  // Now that every model-proposed READ crosses the kernel, the plan's
  // `allowedIntents` are the surface the LLM may propose THROUGH the kernel;
  // a planner that advertises an intent the Pack never declared is a leak the
  // kernel's guards probably do not cover. Probe the planner with an empty
  // state and assert `assertPlanSubsetOfPack` so the misconfiguration fails
  // loud at install. A planner that legitimately throws on the empty probe
  // state (it needs real domain state) is exempt — same trust-the-contract
  // posture the conformance harness takes; the planner's own `safePlan`
  // wrapper (Pack-author convention) still gates it per real `plan()` call.
  try {
    const probeState =
      typeof pack.rehydrateState === "function"
        ? pack.rehydrateState({})
        : ({} as S);
    let plan: ReturnType<typeof pack.planner.plan> | undefined;
    try {
      plan = pack.planner.plan(probeState, {} as C);
    } catch {
      plan = undefined; // planner needs real state — skip the install probe.
    }
    if (plan !== undefined) {
      // Throws PlanConformanceError when an advertised intent is absent from
      // pack.intents — a fail-loud install gate (was opt-in via safePlan).
      // assertPlanSubsetOfPack reads only `pack.intents`, so the P/S/C widening
      // cast is sound.
      assertPlanSubsetOfPack(
        plan,
        pack as unknown as PackV0<K, unknown, unknown, unknown>,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "PlanConformanceError") throw err;
    // Any other unexpected error from the probe is non-fatal — the install
    // gate is best-effort plan validation, not a new failure surface.
  }

  const installedDefaults: InstalledDefault[] = [];
  if (installDefaultMetrics && !hasMetricsSink()) {
    setMetricsSink(createConsoleMetricsSink());
    warn(
      "[adjudicate] using default console metrics sink — install a real sink (Sentry, PostHog) before production",
    );
    installedDefaults.push("metrics");
  }
  if (installDefaultLearning && !hasLearningSink()) {
    setLearningSink(createConsoleLearningSink());
    warn(
      "[adjudicate] using default console learning sink — install a real sink (analytics warehouse) before production",
    );
    installedDefaults.push("learning");
  }

  const wrapped = auditBasisDrift ? withBasisAudit(pack) : pack;

  // 033 — INJECTION SEAM. When an authority-graph snapshot is injected, content-
  // address it (recordAuthoritySnapshot) and STAMP the recorded snapshot onto
  // the wrapped pack via the idempotent/non-blocking pack-conformance recording
  // helper (same "wrap, don't mutate, mark with a symbol" discipline as
  // withBasisAudit). The impure audit shell reads it back and records it onto
  // each AuditRecord so the decision replays bit-identically (§D-5, invariant
  // #5). NO authority guard is wired (034) and no signature check is added (none
  // exists here today) — the snapshot rides as injected state, not a hashed
  // envelope field (invariant #4 untouched). Omitting it is byte-identical to
  // the pre-033 install (no recorded snapshot, no tag).
  const recordedSnapshot: RecordedAuthoritySnapshot | undefined =
    options.authoritySnapshot !== undefined
      ? recordAuthoritySnapshot(options.authoritySnapshot)
      : undefined;
  const installedPack =
    recordedSnapshot !== undefined
      ? recordAuthoritySnapshotOnPack(wrapped, recordedSnapshot)
      : wrapped;

  return {
    pack: installedPack,
    installedDefaults,
    ...(recordedSnapshot !== undefined
      ? { authoritySnapshot: recordedSnapshot }
      : {}),
  };
}
