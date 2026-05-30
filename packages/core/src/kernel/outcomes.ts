/**
 * Outcome reconciliation — record what actually happened after the kernel's
 * Decision.
 *
 * Per SA2 Rec 6, this is the substrate for "decision accuracy" analytics:
 * the kernel said EXECUTE, then upstream observation says the action
 * succeeded (or failed, or was withdrawn). Sinks accept retrospective
 * outcomes keyed by `intentHash` so audit rows can be joined with reality.
 *
 * v0 is a strict push API — no expiry, no compaction, no consensus across
 * sinks. Production adopters wire `PostgresOutcomeSink` from
 * `@adjudicate/audit-postgres` (Phase 1.5C) for durable storage.
 */

import { z } from "zod";

export type ObservedOutcome = "succeeded" | "failed" | "withdrawn";

export interface RetrospectiveOutcome {
  /**
   * intentHash of the AuditRecord this outcome reconciles. The Postgres
   * sink joins on this column.
   */
  readonly intentHash: string;
  readonly observed: ObservedOutcome;
  /** ISO-8601 wall-clock when the outcome was observed. */
  readonly at: string;
  /** Free-form note carrying operator context. Bounded by adopters. */
  readonly note?: string;
}

/**
 * Wire schema for `RetrospectiveOutcome`. Enforces a 2000-character cap on
 * `note` so unbounded operator text cannot inflate audit storage or bypass
 * downstream column limits. Call `RetrospectiveOutcomeWireSchema.parse(raw)`
 * at API boundaries (tRPC mutation handler, REST adapter) before forwarding
 * to `recordRetrospectiveOutcome`.
 *
 * APIReviewer-011: `note` has no length cap at the interface level; the Zod
 * schema is the authoritative wire-boundary enforcement point.
 */
export const RetrospectiveOutcomeWireSchema = z.object({
  intentHash: z.string().min(1),
  observed: z.enum(["succeeded", "failed", "withdrawn"]),
  at: z.string().min(1),
  note: z.string().max(2000).optional(),
});

export interface OutcomeSink {
  recordOutcome(outcome: RetrospectiveOutcome): void | Promise<void>;
}

let _sink: OutcomeSink = noopOutcomeSink();
let _explicitlySet = false;

export function setOutcomeSink(sink: OutcomeSink): void {
  _sink = sink;
  _explicitlySet = true;
}

/** Has an OutcomeSink been explicitly installed via setOutcomeSink? */
export function hasOutcomeSink(): boolean {
  return _explicitlySet;
}

/** @internal — for tests. */
export function _resetOutcomeSink(): void {
  _sink = noopOutcomeSink();
  _explicitlySet = false;
}

function noopOutcomeSink(): OutcomeSink {
  return { recordOutcome() {} };
}

/**
 * Module-level helper — adopters compose `setOutcomeSink(yourSink)` once at
 * boot, then forward retrospective observations through this function.
 */
export async function recordRetrospectiveOutcome(
  outcome: RetrospectiveOutcome,
): Promise<void> {
  await _sink.recordOutcome(outcome);
}

/**
 * In-memory accumulator. Useful for tests, dev, and adopters who don't
 * need durable storage yet.
 *
 * The map is keyed by `intentHash`; later observations overwrite earlier
 * ones (last-write-wins). Adopters who need full history install a
 * Postgres sink and append rather than overwrite.
 */
export class InMemoryOutcomeSink implements OutcomeSink {
  private readonly memo = new Map<string, RetrospectiveOutcome>();
  recordOutcome(outcome: RetrospectiveOutcome): void {
    this.memo.set(outcome.intentHash, outcome);
  }
  get(intentHash: string): RetrospectiveOutcome | undefined {
    return this.memo.get(intentHash);
  }
  all(): readonly RetrospectiveOutcome[] {
    return Array.from(this.memo.values());
  }
}
