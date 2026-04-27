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
import { createConsoleMetricsSink, hasMetricsSink, setMetricsSink } from "./kernel/metrics.js";
import { assertPackConformance, withBasisAudit } from "./pack-conformance.js";
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
  return { pack: wrapped, installedDefaults };
}
