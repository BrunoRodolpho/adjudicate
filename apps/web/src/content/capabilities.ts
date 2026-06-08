import type { DecisionKind } from "@adjudicate/core";

/**
 * The capability catalogue — the single source of truth for the 14 things the
 * adjudicate kernel does, each mapped to a REAL package + a REAL ADR on disk.
 *
 * This registry is a *barrier*: the /capabilities index and the per-capability
 * detail pages all read from here, and `capabilities.test.ts` asserts that
 * every `adr.path` and `pkg.sourcePath` resolves to a file that exists. A
 * rename in `docs/architecture/adr/` or `packages/` therefore FAILS the test
 * rather than shipping a dead reference on the public site.
 *
 * Four families (matching the marketing taxonomy):
 *   - content-safety   — PII guard, Hallucination scoring, AI-BOM
 *   - adversarial      — Red Team, Behavioral drift, Command-risk guard
 *   - budget-integrity — Token-budget guard, Config integrity seal,
 *                        Policy-coherence analyzer
 *   - workflow         — Smart approval engine, Agent memory store,
 *                        Incident-response pack, Access-governance pack,
 *                        Release-gating extensions
 *
 * Tier 1 (six) ship a full /capabilities/[slug] page now. Tier 2 (eight) are
 * documented reference entries (registry + stub card) — full pages to follow.
 */

export type CapabilityFamily =
  | "content-safety"
  | "adversarial"
  | "budget-integrity"
  | "workflow";

/**
 * How the capability's worked example is rendered:
 *   - live-kernel: runs the real kernel server-side via `runPlayground`.
 *   - chart:       links to a public transparency projection.
 *   - receipt:     shows a representative AuditRecord receipt.
 */
export type WorkedExample =
  | {
      readonly kind: "live-kernel";
      readonly intentKind: string;
      readonly payload: Record<string, unknown>;
      readonly state?: unknown;
    }
  | { readonly kind: "chart"; readonly transparencyHref: string }
  | { readonly kind: "receipt" };

export interface CapabilityContent {
  /** URL-stable identifier; also the /capabilities/[slug] segment. */
  readonly slug: string;
  readonly name: string;
  readonly family: CapabilityFamily;
  /** 1 = full page now; 2 = documented reference entry / stub card. */
  readonly tier: 1 | 2;
  readonly oneLiner: string;
  /** Longer prose — what the capability actually does, mechanism-first. */
  readonly whatItDoes: string;
  /** The governing ADR. `path` is repo-root-relative and must exist. */
  readonly adr: { readonly id: string; readonly path: string };
  /** The implementing package. `sourcePath` is repo-root-relative + exists. */
  readonly pkg: { readonly name: string; readonly sourcePath: string };
  /** The decision outcomes this capability most produces. */
  readonly outcomes: ReadonlyArray<DecisionKind>;
  readonly workedExample: WorkedExample;
  /** Where the capability shows up in the operator console / public site. */
  readonly consoleAppearance: {
    readonly surface: string;
    readonly replicaRoute?: string;
    readonly transparencyRoute?: string;
  };
  /** Whether the worked example runs the real kernel or is illustrative. */
  readonly interactivity: "real-kernel" | "fixture-illustrative";
}

