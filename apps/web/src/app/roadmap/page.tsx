import type { Metadata } from "next";
import { ArrowUpRight, Lock } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
import { SITE } from "@/content/site";
import { githubTree, githubBlob, GITHUB_DOCS } from "@/content/github";

const TITLE = "Roadmap · adjudicate";
const DESCRIPTION =
  "An honest public roadmap. The v1 kernel is shipped and API-frozen; everything after it is disciplined, additive MINOR evolution under SemVer governance — never a moving target. See what recently shipped and what is next.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og-homepage.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-homepage.png"],
  },
};

/**
 * The frozen v1 invariants. Lifted from docs/release/POST_V1_STRATEGY.md §3
 * ("permanently frozen invariants") — the load-bearing contract that does not
 * change inside the v1 line. We name the headline ones, not all fourteen.
 */
const FROZEN_INVARIANTS: ReadonlyArray<{ readonly title: string; readonly detail: string }> = [
  {
    title: "Six-outcome Decision algebra",
    detail:
      "EXECUTE · REFUSE · REWRITE · DEFER · ESCALATE · REQUEST_CONFIRMATION. A closed set — never widened in the v1 line.",
  },
  {
    title: "Deterministic adjudicate()",
    detail:
      "Same envelope, state and policy always yield the same Decision. The determinism guarantee is permanent.",
  },
  {
    title: "intentHash + auditHash recipes",
    detail:
      "RFC 8785 JCS canonicalization over the frozen subset. The hash recipes are fixed so years-old records still replay IDENTICAL.",
  },
  {
    title: "Pure kernel, fail-closed default",
    detail:
      "The kernel never calls your APIs; a throwing guard becomes a SECURITY REFUSE. Side-effects run only on EXECUTE, in your executor.",
  },
];

/**
 * Recently-shipped capabilities — the post-v1 additive MINOR wave grounded in
 * docs/roadmap/release-plan.md §2 (the staged changesets, each tied to an ADR).
 * These are real, published symbols, not promises. `version` is the resulting
 * package version from release-plan §2.1.
 */
interface ShippedItem {
  readonly title: string;
  readonly summary: string;
  readonly pkg: string;
  readonly version: string;
  readonly adr: string;
  readonly path: string;
}

const SHIPPED: ReadonlyArray<ShippedItem> = [
  {
    title: "Command-risk guard",
    summary:
      "createCommandRiskGuard classifies and blocks dangerous shell-style commands — REFUSE, flag-strip, or sanitize — with new validation.COMMAND_* basis codes.",
    pkg: "@adjudicate/primitives",
    version: "0.3.0",
    adr: "ADR-123",
    path: "packages/primitives",
  },
  {
    title: "PII / data-classification guard",
    summary:
      "createDataClassificationGuard redacts PII/PHI before a side-effect runs, surfaced as aggregate governance.piiClassificationStats.",
    pkg: "@adjudicate/primitives",
    version: "0.3.0",
    adr: "ADR-117",
    path: "packages/primitives",
  },
  {
    title: "Token-budget guard",
    summary:
      "createTokenBudgetGuard plus AssistantTurn.usage and onTokenUsage thread real provider token usage into the decision path, fail-closed when over budget.",
    pkg: "@adjudicate/adapter-core",
    version: "0.3.0",
    adr: "ADR-120",
    path: "packages/adapter-core",
  },
  {
    title: "Behavioral-drift detection",
    summary:
      "New @adjudicate/drift — TVD, new-category and proportion-spike detection over the audit stream, exposed as governance.behavioralDrift.",
    pkg: "@adjudicate/drift",
    version: "0.2.0",
    adr: "ADR-119",
    path: "packages/drift",
  },
  {
    title: "Deterministic red-team",
    summary:
      "New @adjudicate/red-team — reproducible adversarial generation and an adjudicate red-team CLI, reported through governance.redTeam.",
    pkg: "@adjudicate/red-team",
    version: "0.2.0",
    adr: "ADR-118",
    path: "packages/red-team",
  },
  {
    title: "Human-approval engine",
    summary:
      "New @adjudicate/approval-engine — replay-safe orchestration of REQUEST_CONFIRMATION flows with approval.list / approval.resolve.",
    pkg: "@adjudicate/approval-engine",
    version: "0.2.0",
    adr: "ADR-122",
    path: "packages/approval-engine",
  },
  {
    title: "AI bill-of-materials",
    summary:
      "generateAiBom builds an EU AI Act / NIST RMF-aligned BOM per Pack, with an adjudicate pack bom command and pack.aiBom read surface.",
    pkg: "@adjudicate/conformance",
    version: "1.1.0",
    adr: "ADR-127",
    path: "packages/conformance",
  },
  {
    title: "Config-integrity seals",
    summary:
      "sealPackConfig / verifyConfigSeal add a tamper-evident config-seal gate and kill.SEAL_MISMATCH, surfaced as governance.configSealStatus.",
    pkg: "@adjudicate/conformance",
    version: "1.1.0",
    adr: "ADR-121",
    path: "packages/conformance",
  },
  {
    title: "Two new domain Packs (stable)",
    summary:
      "pack-incident-response and pack-access-governance graduate from -experimental to a stable 0.2.0, exercising all six outcomes through L2 primitives.",
    pkg: "@adjudicate/pack-access-governance",
    version: "0.2.0",
    adr: "Items 9/10",
    path: "packages/pack-access-governance",
  },
];

