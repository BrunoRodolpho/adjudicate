/**
 * The seven kernel primitives that the homepage names. Each links to the
 * actual source file on GitHub so the marketing claim is verifiable.
 */

export interface PrimitiveContent {
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly sourcePath: string;
}

export const PRIMITIVES: ReadonlyArray<PrimitiveContent> = [
  {
    name: "IntentEnvelope",
    tagline: "Canonical proposed action",
    description:
      "Every mutation crosses the kernel as an IntentEnvelope — version, kind, payload, actor, taint, nonce, and a canonical-JSON SHA-256 hash that replay depends on.",
    sourcePath: "packages/core/src/envelope.ts",
  },
  {
    name: "Decision",
    tagline: "Tagged union of six outcomes + basis",
    description:
      "EXECUTE, REFUSE, REWRITE, DEFER, ESCALATE, REQUEST_CONFIRMATION. Every Decision carries a structured basis array so audit consumers see the why, not just the what.",
    sourcePath: "packages/core/src/decision.ts",
  },
  {
    name: "Guard",
    tagline: "(env, state) => Decision | null",
    description:
      "A pure deterministic predicate. Returns a Decision to short-circuit, null to pass. Guards compose freely; the policy bundle declares ordering.",
    sourcePath: "packages/core/src/kernel/policy.ts",
  },
  {
    name: "PolicyBundle",
    tagline: "Ordered governance stack: state → taint → auth → business",
    description:
      "The fixed-order pipeline through which every envelope flows. The order is the contract — re-ordering phases changes meaning; the kernel enforces it.",
    sourcePath: "packages/core/src/kernel/policy.ts",
  },
  {
    name: "Ledger",
    tagline: "Replay / idempotency protection",
    description:
      "Keyed by intentHash. checkLedger short-circuits duplicate proposals to REPLAY_SUPPRESSED; recordExecution claims the key on EXECUTE to prevent double-fire.",
    sourcePath: "packages/core/src/ledger.ts",
  },
  {
    name: "AuditRecord",
    tagline: "Durable forensic evidence per decision",
    description:
      "v3 ships envelope + decision + basis + plan snapshot + supersession link. Postgres-mirrored. Replay-safe — replayEnvelopeFromAudit produces a byte-identical envelope.",
    sourcePath: "packages/core/src/audit.ts",
  },
  {
    name: "RuntimeContext",
    tagline: "Per-tenant container",
    description:
      "Kill switch, MetricsSink, LearningSink, EnforceConfig, KernelIdentity. Threaded through adjudicateAndAudit so multi-tenant routes never share module-level state.",
    sourcePath: "packages/core/src/kernel/runtime-context.ts",
  },
];

export { GITHUB_BLOB_BASE as REPO_BASE } from "./github";
