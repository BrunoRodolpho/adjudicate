/**
 * Policy manifest — a JSON-serialisable, content-addressed superset of
 * `describePolicyBundle` describing every rule an adopter's Packs enforce.
 *
 * `describePolicyBundle` (in `@adjudicate/core`) is intentionally thin: it
 * walks the four guard phases of a single bundle and renders the taint phase
 * as one placeholder. The manifest adds, per Pack and per intent kind:
 *   - the per-kind taint floor (`taint.minimumFor(kind)`),
 *   - the phase-ordered guard chain with resolved names + structured
 *     descriptions + (opt-in) source locations,
 *   - the basis-code vocabulary and DEFER signals,
 *   - the tool/capability bindings,
 *   - the statically-inferable decision outcomes,
 * plus a stable `digest` for drift diffing.
 *
 * KERNEL TRUTH (do not paper over): every guard in a bundle is evaluated for
 * EVERY intent kind — guards self-filter on `envelope.kind` at runtime. So
 * guards are *pack-scoped*, not intent-scoped. The manifest lists the full
 * pack guard chain once (`PackManifestNode.guards`) and, per intent, names the
 * applicable subset (`IntentManifestNode.guardNames`) — narrowing only where a
 * guard *declares* its kind scope via `system_taint.systemOnlyKinds`.
 *
 * Node-only (uses `node:crypto` + ts-morph for source locations). NOT imported
 * by `@adjudicate/core`; the determinism fence is therefore untouched.
 */

import { createHash } from "node:crypto";
import { Node, type SourceFile, SyntaxKind } from "ts-morph";
import type { DecisionKind, PackV0, Taint } from "@adjudicate/core";
import {
  describePolicyBundle,
  readGuardMetadata,
  type GuardDescription,
  type PolicyBundle,
  type PolicyBundleDescriptor,
} from "@adjudicate/core/kernel";
import type { SourceLocation } from "./types.js";
import { eachGuard, resolveGuardName, type NameSource, type Phase } from "./internal/walk.js";

// ─── Public types ───────────────────────────────────────────────────────────

export type ManifestVersion = "1.0";

/** A single guard — the leaf of the rule-provenance tree. */
export interface GuardManifestNode {
  readonly name: string;
  readonly nameSource: NameSource;
  readonly phase: Phase;
  /** 0-based index within the phase, in kernel evaluation order. */
  readonly index: number;
  /** True when neither GuardMetadata.name nor a usable Function.name exists. */
  readonly anonymous: boolean;
  readonly author?: string;
  readonly since?: string;
  /** Structured GuardDescription (threshold/state_defer/system_taint/…). */
  readonly description?: GuardDescription;
  /** The decision this guard emits, when statically determinable. */
  readonly emits?: DecisionKind;
  /**
   * Intent kinds this guard is declared to act on. Present ONLY when the
   * scope is declared (currently: `system_taint.systemOnlyKinds`). Absent ⇒
   * the guard applies to every intent kind in the Pack (the common case —
   * guards self-filter at runtime).
   */
  readonly appliesToKinds?: ReadonlyArray<string>;
  /** True when injected by the adopter at composition (not in the published Pack). */
  readonly adopterInjected?: boolean;
  /** Source location — best-effort, only when `sourceFiles` is supplied. */
  readonly sourceLocation?: SourceLocation;
}

export interface DecisionEvidence {
  readonly outcome: DecisionKind;
  /** Guard name, or "policy.default". */
  readonly source: string;
  readonly confidence: "declared" | "inferred" | "default";
}

export interface DecisionOutcomeSummary {
  readonly possible: ReadonlyArray<DecisionKind>;
  readonly evidence: ReadonlyArray<DecisionEvidence>;
  /**
   * True when ≥1 applicable guard has no structured description, so `possible`
   * is a LOWER BOUND — opaque guards may emit outcomes not listed here.
   */
  readonly hasOpaqueGuards: boolean;
}

/** Everything that applies to one intent kind. */
export interface IntentManifestNode {
  readonly kind: string;
  readonly taintFloor: Taint | "unknown";
  /** taintFloor is stricter than UNTRUSTED ⇒ not LLM-proposable. */
  readonly systemOnly: boolean;
  /** Tools that resolve to this kind (from the adopter's tool→intent map). */
  readonly tools: ReadonlyArray<string>;
  /** Names of pack guards that apply to this kind (refs into PackManifestNode.guards). */
  readonly guardNames: ReadonlyArray<string>;
  readonly outcomes: DecisionOutcomeSummary;
  readonly default: "REFUSE" | "EXECUTE";
}

