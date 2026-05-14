/**
 * Comparison rows for the OPA/Cedar wedge table. Honesty rule: every
 * claim here should be directly verifiable in the codebase. The "kernel
 * identity" row is the only one marked seam-only.
 */

export interface WedgeRow {
  readonly capability: string;
  readonly opaCedar: "yes" | "no" | "partial";
  readonly adjudicate: "yes" | "no" | "partial" | "seam";
  readonly snippet?: string;
}

export const WEDGE: ReadonlyArray<WedgeRow> = [
  {
    capability: "Synchronous allow/deny",
    opaCedar: "yes",
    adjudicate: "yes",
  },
  {
    capability: "Async DEFER (park until external signal)",
    opaCedar: "no",
    adjudicate: "yes",
    snippet: `return decisionDefer("payment.confirmed", 15*60*1000, basis);`,
  },
  {
    capability: "Kernel-owned REWRITE (sanitise / clamp)",
    opaCedar: "no",
    adjudicate: "yes",
    snippet: `return decisionRewrite(rewritten, "clamped to cap", basis);`,
  },
  {
    capability: "Taint provenance as runtime gate",
    opaCedar: "no",
    adjudicate: "yes",
    snippet: `taint: createSystemTaintPolicy({ systemOnlyKinds: ["pix.charge.confirm"] })`,
  },
  {
    capability: "Replay-safe ledger (intentHash dedup)",
    opaCedar: "no",
    adjudicate: "yes",
  },
  {
    capability: "Forensic AuditRecord (v3 — with supersession links)",
    opaCedar: "partial",
    adjudicate: "yes",
  },
  {
    capability: "Pack-based domain bundling",
    opaCedar: "no",
    adjudicate: "yes",
  },
  {
    capability: "Kernel identity / build attestation",
    opaCedar: "no",
    adjudicate: "seam",
    snippet: "// KernelIdentity seam shipped; attest() throws in v0.1",
  },
];
