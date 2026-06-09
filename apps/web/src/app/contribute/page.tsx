import type { Metadata } from "next";
import { ArrowUpRight, Github, Layers } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
import {
  githubTree,
  GITHUB_REPO,
  GITHUB_CONTRIBUTING,
  GITHUB_GOOD_FIRST_ISSUES,
} from "@/content/github";

const TITLE = "Contribute · adjudicate";
const DESCRIPTION =
  "Contributor onboarding for adjudicate: the five-layer package architecture (L1 kernel → L5 adapters), how to clone, install, test and build, and where a new Pack belongs versus a new primitive. Links to CONTRIBUTING and good-first-issues.";

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
 * The layered package architecture, grounded in README.md "Production maturity"
 * (L1 kernel → L4 adapter-core/observability) plus the adapter packages
 * (L5). Each row names the package(s) and its job so a contributor knows where
 * their change lands before they open the repo.
 */
interface Layer {
  readonly id: string;
  readonly name: string;
  readonly pkg: string;
  readonly path: string;
  readonly tone: "shipped" | "neutral";
  readonly status: string;
  readonly detail: string;
}

const LAYERS: ReadonlyArray<Layer> = [
  {
    id: "L1",
    name: "Kernel",
    pkg: "@adjudicate/core",
    path: "packages/core",
    tone: "shipped",
    status: "Frozen",
    detail:
      "The pure, deterministic decision engine: IntentEnvelope, the six-outcome Decision algebra, PolicyBundle, the taint lattice, replay safety and verifyAuditRecord. API-frozen — contributions here are property tests and invariant hardening, not new surface.",
  },
  {
    id: "L2",
    name: "Risk primitives",
    pkg: "@adjudicate/primitives",
    path: "packages/primitives",
    tone: "neutral",
    status: "Reusable factories",
    detail:
      "Domain-agnostic guard factories the Packs compose — createThresholdGuard, createStateDeferGuard, createSystemTaintPolicy, plus the newer command-risk, token-budget and data-classification guards. A new reusable, business-word-free guard belongs here.",
  },
  {
    id: "L3",
    name: "Domain Packs",
    pkg: "@adjudicate/pack-*",
    path: "packages",
    tone: "neutral",
    status: "Where most contributions go",
    detail:
      "Vertical rulebooks built from L2 primitives: pix, kyc, deployments-approval, incident-response, access-governance. If your guard mentions a business word (payment, deploy, ticket), it lives in a Pack — never in the kernel.",
  },
  {
    id: "L4",
    name: "Adapter core",
    pkg: "@adjudicate/adapter-core",
    path: "packages/adapter-core",
    tone: "shipped",
    status: "Provider-neutral loop",
    detail:
      "The provider-neutral agent loop, the ProviderBridge contract, the decision translator and persistence shims. New provider adapters implement this contract; you rarely change the core itself.",
  },
  {
    id: "L5",
    name: "Provider adapters",
    pkg: "@adjudicate/anthropic · @adjudicate/openai",
    path: "packages/anthropic",
    tone: "neutral",
    status: "< 200-line PR shape",
    detail:
      "Thin SDK shims over L4 that wrap a model's tool-use loop around the kernel. A new adapter (Bedrock, Gemini, Vercel AI) is the smallest contribution shape in the repo — typically under 200 lines.",
  },
];

/** Clone + install + verify — verbatim from CONTRIBUTING.md "Setup". */
const SETUP_SNIPPET = `git clone https://github.com/BrunoRodolpho/adjudicate.git
cd adjudicate
pnpm install
pnpm test

# Requires Node >= 20 and pnpm >= 10`;

/** The everyday commands — from CONTRIBUTING.md "Workflow" + root package.json scripts. */
const WORKFLOW_SNIPPET = `# Iterate on one package in watch mode
pnpm --filter @adjudicate/core test --watch

# Lint a single package
pnpm --filter @adjudicate/core lint

# Build every framework package
pnpm build

# Run the full release-candidate gate before a PR
pnpm rc:check`;

/**
 * "Where does my change go?" — the most common decision a new contributor
 * faces. Grounded in CONTRIBUTING.md "What we're looking for / NOT looking for".
 */
const PLACEMENT: ReadonlyArray<{
  readonly question: string;
  readonly answer: string;
  readonly layer: string;
}> = [
  {
    question: "A guard that mentions a business word",
    answer:
      "Payment, deploy, ticket, balance, appointment — anything domain-specific goes in a Pack (L3) or an example, never in @adjudicate/core. Compose it from L2 primitives.",
    layer: "L3 — Pack",
  },
  {
    question: "A reusable, domain-agnostic guard",
    answer:
      "A new risk primitive with no business word — a generic threshold, taint or rate shape — belongs in @adjudicate/primitives (L2), with a Pack consumer or an evidence link to justify it.",
    layer: "L2 — primitive",
  },
  {
    question: "Support for another LLM provider",
    answer:
      "Implement the ProviderBridge contract from adapter-core (L4) in a thin new adapter (L5). Bedrock, Gemini and browser-side inference are all welcome — keep it under ~200 lines.",
    layer: "L5 — adapter",
  },
  {
    question: "A new invariant or property test",
    answer:
      "Kernel safety lives in packages/core/tests/kernel/invariants. Strengthening the load-bearing invariants is the highest-signal contribution — extend them when you extend behavior.",
    layer: "L1 — kernel tests",
  },
];