export interface PackManifestNode {
  readonly id: string;
  readonly version: string;
  readonly contract: string;
  readonly default: "REFUSE" | "EXECUTE";
  readonly intents: ReadonlyArray<IntentManifestNode>;
  /** The full pack guard chain, phase-ordered (state → auth → business). */
  readonly guards: ReadonlyArray<GuardManifestNode>;
  readonly basisCodes: ReadonlyArray<string>;
  readonly signals: ReadonlyArray<string>;
  readonly adopterInjectedGuards: ReadonlyArray<string>;
  /** Raw describePolicyBundle output, embedded for cross-checks. */
  readonly policyStructure: PolicyBundleDescriptor;
}

export interface PolicyManifest {
  readonly manifestVersion: ManifestVersion;
  readonly adopter: string;
  readonly kernelVersion?: string;
  /** Wall clock — set by the caller; EXCLUDED from `digest`. */
  readonly generatedAt?: string;
  readonly packs: ReadonlyArray<PackManifestNode>;
  /** sha256 over the manifest excluding `generatedAt`/`digest`. */
  readonly digest: string;
}

export interface DescribePackOptions {
  /** Map of tool name → intent kind (the adopter's `*_TOOL_TO_INTENT`). */
  readonly toolToIntent?: Readonly<Record<string, string>>;
  /** Guard names the adopter injected at composition (flagged `adopterInjected`). */
  readonly adopterInjectedGuardNames?: ReadonlyArray<string>;
  /** ts-morph SourceFile[] (from `loadSourceFiles`) for source locations. */
  readonly sourceFiles?: ReadonlyArray<unknown>;
  /**
   * When set, source-location `file` paths are stored relative to this root
   * (e.g. the workspace root) instead of absolute — so committed manifests are
   * portable and don't leak machine paths. Display-only; `sourceLocation` is
   * excluded from the digest/diff regardless.
   */
  readonly sourceRoot?: string;
}

export interface DescribeManifestOptions {
  readonly adopter: string;
  readonly kernelVersion?: string;
  readonly generatedAt?: string;
  /** Per-pack options keyed by `pack.id`. */
  readonly perPackOptions?: Readonly<Record<string, DescribePackOptions>>;
}

// ─── describePack ─────────────────────────────────────────────────────────

