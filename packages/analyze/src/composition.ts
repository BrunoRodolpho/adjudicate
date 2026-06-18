/**
 * Multi-pack composition analysis (ADR-140) — a TIER-1 (metadata-driven) check
 * over the adopter-declared set of Packs they fold into one combined PackV0.
 *
 * OFFLINE / CI ONLY. Pure: reads only declarative surfaces (intents, taint
 * minimums, guard `GuardDescription` metadata, DEFER signals) — no planner
 * probes, no I/O, no clock. `@adjudicate/core` must never import this module
 * (asserted by the `composition_no_runtime_path` conformance test); running this
 * inside `adjudicate()` would break determinism and replay.
 *
 * The gating checks here are sound WITH RESPECT TO DECLARED METADATA (declarative,
 * no probe-coverage dependency):
 *   AJD-107 RewriteOverlap        — two packs REWRITE overlapping payload fields
 *   AJD-108 DeferSignalCollision  — two packs DEFER on the same (un-prefixed) signal
 *   AJD-109 TaintContradiction    — a shared intent has conflicting taint floors
 *   AJD-110 CapabilityOverlap     — two packs declare the same intent kind
 * Probe-dependent reachability checks (AJD-302/303) are advisory Tier-3, NOT here.
 *
 * SOUNDNESS CAVEAT (AJD-107): a guard may emit a REWRITE Decision at runtime while
 * declaring `kind:"opaque"` or carrying NO `description` (guard metadata is optional
 * — ADR-105 rule 7). `extractFacts` can only see DECLARED rewrite scope, so two packs
 * that both rewrite the same field via undeclared/opaque guards are NOT caught here.
 * AJD-107 is therefore sound only over guards that declare their rewrite scope; for a
 * fully sound gate, require rewrite-scope declaration on every guard (a future
 * AJD-111 UndeclaredRewriteScope check) or use Tier-2 static analysis.
 */
import type { PackV0, Taint } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import type { DiagnosticCode, DiagnosticSeverity } from "./types.js";
import { eachGuard } from "./internal/walk.js";

export interface CompositionConflict {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Pack ids involved, sorted. */
  readonly packs: ReadonlyArray<string>;
  readonly detail?: Record<string, unknown>;
}

export interface CompositionCheck {
  readonly code: DiagnosticCode;
  readonly name: string;
}

export interface CompositionReport {
  readonly packIds: ReadonlyArray<string>;
  readonly conflicts: ReadonlyArray<CompositionConflict>;
  readonly checks: ReadonlyArray<CompositionCheck>;
  readonly summary: { readonly error: number; readonly warning: number; readonly note: number };
  /** True iff no error-severity conflict — the CI merge gate condition. */
  readonly passed: boolean;
}

export interface CompositionAnalyzeOptions {
  /** Downgrade/upgrade a check's severity (e.g. make AJD-107 a warning). */
  readonly severityOverrides?: Readonly<Partial<Record<DiagnosticCode, DiagnosticSeverity>>>;
}

const CHECKS: ReadonlyArray<CompositionCheck> = [
  { code: "AJD-107", name: "RewriteOverlap" },
  { code: "AJD-108", name: "DeferSignalCollision" },
  { code: "AJD-109", name: "TaintContradiction" },
  { code: "AJD-110", name: "CapabilityOverlap" },
];

interface PackFacts {
  readonly id: string;
  readonly intents: ReadonlyArray<string>;
  readonly taint: ReadonlyMap<string, Taint>;
  readonly mutatedFields: ReadonlySet<string>;
  readonly deferSignals: ReadonlySet<string>;
}

function extractFacts(pack: PackV0): PackFacts {
  const intents = [...pack.intents].sort();
  const taint = new Map<string, Taint>();
  for (const kind of intents) {
    try {
      taint.set(kind, pack.policy.taint.minimumFor(kind));
    } catch {
      /* opaque taint policy — skip this kind */
    }
  }
  const mutatedFields = new Set<string>();
  const deferSignals = new Set<string>();
  eachGuard(pack, (guard) => {
    const d = readGuardMetadata(guard)?.description;
    if (!d) return;
    if (d.kind === "rewrite") {
      for (const f of d.mutatesPayloadFields) mutatedFields.add(f);
    } else if (d.kind === "data_classification" && d.action === "REWRITE") {
      for (const f of d.scannedFields) mutatedFields.add(f);
    } else if (d.kind === "state_defer") {
      deferSignals.add(d.signal);
    }
  });
  return { id: pack.id, intents, taint, mutatedFields, deferSignals };
}

