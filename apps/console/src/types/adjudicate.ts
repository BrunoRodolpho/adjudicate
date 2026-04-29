// Single source of truth: @adjudicate/core. Do NOT redeclare these — drift
// would silently misrepresent audit data. If something needed by the console
// is missing from the public surface, add it to packages/core/src/index.ts
// instead of duplicating here.

export type {
  // Envelope
  IntentEnvelope,
  IntentActor,
  IntentEnvelopeVersion,
  // Decision
  Decision,
  DecisionKind,
  // Basis
  DecisionBasis,
  BasisCategory,
  // Refusal
  Refusal,
  RefusalKind,
  // Taint
  Taint,
  TaintedValue,
  // Audit
  AuditRecord,
  AuditRecordVersion,
  AuditPlanSnapshot,
} from "@adjudicate/core";

// ─── Console-only view types ────────────────────────────────────────────────
// These never re-export back into the framework.

import type { AuditRecord, DecisionKind, Taint } from "@adjudicate/core";

export interface AuditQuery {
  readonly intentKind?: string;
  readonly decisionKind?: DecisionKind;
  readonly refusalCode?: string;
  readonly taint?: Taint;
  readonly since?: string;
  readonly until?: string;
  readonly intentHash?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditQueryResult {
  readonly records: readonly AuditRecord[];
  readonly nextCursor?: string;
}