export function describePack<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  opts: DescribePackOptions = {},
): PackManifestNode {
  const injected = new Set(opts.adopterInjectedGuardNames ?? []);
  const sourceFiles = (opts.sourceFiles ?? []) as ReadonlyArray<SourceFile>;

  const guards: GuardManifestNode[] = [];
  eachGuard(pack, (guard, phase, index) => {
    const { name, nameSource, anonymous } = resolveGuardName(guard, phase, index);
    const meta = readGuardMetadata(guard);
    const description = meta?.description;
    const emits = emitOf(description);
    const appliesToKinds = declaredKindScope(description);
    const sourceLocation = anonymous
      ? undefined
      : locate(sourceFiles, name, opts.sourceRoot);
    guards.push({
      name,
      nameSource,
      phase,
      index,
      anonymous,
      ...(meta?.author !== undefined ? { author: meta.author } : {}),
      ...(meta?.since !== undefined ? { since: meta.since } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(emits !== undefined ? { emits } : {}),
      ...(appliesToKinds !== undefined ? { appliesToKinds } : {}),
      ...(injected.has(name) ? { adopterInjected: true } : {}),
      ...(sourceLocation !== undefined ? { sourceLocation } : {}),
    });
  });

  const bundle = pack.policy as PolicyBundle<K, P, S>;
  const toolsByIntent = invertToolMap(opts.toolToIntent);

  const intents: IntentManifestNode[] = [...pack.intents]
    .map(String)
    .sort()
    .map((kind) => {
      const taintFloor = safeTaintFloor(bundle, kind);
      const applicable = guards.filter(
        (g) => g.appliesToKinds === undefined || g.appliesToKinds.includes(kind),
      );
      return {
        kind,
        taintFloor,
        systemOnly: taintFloor !== "UNTRUSTED" && taintFloor !== "unknown",
        tools: toolsByIntent.get(kind) ?? [],
        guardNames: applicable.map((g) => g.name),
        outcomes: inferOutcomes(applicable, bundle.default),
        default: bundle.default,
      };
    });

  return {
    id: pack.id,
    version: pack.version,
    contract: pack.contract,
    default: bundle.default,
    intents,
    guards,
    basisCodes: [...(pack.basisCodes ?? [])],
    signals: [...(pack.signals ?? [])],
    adopterInjectedGuards: guards.filter((g) => g.adopterInjected).map((g) => g.name),
    policyStructure: describePolicyBundle(bundle),
  };
}

// ─── describeInstalledPacks ─────────────────────────────────────────────────

export function describeInstalledPacks(
  packs: ReadonlyArray<PackV0<string, unknown, unknown, unknown>>,
  opts: DescribeManifestOptions,
): PolicyManifest {
  const per = opts.perPackOptions ?? {};
  const packNodes = packs.map((p) => describePack(p, per[p.id] ?? {}));
  const base = {
    manifestVersion: "1.0" as const,
    adopter: opts.adopter,
    ...(opts.kernelVersion !== undefined ? { kernelVersion: opts.kernelVersion } : {}),
    packs: packNodes,
  };
  const digest = computeManifestDigest(base);
  return {
    ...base,
    ...(opts.generatedAt !== undefined ? { generatedAt: opts.generatedAt } : {}),
    digest,
  };
}

// ─── computeManifestDigest ──────────────────────────────────────────────────

/**
 * Stable sha256 over the manifest, EXCLUDING `generatedAt` and `digest`.
 * Same structure → same digest, so two exports of an unchanged policy diff
 * clean. Mirrors `extractSealableSurface`/`computeConfigDigest` in
 * `@adjudicate/conformance`.
 */
export function computeManifestDigest(
  manifest: Omit<PolicyManifest, "digest" | "generatedAt">,
): string {
  return createHash("sha256").update(stableStringify(manifest)).digest("hex");
}

// ─── diffPolicyManifests ────────────────────────────────────────────────────

export type DiffStatus = "added" | "removed" | "changed";

export interface PackDiff {
  readonly packId: string;
  readonly status: DiffStatus;
}
export interface IntentDiff {
  readonly packId: string;
  readonly kind: string;
  readonly status: DiffStatus;
  readonly changedFields?: ReadonlyArray<string>;
}
export interface GuardDiff {
  readonly packId: string;
  readonly guardName: string;
  readonly status: DiffStatus;
  readonly changedFields?: ReadonlyArray<string>;
}
export interface ManifestDiff {
  /** Digests equal — nothing changed. */
  readonly identical: boolean;
  readonly packs: ReadonlyArray<PackDiff>;
  readonly intents: ReadonlyArray<IntentDiff>;
  readonly guards: ReadonlyArray<GuardDiff>;
  /** Intent kinds in `next` whose applicable-guard set is empty. */
  readonly unguardedIntents: ReadonlyArray<{ readonly packId: string; readonly kind: string }>;
}

export function diffPolicyManifests(
  previous: PolicyManifest,
  next: PolicyManifest,
): ManifestDiff {
  const packs: PackDiff[] = [];
  const intents: IntentDiff[] = [];
  const guards: GuardDiff[] = [];

  const prevPacks = new Map(previous.packs.map((p) => [p.id, p]));
  const nextPacks = new Map(next.packs.map((p) => [p.id, p]));

  for (const id of prevPacks.keys()) {
    if (!nextPacks.has(id)) packs.push({ packId: id, status: "removed" });
  }
  for (const [id, np] of nextPacks) {
    const pp = prevPacks.get(id);
    if (pp === undefined) {
      packs.push({ packId: id, status: "added" });
    } else if (stableStringify(pp) !== stableStringify(np)) {
      packs.push({ packId: id, status: "changed" });
    }
    diffNamed(
      id,
      pp?.intents ?? [],
      np.intents,
      (x) => x.kind,
      (kind, status, changedFields) =>
        intents.push({ packId: id, kind, status, ...(changedFields ? { changedFields } : {}) }),
    );
    diffNamed(
      id,
      pp?.guards ?? [],
      np.guards,
      (x) => x.name,
      (guardName, status, changedFields) =>
        guards.push({ packId: id, guardName, status, ...(changedFields ? { changedFields } : {}) }),
    );
  }

  const unguardedIntents: Array<{ packId: string; kind: string }> = [];
  for (const p of next.packs) {
    for (const i of p.intents) {
      if (i.guardNames.length === 0) unguardedIntents.push({ packId: p.id, kind: i.kind });
    }
  }

  return {
    identical: previous.digest === next.digest,
    packs,
    intents,
    guards,
    unguardedIntents,
  };
}

function diffNamed<T extends object>(
  _packId: string,
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
  keyOf: (x: T) => string,
  emit: (key: string, status: DiffStatus, changedFields?: ReadonlyArray<string>) => void,
): void {
  const prevMap = new Map(prev.map((x) => [keyOf(x), x]));
  const nextMap = new Map(next.map((x) => [keyOf(x), x]));
  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) emit(key, "removed");
  }
  for (const [key, n] of nextMap) {
    const p = prevMap.get(key);
    if (p === undefined) {
      emit(key, "added");
    } else {
      const changed = changedFields(p, n);
      if (changed.length > 0) emit(key, "changed", changed);
    }
  }
}

function changedFields(a: object, b: object): ReadonlyArray<string> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (DIGEST_EXCLUDED_KEYS.has(k)) continue;
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (stableStringify(av) !== stableStringify(bv)) out.push(k);
  }
  return out.sort();
}

// ─── internals ──────────────────────────────────────────────────────────────