/**
 * What's next — the WS3 web-parity surfaces from docs/roadmap/release-plan.md §3.
 * These are additive history/timeline/list procedures that join the same MINOR
 * wave. Honest framing: planned + additive, never a v1-breaking change.
 */
const NEXT: ReadonlyArray<{ readonly title: string; readonly detail: string }> = [
  {
    title: "Command-risk & token-governance aggregates",
    detail:
      "governance.commandRisk and per-tenant token-usage telemetry (TokenUsageStore) — public, aggregates-only transparency views over the existing guards.",
  },
  {
    title: "Drift & red-team history",
    detail:
      "governance.driftHistory and governance.redTeamHistory add bounded, deterministic time-series on top of the single-shot snapshots that ship today.",
  },
  {
    title: "Kill-switch timeline & multi-pack AI-BOM",
    detail:
      "governance.killSwitchTimeline and pack.aiBomList surface configuration-integrity history and multi-pack bill-of-materials as read-only procedures.",
  },
  {
    title: "Approval Center real-resolve wiring",
    detail:
      "approval.history / approval.chain plus strict replay-safe resume turn the console's display-only projection into a real, operator-only resolve path.",
  },
];

/**
 * Discipline principles — the governance model that makes this roadmap honest.
 * Grounded in docs/release/POST_V1_STRATEGY.md §7 and §9.
 */
const DISCIPLINE: ReadonlyArray<{ readonly title: string; readonly detail: string }> = [
  {
    title: "Evidence, not editorial taste",
    detail:
      "Additions come from adopter incident reports, usage telemetry and Pack-author feedback. Marketing wish-lists do not justify surface growth.",
  },
  {
    title: "Every symbol pays its way",
    detail:
      "No new primitive without a Pack consumer or an evidence link; no PR without a CHANGELOG entry and a freeze-matrix row. The matrix is the contract.",
  },
  {
    title: "Additive only — the freeze holds",
    detail:
      "Every wave is MINOR: no closed-enum widening, no wire-format or hash-recipe change. A coordinated MAJOR is re-evaluated only at a v2 cut.",
  },
];

