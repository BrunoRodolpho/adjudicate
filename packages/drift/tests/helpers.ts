import type { AuditRecord } from "@adjudicate/core";

/** Minimal AuditRecord carrying only the fields the detector reads. */
export function rec(
  decisionKind: string,
  intentKind = "x.kind",
  basisCategories: ReadonlyArray<string> = ["business"],
): AuditRecord {
  return {
    version: 5,
    intentHash: `0x${decisionKind}${intentKind}`,
    envelope: { kind: intentKind } as AuditRecord["envelope"],
    decision: { kind: decisionKind } as AuditRecord["decision"],
    decision_basis: basisCategories.map((category) => ({ category, code: "x" })) as AuditRecord["decision_basis"],
    at: "2026-05-18T00:00:00.000Z",
    durationMs: 1,
  } as AuditRecord;
}

export function many(n: number, decisionKind: string, intentKind?: string): AuditRecord[] {
  return Array.from({ length: n }, () => rec(decisionKind, intentKind));
}