/**
 * Keys excluded from the digest + structural diff. `sourceLocation` is
 * provenance/display metadata (where a guard is authored), NOT rule identity —
 * a guard moving lines, or a manifest exported on a different machine / with vs
 * without source files, must NOT register as policy drift. Excluding it makes
 * `computeManifestDigest` machine-independent and keeps two exports of an
 * unchanged policy diffing clean regardless of source mode.
 */
const DIGEST_EXCLUDED_KEYS = new Set(["sourceLocation"]);

function emitOf(d: GuardDescription | undefined): DecisionKind | undefined {
  if (d === undefined) return undefined;
  switch (d.kind) {
    case "threshold":
      return d.emits;
    case "state_defer":
      return "DEFER";
    case "rewrite":
      return "REWRITE";
    case "data_classification":
      return d.action === "REWRITE" ? "REWRITE" : "REFUSE";
    case "system_taint":
      return "REFUSE";
    default:
      return undefined;
  }
}

function declaredKindScope(d: GuardDescription | undefined): ReadonlyArray<string> | undefined {
  if (d?.kind === "system_taint") return [...d.systemOnlyKinds];
  return undefined;
}

function inferOutcomes(
  applicable: ReadonlyArray<GuardManifestNode>,
  def: "REFUSE" | "EXECUTE",
): DecisionOutcomeSummary {
  const evidence: DecisionEvidence[] = [];
  let hasOpaqueGuards = false;
  for (const g of applicable) {
    if (g.emits !== undefined) {
      const confidence: DecisionEvidence["confidence"] =
        g.description?.kind === "threshold" ? "inferred" : "declared";
      evidence.push({ outcome: g.emits, source: g.name, confidence });
    } else {
      // Any applicable guard with no resolvable `emits` is opaque on the emit
      // axis (ADR-105): no description, an `opaque` description, a `threshold`
      // without a declared `emits`, OR an unknown/forward-compat kind. All of
      // these mean `possible` is a LOWER bound, not a complete enumeration — so
      // flag it rather than silently asserting a complete outcome set.
      hasOpaqueGuards = true;
    }
  }
  evidence.push({ outcome: def, source: "policy.default", confidence: "default" });
  const seen = new Set<DecisionKind>();
  const possible: DecisionKind[] = [];
  for (const e of evidence) {
    if (!seen.has(e.outcome)) {
      seen.add(e.outcome);
      possible.push(e.outcome);
    }
  }
  return { possible, evidence, hasOpaqueGuards };
}

function safeTaintFloor(bundle: { taint: { minimumFor(k: string): unknown } }, kind: string): Taint | "unknown" {
  let t: unknown;
  try {
    t = bundle.taint.minimumFor(kind);
  } catch {
    return "unknown";
  }
  return t === "SYSTEM" || t === "TRUSTED" || t === "UNTRUSTED" ? t : "unknown";
}

function invertToolMap(map: Readonly<Record<string, string>> | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (map === undefined) return out;
  for (const [tool, intent] of Object.entries(map)) {
    const arr = out.get(intent) ?? [];
    arr.push(tool);
    out.set(intent, arr);
  }
  for (const arr of out.values()) arr.sort();
  return out;
}

/** Best-effort source location for a named guard across the supplied files. */
function locate(
  files: ReadonlyArray<SourceFile>,
  name: string,
  sourceRoot?: string,
): SourceLocation | undefined {
  if (files.length === 0 || name.endsWith("]")) return undefined; // positional name → skip
  for (const f of files) {
    const v = f.getVariableDeclaration(name);
    if (v !== undefined) return locationOf(f, v.getStart(), sourceRoot);
    const fn = f.getFunction(name);
    if (fn !== undefined) return locationOf(f, fn.getStart(), sourceRoot);
  }
  // Fallback: a `nameGuard("<name>", …)` call site.
  for (const f of files) {
    for (const call of f.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (!Node.isIdentifier(expr) || expr.getText() !== "nameGuard") continue;
      const a0 = call.getArguments()[0];
      if (a0 !== undefined && Node.isStringLiteral(a0) && a0.getLiteralValue() === name) {
        return locationOf(f, call.getStart(), sourceRoot);
      }
    }
  }
  return undefined;
}

function locationOf(file: SourceFile, pos: number, sourceRoot?: string): SourceLocation {
  const { line, column } = file.getLineAndColumnAtPos(pos);
  const abs: string = file.getFilePath();
  let rel = abs;
  if (sourceRoot !== undefined && sourceRoot.length > 0) {
    const root = sourceRoot.endsWith("/") ? sourceRoot : `${sourceRoot}/`;
    if (abs.startsWith(root)) rel = abs.slice(root.length);
  }
  return { file: rel, line, column };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      if (DIGEST_EXCLUDED_KEYS.has(k)) continue;
      out[k] = sortValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
