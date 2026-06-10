/**
 * Pure client-side diff of two PolicyManifests for the tree's drift mode.
 *
 * Standalone (does NOT import `@adjudicate/analyze`) so the browser bundle
 * never pulls ts-morph. Operates on the wire-shape `PolicyManifestParsed`.
 * Keyed by pack id → intent kind → guard name; "changed" is a deep structural
 * inequality on the node (excluding children handled at their own level, and
 * excluding `sourceLocation` which is provenance, not rule identity).
 */

import type { PolicyManifestParsed } from "@adjudicate/admin-sdk";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

// Unit Separator (U+001F) — cannot occur in pack ids / intent kinds / guard
// names, so keys can't collide the way a plain space could ("a b"+"c" vs
// "a"+"b c" both → "a b c").
const SEP = "\u001f";
export const intentKey = (packId: string, kind: string): string => `${packId}${SEP}${kind}`;
export const guardKey = (packId: string, name: string): string => `${packId}${SEP}${name}`;

export interface ManifestDiff {
  readonly identical: boolean;
  readonly packStatus: ReadonlyMap<string, DiffStatus>;
  readonly intentStatus: ReadonlyMap<string, DiffStatus>;
  readonly guardStatus: ReadonlyMap<string, DiffStatus>;
  readonly counts: { added: number; removed: number; changed: number };
}

// Keys excluded from the structural comparison. `sourceLocation` is provenance
// (where a guard is authored), NOT rule identity — a guard moving lines, or a
// baseline exported WITH source files vs a live manifest built WITHOUT them,
// must not register as drift. (This mirrors @adjudicate/analyze's digest.)
const EXCLUDED_KEYS = new Set(["sourceLocation"]);

function stable(value: unknown): string {
  return JSON.stringify(sort(value));
}
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      if (EXCLUDED_KEYS.has(k)) continue;
      out[k] = sort((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

type Pack = PolicyManifestParsed["packs"][number];
type Intent = Pack["intents"][number];
type Guard = Pack["guards"][number];

/** Compare two manifests; returns per-node status maps for tree coloring. */
export function diffManifests(
  prev: PolicyManifestParsed,
  next: PolicyManifestParsed,
): ManifestDiff {
  const packStatus = new Map<string, DiffStatus>();
  const intentStatus = new Map<string, DiffStatus>();
  const guardStatus = new Map<string, DiffStatus>();
  const counts = { added: 0, removed: 0, changed: 0 };

  const prevPacks = new Map(prev.packs.map((p) => [p.id, p]));
  const nextPacks = new Map(next.packs.map((p) => [p.id, p]));

  const note = (s: DiffStatus): void => {
    if (s === "added") counts.added++;
    else if (s === "removed") counts.removed++;
    else if (s === "changed") counts.changed++;
  };

  const diffList = <T,>(
    prevArr: ReadonlyArray<T>,
    nextArr: ReadonlyArray<T>,
    keyOf: (x: T) => string,
    setStatus: (key: string, s: DiffStatus) => void,
  ): void => {
    const pm = new Map(prevArr.map((x) => [keyOf(x), x]));
    const nm = new Map(nextArr.map((x) => [keyOf(x), x]));
    for (const [k] of pm) if (!nm.has(k)) { setStatus(k, "removed"); note("removed"); }
    for (const [k, n] of nm) {
      const p = pm.get(k);
      if (p === undefined) { setStatus(k, "added"); note("added"); }
      else if (stable(p) !== stable(n)) { setStatus(k, "changed"); note("changed"); }
      else setStatus(k, "unchanged");
    }
  };

  // Removed packs: enumerate their children as 'removed' too — both so the
  // status maps surface WHICH intents/guards disappeared, and so counts are
  // symmetric with the added-pack path (pack + every child), not 1-vs-N.
  for (const [id, pp] of prevPacks) {
    if (nextPacks.has(id)) continue;
    packStatus.set(id, "removed");
    note("removed");
    diffList<Intent>(pp.intents, [], (i) => i.kind, (k, s) => intentStatus.set(intentKey(id, k), s));
    diffList<Guard>(pp.guards, [], (g) => g.name, (k, s) => guardStatus.set(guardKey(id, k), s));
  }

  for (const [id, np] of nextPacks) {
    const pp = prevPacks.get(id);
    if (pp === undefined) { packStatus.set(id, "added"); note("added"); }
    else packStatus.set(id, stable(pp) === stable(np) ? "unchanged" : "changed");

    diffList<Intent>(
      pp?.intents ?? [],
      np.intents,
      (i) => i.kind,
      (k, s) => intentStatus.set(intentKey(id, k), s),
    );
    diffList<Guard>(
      pp?.guards ?? [],
      np.guards,
      (g) => g.name,
      (k, s) => guardStatus.set(guardKey(id, k), s),
    );
  }

  return {
    // Structural (not digest-based) so a hand-edited baseline with a stale
    // digest can never report "identical" while showing node changes.
    identical: counts.added + counts.removed + counts.changed === 0,
    packStatus,
    intentStatus,
    guardStatus,
    counts,
  };
}

/** Removed nodes for the drift summary (the tree renders only live nodes). */
export function removedNodes(diff: ManifestDiff): {
  packs: string[];
  intents: string[];
  guards: string[];
} {
  const split = (key: string): string => key.split(SEP).join(" / ");
  const packs: string[] = [];
  const intents: string[] = [];
  const guards: string[] = [];
  for (const [id, s] of diff.packStatus) if (s === "removed") packs.push(id);
  for (const [k, s] of diff.intentStatus) if (s === "removed") intents.push(split(k));
  for (const [k, s] of diff.guardStatus) if (s === "removed") guards.push(split(k));
  return { packs: packs.sort(), intents: intents.sort(), guards: guards.sort() };
}