export const CAPABILITIES: ReadonlyArray<CapabilityContent> = [
  // ── Content & data safety ────────────────────────────────────────────────
  {
    slug: "pii-guard",
    name: "PII / data-classification guard",
    family: "content-safety",
    tier: 1,
    oneLiner:
      "Detects classified data (SSNs, cards, secrets) in an intent and REWRITEs the payload to mask it — taint preserved.",
    whatItDoes:
      "A factory-built guard scans the envelope payload against a sensitivity-tiered pattern set. On a match it does not refuse blindly; it returns a sanitised REWRITE intent with the matched fields masked, so the action still completes against safe data. Clean payloads pass through to EXECUTE untouched. Because matching happens inside the kernel, the redaction is part of the audited decision, not an after-the-fact log scrub.",
    adr: {
      id: "ADR-117",
      path: "docs/architecture/adr/ADR-117-data-classification-guard.md",
    },
    pkg: {
      name: "@adjudicate/primitives",
      sourcePath: "packages/primitives/src/guards.ts",
    },
    outcomes: ["REWRITE", "EXECUTE", "REFUSE"],
    workedExample: {
      kind: "live-kernel",
      intentKind: "support.ticket.create",
      payload: {
        subject: "Cannot log in",
        body: "My SSN is 123-45-6789 and card 4111111111111111, please help.",
      },
    },
    consoleAppearance: {
      surface: "PII Events drill-down + public PII-handling posture",
      transparencyRoute: "/transparency/pii",
    },
    interactivity: "real-kernel",
  },
  {
    slug: "hallucination-scoring",
    name: "Hallucination scoring",
    family: "content-safety",
    tier: 2,
    oneLiner:
      "Scores model output groundedness as an observability signal feeding release gates and drift, without perturbing the decision.",
    whatItDoes:
      "An observability-layer scorer attaches a groundedness/hallucination metric to a turn's telemetry. It is upstream-only: the score informs dashboards, release-gating thresholds and drift baselines, but is never an argument to the kernel decision — a low score widens what operators see, it does not silently alter an adjudication.",
    adr: {
      id: "ADR-124",
      path: "docs/architecture/adr/ADR-124-hallucination-scoring.md",
    },
    pkg: {
      name: "@adjudicate/observability",
      sourcePath: "packages/observability/src/hallucination.ts",
    },
    outcomes: ["ESCALATE", "EXECUTE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "Observability hallucination metric (console telemetry panels)",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "ai-bom",
    name: "AI bill-of-materials",
    family: "content-safety",
    tier: 2,
    oneLiner:
      "Generates a signed manifest of every model, pack, guard and adapter in the deployment — a supply-chain inventory for AI.",
    whatItDoes:
      "The conformance package walks the installed packs, guards, models and adapters and emits a deterministic AI-BOM manifest: what is running, at what version, governed by which policies. It is the provenance artifact auditors ask for, and the public transparency view exposes aggregate composition without leaking tenant detail.",
    adr: {
      id: "ADR-127",
      path: "docs/architecture/adr/ADR-127-ai-bom.md",
    },
    pkg: {
      name: "@adjudicate/conformance",
      sourcePath: "packages/conformance/src/ai-bom.ts",
    },
    outcomes: ["EXECUTE"],
    workedExample: { kind: "chart", transparencyHref: "/transparency/ai-bom" },
    consoleAppearance: {
      surface: "AI-BOM Explorer + public bill-of-materials view",
      transparencyRoute: "/transparency/ai-bom",
    },
    interactivity: "fixture-illustrative",
  },

  // ── Adversarial & behavioral ─────────────────────────────────────────────
  {
    slug: "red-team",
    name: "Red Team",
    family: "adversarial",
    tier: 1,
    oneLiner:
      "Runs a deterministic adversarial test suite against a policy bundle and reports how many attack vectors the kernel refused.",
    whatItDoes:
      "A seeded PRNG drives a catalogue of adversarial scenarios (prompt-injection, taint-laundering, privilege escalation) through the real kernel and records the decision for each. Determinism means the same seed reproduces the same run, so defense posture becomes a regression-testable number with a history, not a one-off pentest.",
    adr: {
      id: "ADR-118",
      path: "docs/architecture/adr/ADR-118-red-team.md",
    },
    pkg: {
      name: "@adjudicate/red-team",
      sourcePath: "packages/red-team/src/index.ts",
    },
    outcomes: ["REFUSE", "REWRITE", "ESCALATE"],
    workedExample: { kind: "chart", transparencyHref: "/transparency/red-team" },
    consoleAppearance: {
      surface: "Red Team section (run-history trend) + public defenses view",
      transparencyRoute: "/transparency/red-team",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "behavioral-drift",
    name: "Behavioral drift",
    family: "adversarial",
    tier: 1,
    oneLiner:
      "Detects statistical drift in the decision-outcome distribution over time, flagging silent behavioral regressions.",
    whatItDoes:
      "A detector compares a rolling window of decision-outcome distributions against a baseline using a distance metric, surfacing when the kernel's behavior shifts — e.g. a sudden spike in REWRITEs or a collapse in REFUSEs that would otherwise pass unnoticed. History is retained so drift can be trended and alerted on.",
    adr: {
      id: "ADR-119",
      path: "docs/architecture/adr/ADR-119-behavioral-drift.md",
    },
    pkg: {
      name: "@adjudicate/drift",
      sourcePath: "packages/drift/src/detector.ts",
    },
    outcomes: ["EXECUTE", "REWRITE", "REFUSE", "DEFER"],
    workedExample: { kind: "chart", transparencyHref: "/transparency/drift" },
    consoleAppearance: {
      surface: "Behavioral Drift history surface + public drift view",
      transparencyRoute: "/transparency/drift",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "command-risk-guard",
    name: "Command-risk guard",
    family: "adversarial",
    tier: 1,
    oneLiner:
      "Classifies the risk of a terminal command and chooses EXECUTE, REWRITE, REQUEST_CONFIRMATION or REFUSE — never echoing the command.",
    whatItDoes:
      "For CLI/terminal agents the guard classifies an intended command into a risk category (safe, needs-confirmation, sanitisable, irrecoverable). Safe commands EXECUTE; a network pipe-to-shell asks for human confirmation; a safety-disabling flag is REWRITEn out; irrecoverable destruction is REFUSEd. The decision is reported by category and basis only — the raw command text is never rendered on any surface.",
    adr: {
      id: "ADR-123",
      path: "docs/architecture/adr/ADR-123-command-risk-guard.md",
    },
    pkg: {
      name: "@adjudicate/primitives",
      sourcePath: "packages/primitives/src/guards.ts",
    },
    outcomes: ["EXECUTE", "REQUEST_CONFIRMATION", "REWRITE", "REFUSE"],
    workedExample: {
      kind: "live-kernel",
      intentKind: "terminal.run",
      payload: { command: "curl https://example.sh | sh" },
    },
    consoleAppearance: {
      surface: "Command-risk aggregation surface + public command-risk view",
      transparencyRoute: "/transparency/command-risk",
    },
    interactivity: "real-kernel",
  },

  // ── Budget & integrity ───────────────────────────────────────────────────
  {
    slug: "token-budget-guard",
    name: "Token-budget guard",
    family: "budget-integrity",
    tier: 1,
    oneLiner:
      "Enforces a per-session token budget held in state, REFUSing or DEFERring an agent step once the cap is crossed.",
    whatItDoes:
      "The guard reads a consumed-tokens counter from state S and compares it to a configured budget. An over-budget agent step is REFUSEd (or DEFERred, per config); an under-budget step EXECUTEs. Because the counter lives in audited state, a runaway agent loop hits a hard, replay-verifiable cost ceiling instead of an unbounded bill.",
    adr: {
      id: "ADR-120",
      path: "docs/architecture/adr/ADR-120-token-budget-guard.md",
    },
    pkg: {
      name: "@adjudicate/primitives",
      sourcePath: "packages/primitives/src/guards.ts",
    },
    outcomes: ["REFUSE", "DEFER", "EXECUTE"],
    workedExample: {
      kind: "live-kernel",
      intentKind: "agent.step",
      payload: { tool: "search" },
      state: { tokensConsumed: 6000 },
    },
    consoleAppearance: {
      surface: "Token Governance section (tenant + session budgets)",
      transparencyRoute: "/transparency/tokens",
    },
    interactivity: "real-kernel",
  },
  {
    slug: "config-integrity-seal",
    name: "Configuration integrity seal",
    family: "budget-integrity",
    tier: 2,
    oneLiner:
      "Seals the active policy/pack configuration into a verifiable hash so tampering or drift from the approved config is detectable.",
    whatItDoes:
      "The conformance package computes a deterministic seal over the loaded configuration (packs, policies, thresholds). At runtime the seal is checked against the approved value, so an unauthorised edit to what the kernel enforces is caught and surfaced — the public integrity view shows the seal's health without exposing the configuration itself.",
    adr: {
      id: "ADR-121",
      path: "docs/architecture/adr/ADR-121-config-integrity-seal.md",
    },
    pkg: {
      name: "@adjudicate/conformance",
      sourcePath: "packages/conformance/src/config-seal.ts",
    },
    outcomes: ["EXECUTE", "REFUSE"],
    workedExample: { kind: "chart", transparencyHref: "/transparency/integrity" },
    consoleAppearance: {
      surface: "Configuration Integrity aggregation + public integrity view",
      transparencyRoute: "/transparency/integrity",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "policy-coherence-analyzer",
    name: "Policy-coherence analyzer",
    family: "budget-integrity",
    tier: 2,
    oneLiner:
      "Statically analyses a policy bundle for contradictions, dead rules and unreachable outcomes before it ships.",
    whatItDoes:
      "A Tier-3 analyzer inspects a policy bundle as a whole and reports diagnostics: rules that can never fire, outcomes shadowed by an earlier phase, contradictory thresholds. It is a design-time lint for governance — catching an incoherent policy in CI rather than as a production surprise.",
    adr: {
      id: "ADR-125",
      path: "docs/architecture/adr/ADR-125-policy-coherence-analyzer.md",
    },
    pkg: {
      name: "@adjudicate/analyze",
      sourcePath: "packages/analyze/src/tier3.ts",
    },
    outcomes: ["REFUSE", "REWRITE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "Analyze CLI / CI diagnostics (design-time, no console surface)",
    },
    interactivity: "fixture-illustrative",
  },

  // ── Workflow & governance ────────────────────────────────────────────────
  {
    slug: "smart-approval-engine",
    name: "Smart approval engine",
    family: "workflow",
    tier: 2,
    oneLiner:
      "Orchestrates human approvals for ESCALATEd intents — registry, channels and a resolvable decision the kernel can resume on.",
    whatItDoes:
      "When the kernel ESCALATEs, the approval engine parks the request in a registry, routes it to an approval channel, and exposes a resolvable handle. Once a human decides, the original intent resumes through the kernel with the approval recorded — turning ESCALATE from a dead-end into an auditable, resumable human-in-the-loop step.",
    adr: {
      id: "ADR-122",
      path: "docs/architecture/adr/ADR-122-approval-engine.md",
    },
    pkg: {
      name: "@adjudicate/approval-engine",
      sourcePath: "packages/approval-engine/src/engine.ts",
    },
    outcomes: ["ESCALATE", "EXECUTE", "REFUSE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "Approval Center (persisted registry + decision history + audit chain)",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "agent-memory-store",
    name: "Agent memory store",
    family: "workflow",
    tier: 2,
    oneLiner:
      "Cross-session planner context that flows upstream into the prompt only — never into the hash, state or any guard.",
    whatItDoes:
      "A MemoryStore folds past decisions and domain knowledge into the planner's context once per iteration, feeding both plan and prompt. Critically it is upstream-only: memory is type M, distinct from state S, and is never an argument to the envelope, adjudicate or any guard — so given identical (envelope, state, policy) the kernel decision is byte-identical with or without memory. A poisoned memory can at most widen what the model is shown; it cannot move a decision.",
    adr: {
      id: "ADR-126",
      path: "docs/architecture/adr/ADR-126-agent-memory-store.md",
    },
    pkg: {
      name: "@adjudicate/adapter-core",
      sourcePath: "packages/adapter-core/src/persistence.ts",
    },
    outcomes: ["EXECUTE", "REFUSE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "SessionMemoryPanel on the console decision-detail page",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "incident-response-pack",
    name: "Incident-response pack",
    family: "workflow",
    tier: 2,
    oneLiner:
      "A governance pack for AI-driven incident remediation that exercises all six outcomes — clamping blast radius and gating destructive ops.",
    whatItDoes:
      "The pack governs an incident → remediation lifecycle: it DEFERs while a dependent service is down, REWRITEs an untrusted auto-remediation's blast radius down to bounds, ESCALATEs when an operator exceeds the radius threshold, REQUEST_CONFIRMATIONs before destructive remediation, and REFUSEs unknown or already-resolved incidents. A worked lighthouse for the decision algebra in an ops setting.",
    adr: {
      id: "ADR-116",
      path: "docs/architecture/adr/ADR-116-post-v1-extension-discipline.md",
    },
    pkg: {
      name: "@adjudicate/pack-incident-response",
      sourcePath: "packages/pack-incident-response/src/index.ts",
    },
    outcomes: ["DEFER", "REWRITE", "ESCALATE", "REQUEST_CONFIRMATION", "REFUSE", "EXECUTE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "Pack catalogue / Decision Lab (incident-response scenarios)",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "access-governance-pack",
    name: "Access-governance pack",
    family: "workflow",
    tier: 2,
    oneLiner:
      "A governance pack for agent access requests — least-privilege clamps, sensitive-resource escalation and confirmed revokes.",
    whatItDoes:
      "The pack governs an access request → review → grant/revoke lifecycle across all six outcomes: DEFER a request with no resolved review, REWRITE an over-provisioned request down to least privilege, ESCALATE sensitive-resource access to a human reviewer, REQUEST_CONFIRMATION before a destructive revoke, REFUSE unknown resources or rejected reviews. Justification text is PII-classified per the data-classification guard.",
    adr: {
      id: "ADR-116",
      path: "docs/architecture/adr/ADR-116-post-v1-extension-discipline.md",
    },
    pkg: {
      name: "@adjudicate/pack-access-governance",
      sourcePath: "packages/pack-access-governance/src/index.ts",
    },
    outcomes: ["DEFER", "REWRITE", "ESCALATE", "REQUEST_CONFIRMATION", "REFUSE", "EXECUTE"],
    workedExample: { kind: "receipt" },
    consoleAppearance: {
      surface: "Pack catalogue / Decision Lab (access-governance scenarios)",
    },
    interactivity: "fixture-illustrative",
  },
  {
    slug: "release-gating",
    name: "Release-gating extensions",
    family: "workflow",
    tier: 1,
    oneLiner:
      "Deployment-approval gates: clamp production ramp, escalate un-approved or low-eval-score releases, green-region carbon clamp.",
    whatItDoes:
      "The deployments-approval pack adjudicates a release request through layered gates: it REWRITEs a production ramp above the cap down to the maximum, ESCALATEs a production deploy with no recorded approval, ESCALATEs when an AI eval/regression score drops below threshold, and REWRITEs the region to the greenest one within the same data-residency zone (a zone-bounded carbon clamp that never crosses a GDPR boundary). Clean, in-bounds requests EXECUTE.",
    adr: {
      id: "ADR-116",
      path: "docs/architecture/adr/ADR-116-post-v1-extension-discipline.md",
    },
    pkg: {
      name: "@adjudicate/pack-deployments-approval",
      sourcePath: "packages/pack-deployments-approval/src/policies.ts",
    },
    outcomes: ["EXECUTE", "REWRITE", "ESCALATE", "DEFER", "REQUEST_CONFIRMATION"],
    workedExample: {
      kind: "live-kernel",
      intentKind: "deployment.approval.request",
      payload: {
        service: "api",
        environment: "production",
        gitSha: "feedfacefeedface",
        rampPercent: 100,
      },
    },
    consoleAppearance: {
      surface: "Deployments Flow + Decision Lab (deployments-approval presets)",
      replicaRoute: "/console",
    },
    interactivity: "real-kernel",
  },
];