export default function RoadmapPage() {
  return (
    <main>
      <Section tone="console">
        <Reveal>
          <DepthHeader
            eyebrow="Roadmap"
            title="Shipped, frozen, and evolving on discipline — not hype."
            subtitle="The v1 kernel is done. Its API is frozen and tracked in a public freeze matrix. Everything after it is additive MINOR evolution under SemVer governance, driven by adopter evidence. This page is the honest state of that line — what is locked, what recently shipped, and what is next."
            backHref="/"
            backLabel="Back to home"
          />
        </Reveal>

        <Reveal className="mt-10">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="shipped">
              {SITE.name} core {SITE.coreVersion}
            </Badge>
            <Badge tone="neutral">{SITE.status}</Badge>
          </div>
        </Reveal>
      </Section>

      {/* (1) v1 shipped & frozen */}
      <Section tone="surface">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
              v1 — shipped &amp; frozen
            </h2>
            <Badge tone="shipped">Frozen</Badge>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
            The kernel{" "}
            <code className="font-mono text-sm text-console-ink">@adjudicate/core</code>{" "}
            is at{" "}
            <code className="font-mono text-sm text-console-ink">{SITE.coreVersion}</code>{" "}
            and production-grade. Its public API is frozen for the life of the v1
            line: the load-bearing invariants below never change. That is the
            point — adopters wire the kernel into their request path once and
            trust it not to move under them.
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2">
          {FROZEN_INVARIANTS.map((inv) => (
            <StaggerItem key={inv.title}>
              <Card className="flex h-full gap-3">
                <Lock
                  size={18}
                  className="mt-0.5 shrink-0 text-execute"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-console-ink">{inv.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-console-muted">
                    {inv.detail}
                  </p>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-6">
          <Callout tone="info" title="The freeze is auditable, not a promise.">
            Every public export is classified in{" "}
            <code className="font-mono text-[13px] text-console-ink">
              docs/release/V1_FREEZE_MATRIX.md
            </code>
            , and a CI check compares it against each package&rsquo;s exports.
            See the{" "}
            <a
              href={githubBlob("docs/release/V1_FREEZE_MATRIX.md")}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              freeze matrix
            </a>{" "}
            and the{" "}
            <a
              href={githubBlob("docs/release/SEMVER_GOVERNANCE.md")}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              SemVer governance
            </a>{" "}
            doc for the full contract.
          </Callout>
        </Reveal>
      </Section>

      {/* (2) The disciplined-evolution model */}
      <Section tone="console">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
            After v1 — disciplined, additive evolution
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
            The framework is a governance substrate, not a product that needs to
            grow. Its job is to stay deterministic, replayable and auditable for
            years. So evolution happens in coordinated{" "}
            <strong className="text-console-ink">MINOR waves</strong> under three rules:
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 md:grid-cols-3">
          {DISCIPLINE.map((d) => (
            <StaggerItem key={d.title}>
              <HoverLift className="h-full">
                <Card className="h-full">
                  <p className="font-medium text-console-ink">{d.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-console-muted">
                    {d.detail}
                  </p>
                </Card>
              </HoverLift>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* (3) Recently shipped — the post-v1 MINOR wave */}
      <Section tone="surface">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
              Recently shipped
            </h2>
            <Badge tone="shipped">MINOR wave</Badge>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
            The most recent post-v1 wave is additive across the board — new
            guards, two governance packages, and two domain Packs graduating to
            stable. Each lands with an ADR and a changeset; the kernel API is
            untouched, so the v1 freeze holds.
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHIPPED.map((item) => (
            <StaggerItem key={item.title}>
              <HoverLift className="h-full">
                <Card
                  href={githubTree(item.path)}
                  external
                  className="flex h-full flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-console-ink">{item.title}</p>
                    <ArrowUpRight
                      size={16}
                      className="mt-0.5 shrink-0 text-console-faint"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-console-muted">
                    {item.summary}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone="neutral">
                      {item.pkg} {item.version}
                    </Badge>
                    <Badge tone="adr">{item.adr}</Badge>
                  </div>
                </Card>
              </HoverLift>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* (4) What's next — planned, additive */}
      <Section tone="console">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
              What&rsquo;s next
            </h2>
            <Badge tone="roadmap">Planned · additive</Badge>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
            The next surfaces are web-parity read seams: history, timeline and
            list procedures layered on top of capabilities that already ship.
            They join the same combined MINOR wave — additive procedures and
            schemas, no breaking change. Sequencing and scope live in the public
            roadmap docs; we list direction here, not dates.
          </p>
        </Reveal>

        <Stagger
          as="ol"
          className="mt-8 space-y-4 border-l border-console-edge pl-6"
        >
          {NEXT.map((item, i) => (
            <StaggerItem as="li" key={item.title} className="relative">
              <span
                className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-defer/50 bg-defer/10 text-[9px] font-semibold text-defer"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <p className="font-medium text-console-ink">{item.title}</p>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-console-muted">
                {item.detail}
              </p>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-8">
          <Callout tone="warn" title="What we explicitly will not build.">
            No hosted control plane, no Pack marketplace, no signing CA, no
            YAML/JSON Pack DSL, no phone-home telemetry. These centralise trust
            or erode determinism, so they stay out of scope. Adopters who want a
            hosted dashboard self-host the open-source console. The full
            out-of-scope list lives in the post-v1 strategy.
          </Callout>
        </Reveal>

        <Reveal className="mt-8">
          <div className="flex flex-wrap gap-3">
            <a
              href={githubTree("docs/roadmap")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              Roadmap docs
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a
              href={githubBlob("docs/release/POST_V1_STRATEGY.md")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              Post-v1 strategy
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a
              href={SITE.releaseNotesHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              Release notes
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a
              href={GITHUB_DOCS}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-console-ink underline decoration-console-edge underline-offset-4 hover:decoration-console-ink"
            >
              All docs
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </Section>
    </main>
  );
}