/**
 * Two dotted payload paths OVERLAP when one is a prefix (segment-wise) of the
 * other: rewriting `items` collides with rewriting `items.0.qty` (the array
 * rewrite clobbers the nested one) even though the strings differ. Compared
 * segment-by-segment, NOT by substring, so `item` does not match `items`.
 */
function pathsOverlap(x: string, y: string): boolean {
  if (x === y) return true;
  const a = x.split(".");
  const b = y.split(".");
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Deterministic, de-duplicated labels for every overlapping field pair between two sets. */
function overlappingFields(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  const labels = new Set<string>();
  for (const fa of a) {
    for (const fb of b) {
      if (!pathsOverlap(fa, fb)) continue;
      if (fa === fb) {
        labels.add(fa);
      } else {
        const [parent, child] = fa.split(".").length <= fb.split(".").length ? [fa, fb] : [fb, fa];
        labels.add(`${parent} ⊃ ${child}`);
      }
    }
  }
  return [...labels].sort();
}

/**
 * Analyze the composition of a declared set of Packs. Deterministic + pure.
 * `passed === false` (an error-severity conflict) is the CI merge-gate failure.
 */
export function analyzeComposition(
  packs: ReadonlyArray<PackV0>,
  options: CompositionAnalyzeOptions = {},
): CompositionReport {
  const facts = packs.map(extractFacts).sort((a, b) => a.id.localeCompare(b.id));
  const sev = (code: DiagnosticCode): DiagnosticSeverity => options.severityOverrides?.[code] ?? "error";
  const conflicts: CompositionConflict[] = [];

  for (let i = 0; i < facts.length; i += 1) {
    for (let j = i + 1; j < facts.length; j += 1) {
      const a = facts[i]!;
      const b = facts[j]!;
      const pair = [a.id, b.id];

      const sharedIntents = a.intents.filter((k) => b.intents.includes(k));
      if (sharedIntents.length > 0) {
        conflicts.push({
          code: "AJD-110",
          severity: sev("AJD-110"),
          message: `Packs "${a.id}" and "${b.id}" both declare intent(s): ${sharedIntents.join(", ")}.`,
          packs: pair,
          detail: { intents: sharedIntents },
        });
      }
      for (const k of sharedIntents) {
        const ta = a.taint.get(k);
        const tb = b.taint.get(k);
        if (ta !== undefined && tb !== undefined && ta !== tb) {
          conflicts.push({
            code: "AJD-109",
            severity: sev("AJD-109"),
            message: `Intent "${k}" has conflicting taint floors: ${a.id}=${ta}, ${b.id}=${tb}.`,
            packs: pair,
            detail: { intent: k, [a.id]: ta, [b.id]: tb },
          });
        }
      }

      const sharedFields = overlappingFields(a.mutatedFields, b.mutatedFields);
      if (sharedFields.length > 0) {
        conflicts.push({
          code: "AJD-107",
          severity: sev("AJD-107"),
          message: `Packs "${a.id}" and "${b.id}" both REWRITE overlapping payload field(s): ${sharedFields.join(", ")}.`,
          packs: pair,
          detail: { fields: sharedFields },
        });
      }

      const sharedSignals = [...a.deferSignals].filter((s) => b.deferSignals.has(s)).sort();
      if (sharedSignals.length > 0) {
        conflicts.push({
          code: "AJD-108",
          severity: sev("AJD-108"),
          message: `Packs "${a.id}" and "${b.id}" DEFER on the same signal(s): ${sharedSignals.join(", ")} — pack-id-prefix your DEFER signals.`,
          packs: pair,
          detail: { signals: sharedSignals },
        });
      }
    }
  }

  conflicts.sort((x, y) =>
    x.code === y.code ? x.packs.join().localeCompare(y.packs.join()) : x.code.localeCompare(y.code),
  );

  const summary = { error: 0, warning: 0, note: 0 };
  for (const c of conflicts) summary[c.severity] += 1;

  return {
    packIds: facts.map((f) => f.id),
    conflicts,
    checks: CHECKS,
    summary,
    passed: summary.error === 0,
  };
}
