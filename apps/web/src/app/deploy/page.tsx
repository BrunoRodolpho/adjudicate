import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { EXAMPLES } from "@/content/examples";

export const metadata: Metadata = {
  title: "Deploy · adjudicate",
  description:
    "How to deploy adjudicate — a library that runs in-process, in your request path, before the side-effect. Optional Postgres audit. Self-hosted operator console.",
};

/**
 * Adapted from examples/quickstart-anthropic/src/index.ts. Trimmed to the
 * load-bearing shape: install the Pack, create the adjudicated agent, send.
 * The agent wraps the model call and runs adjudicate() before any side-effect.
 */
const AGENT_SNIPPET = `import { installPack } from "@adjudicate/core";
import { createAdjudicatedAgent } from "@adjudicate/anthropic";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

const { pack } = installPack(paymentsPixPack);

// The agent wraps your model call in-process. Every intent the model
// proposes crosses the kernel — adjudicate() runs BEFORE the executor.
const agent = createAdjudicatedAgent({
  pack,
  anthropicClient,            // your Anthropic SDK client
  model: "claude-opus-4-7",
  executor: createPixExecutor(), // your side-effect, fired only on EXECUTE
});

const result = await agent.send({
  sessionId: "session-1",
  userMessage: "Refund R$ 30,00 from a confirmed charge",
  state,
  context: { customerId: "c-1", merchantId: "m-1" },
});
// result.outcome is one of: completed | deferred | awaiting_confirmation
//                         | escalated | max_iterations_exceeded`;

/** Audit persistence is opt-in: wire a Postgres AuditSink only if you want durability. */
const AUDIT_SNIPPET = `import { createPostgresAuditSink } from "@adjudicate/audit-postgres";

// OPTIONAL. The kernel decides with or without this. Add it only when you
// want a durable governance trail — rows land in the partitioned
// intent_audit table; persistence is deployment-specific, not required to run.
const auditSink = createPostgresAuditSink({ write });`;

export default function DeployPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Deploy"
        title="It runs in your request path, before the side-effect."
        subtitle="Adjudicate is a library, not a service. You install it, wrap your model call, and the kernel decides in-process before any executor fires. There is no proxy to stand up and no extra hop to operate."
      />

      {/* (a) Library / in-process — SHIPPING */}
      <Section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Library / in-process
          </h2>
          <Badge tone="shipped">Shipping</Badge>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
          <code className="font-mono text-sm text-ink">createAdjudicatedAgent</code>{" "}
          from{" "}
          <code className="font-mono text-sm text-ink">@adjudicate/adapter-core</code>{" "}
          wraps your model call in-process and invokes the pure{" "}
          <code className="font-mono text-sm text-ink">adjudicate()</code> kernel
          on every proposed intent — <strong className="text-ink">before</strong>{" "}
          the side-effect runs. The loop never bypasses the kernel: it sits in
          your request path, between what the model wants to do and what your
          system actually does.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card href="https://github.com/anthropics/adjudicate/tree/main/packages/anthropic" external>
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-sm font-medium text-ink">
                @adjudicate/anthropic
              </p>
              <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Anthropic adapter — wraps the Claude SDK loop around the kernel.
            </p>
          </Card>
          <Card href="https://github.com/anthropics/adjudicate/tree/main/packages/openai" external>
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-sm font-medium text-ink">
                @adjudicate/openai
              </p>
              <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              OpenAI adapter — same kernel, same six decisions, different SDK.
            </p>
          </Card>
        </div>

        <CodeBlock
          className="mt-6"
          language="ts"
          filename="agent.ts"
          code={AGENT_SNIPPET}
        />

        <Callout className="mt-6" tone="info" title="One hop, not two.">
          Every primitive runs in-process. There is nothing to deploy alongside
          your app and no network round-trip on the decision path — the kernel
          is a function call inside the request you are already serving.
        </Callout>
      </Section>

      {/* (b) Audit persistence — OPTIONAL */}
      <Section tone="surface">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Audit persistence
          </h2>
          <Badge tone="neutral">Optional</Badge>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
          Each decision produces an{" "}
          <code className="font-mono text-sm text-ink">AuditRecord</code>. You can
          persist it to Postgres via{" "}
          <code className="font-mono text-sm text-ink">@adjudicate/audit-postgres</code>,
          which flattens each record into the partitioned-by-month{" "}
          <code className="font-mono text-sm text-ink">intent_audit</code> table.
          This is opt-in and deployment-specific — the kernel decides identically
          with or without a durable trail, so persistence is never required to
          run.
        </p>

        <CodeBlock
          className="mt-6"
          language="ts"
          filename="audit.ts"
          code={AUDIT_SNIPPET}
        />

        <Callout className="mt-6" tone="warn" title="Bring your own retention.">
          Partitions are created and dropped on your schedule — typically a 7-year
          window for financial intents, 2 years for general transactional audit.
          Adjudicate writes the rows; your migration tooling owns the lifecycle.
        </Callout>
      </Section>

      {/* (c) Operator console */}
      <Section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Operator console
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
          Once you are persisting audit records, the console gives operators a
          live tail of decisions and the reasons behind them.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-ink">Self-host the OSS console</p>
              <Badge tone="shipped">Shipping</Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The open-source console ships in{" "}
              <code className="font-mono text-[13px] text-ink">apps/console</code>.
              Run it against your own Postgres and Redis: it reads the audit
              table over an admin SDK and streams real-time events to a live
              tail. You own the data and the deployment.
            </p>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-ink">Hosted control plane</p>
              <Badge tone="roadmap">Roadmap</Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A managed control plane — multi-tenant dashboards and aggregate
              governance reporting without operating the console yourself — is on
              the roadmap. Today, self-hosting is the shipping path.
            </p>
          </Card>
        </div>
      </Section>

      {/* (d) Examples strip */}
      <Section tone="surface">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Runnable examples
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
          Every snippet above is lifted from code that runs. Clone the repo and
          execute these end-to-end.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {EXAMPLES.map((example) => (
            <Card key={example.slug} href={example.githubHref} external>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{example.title}</p>
                <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {example.description}
              </p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-section text-faint">
                {example.path}
              </p>
            </Card>
          ))}
        </div>
      </Section>
    </main>
  );
}