export default function ContributePage() {
  return (
    <main>
      <Section>
        <Reveal>
          <DepthHeader
            eyebrow="Contribute"
            title="A small framework with a deliberately narrow surface."
            subtitle="Adjudicate is a layered set of TypeScript packages — a frozen kernel at the centre, reusable primitives around it, domain Packs and provider adapters at the edge. Contributions that strengthen the invariants, broaden the Pack and adapter coverage, or improve the docs are most welcome. Here is the map and the commands."
            backHref="/"
            backLabel="Back to home"
          />
        </Reveal>
      </Section>

      {/* (1) Layered architecture L1-L5 */}
      <Section tone="surface">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <Layers size={20} className="text-ink" aria-hidden="true" />
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              The layered architecture
            </h2>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            Five layers, each with a clear job. The kernel at L1 is pure and
            frozen; everything outward is additive. Knowing which layer your
            change belongs to is the first decision — and the rest of this page
            helps you make it.
          </p>
        </Reveal>

        <Stagger className="mt-8 space-y-3">
          {LAYERS.map((layer) => (
            <StaggerItem key={layer.id}>
              <HoverLift>
                <Card
                  href={githubTree(layer.path)}
                  external
                  className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5"
                >
                  <div className="flex shrink-0 items-center gap-3 sm:w-44">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-canvas font-mono text-sm font-semibold text-ink">
                      {layer.id}
                    </span>
                    <span className="font-semibold text-ink">{layer.name}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-[13px] text-ink">
                        {layer.pkg}
                      </code>
                      <Badge tone={layer.tone}>{layer.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {layer.detail}
                    </p>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="hidden shrink-0 text-faint sm:mt-0.5 sm:block"
                    aria-hidden="true"
                  />
                </Card>
              </HoverLift>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* (2) Get started */}
      <Section>
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Get started
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            It is a pnpm workspace. Clone it, install once, and run the suite to
            confirm a green baseline before you change anything.
          </p>
        </Reveal>

        <Reveal className="mt-6">
          <CodeBlock language="bash" filename="setup" code={SETUP_SNIPPET} />
        </Reveal>

        <Reveal className="mt-8">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            Everyday commands
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            Work one package at a time in watch mode; lint and build per-package;
            then run the full release-candidate gate before opening a PR.
          </p>
        </Reveal>

        <Reveal className="mt-4">
          <CodeBlock
            language="bash"
            filename="workflow"
            code={WORKFLOW_SNIPPET}
          />
        </Reveal>

        <Reveal className="mt-6">
          <Callout tone="info" title="Strict TypeScript is load-bearing.">
            No <code className="font-mono text-[13px] text-ink">any</code>, no{" "}
            <code className="font-mono text-[13px] text-ink">as unknown</code>,
            no widening of the{" "}
            <code className="font-mono text-[13px] text-ink">Decision</code> or{" "}
            <code className="font-mono text-[13px] text-ink">Refusal</code>{" "}
            shapes. New code paths land with new tests, and a kernel type change
            that breaks the SDK fails the whole workspace build — that coupling
            is intentional.
          </Callout>
        </Reveal>
      </Section>

      {/* (3) Where does my change go? */}
      <Section tone="surface">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Where does my change go?
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            The single most useful question to answer before writing code. Match
            your change to a row below to find its home.
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2">
          {PLACEMENT.map((p) => (
            <StaggerItem key={p.question}>
              <Card className="flex h-full flex-col gap-3">
                <Badge tone="neutral">{p.layer}</Badge>
                <p className="font-medium text-ink">{p.question}</p>
                <p className="text-sm leading-relaxed text-muted">{p.answer}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-6">
          <Callout
            tone="warn"
            title="What does not belong in framework packages."
          >
            Domain-specific code in{" "}
            <code className="font-mono text-[13px] text-ink">
              @adjudicate/core
            </code>
            , convenience APIs that bypass{" "}
            <code className="font-mono text-[13px] text-ink">adjudicate()</code>{" "}
            and execute side-effects directly, or any type erosion. The whole
            point is that every state mutation crosses the kernel — helpers that
            skip it defeat the architecture.
          </Callout>
        </Reveal>
      </Section>

      {/* (4) Open a PR / good-first-issue */}
      <Section>
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Open your first PR
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            One concern per PR; every new code path ships with tests; commits
            stay single-purpose. For an architectural change, open a draft PR
            with the design first — an empty README in the new package is fine —
            and discuss the shape before writing the code.
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 sm:grid-cols-3">
          <StaggerItem>
            <HoverLift className="h-full">
              <Card
                href={GITHUB_CONTRIBUTING}
                external
                className="flex h-full flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">CONTRIBUTING.md</p>
                  <ArrowUpRight
                    size={16}
                    className="mt-0.5 shrink-0 text-faint"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  The full guide: setup, workflow, PR guidelines and the
                  schema-drift policy between core and the admin SDK.
                </p>
              </Card>
            </HoverLift>
          </StaggerItem>

          <StaggerItem>
            <HoverLift className="h-full">
              <Card
                href={GITHUB_GOOD_FIRST_ISSUES}
                external
                className="flex h-full flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">Good first issues</p>
                  <ArrowUpRight
                    size={16}
                    className="mt-0.5 shrink-0 text-faint"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  Scoped, well-defined work labelled for newcomers — the fastest
                  way to land your first change.
                </p>
              </Card>
            </HoverLift>
          </StaggerItem>

          <StaggerItem>
            <HoverLift className="h-full">
              <Card
                href={GITHUB_REPO}
                external
                className="flex h-full flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Github size={16} className="text-ink" aria-hidden="true" />
                    <p className="font-medium text-ink">The repository</p>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="mt-0.5 shrink-0 text-faint"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  Browse the source, the per-package READMEs and the ADRs under
                  docs/architecture before you start.
                </p>
              </Card>
            </HoverLift>
          </StaggerItem>
        </Stagger>
      </Section>
    </main>
  );
}
