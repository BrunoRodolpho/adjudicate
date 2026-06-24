import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { EXAMPLES } from "@/content/examples";
import { githubTree } from "@/content/github";

export const metadata: Metadata = {
  title: "Deploy · adjudicate",
  description:
    "How to deploy adjudicate — a library that runs in-process, in your request path, before the side-effect. Optional Postgres audit. Self-hosted operator console.",
  openGraph: {
    title: "Deploy · adjudicate",
    description:
      "How to deploy adjudicate — a library that runs in-process, in your request path, before the side-effect. Optional Postgres audit. Self-hosted operator console.",
    type: "website",
    images: [{ url: "/og-deploy.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-deploy.png"],
  },
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

/**
 * A representative intent_audit row for a DEFER outcome — the shape that lands
 * in the partitioned table when the kernel parks an intent on an external
 * signal. Illustrative sample data: hashes are fabricated and no raw payload,
 * command text, or PII is shown — only the governance fields a row carries.
 */
const AUDIT_ROW_SNIPPET = `// Illustrative sample row — intent_audit (partitioned by month).
{
  "intentHash": "9f4c1ad7…c4f2",   // dedup key — same intent, same hash
  "decision":   "DEFER",
  "recordedAt": "2026-06-08T14:02:11Z",
  "auditHash":  "a31e…",            // tamper-evident over the whole record
  "metadata": {
    "reason":  "awaiting_payment_confirmation",
    "signal":  "payment.confirmed",
    "timeoutMs": 900000             // re-evaluate if the signal never arrives
  }
}`;

export default function DeployPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Deploy"
        title="It runs in your request path, before the side-effect."
        subtitle="Adjudicate is a library, not a service. You install it, wrap your model call, and the kernel decides in-process before any executor fires. There is no proxy to stand up and no extra hop to operate."
      />

      {/* (a) Library / in-process — SHIPPING */}
      <Section tone="console">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
            Library / in-process
          </h2>
          <Badge tone="shipped">Shipping</Badge>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
          <code className="font-mono text-sm text-console-ink">createAdjudicatedAgent</code>{" "}
          from{" "}
          <code className="font-mono text-sm text-console-ink">@adjudicate/adapter-core</code>{" "}
          wraps your model call in-process and invokes the pure{" "}
          <code className="font-mono text-sm text-console-ink">adjudicate()</code> kernel
          on every proposed intent — <strong className="text-console-ink">before</strong>{" "}
          the side-effect runs. The loop never bypasses the kernel: it sits in
          your request path, between what the model wants to do and what your
          system actually does.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card href={githubTree("packages/anthropic")} external>
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-sm font-medium text-console-ink">
                @adjudicate/anthropic
              </p>
              <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-console-faint" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-console-muted">
              Anthropic adapter — wraps the Claude SDK loop around the kernel.
            </p>
          </Card>
          <Card href={githubTree("packages/openai")} external>
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-sm font-medium text-console-ink">
                @adjudicate/openai
              </p>
              <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-console-faint" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-console-muted">
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
      <Section tone="console">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
            Audit persistence
          </h2>
          <Badge tone="neutral">Optional</Badge>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
          Each decision produces an{" "}
          <code className="font-mono text-sm text-console-ink">AuditRecord</code>. You can
          persist it to Postgres via{" "}
          <code className="font-mono text-sm text-console-ink">@adjudicate/audit-postgres</code>,
          which flattens each record into the partitioned-by-month{" "}
          <code className="font-mono text-sm text-console-ink">intent_audit</code> table.
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

        <p className="mt-8 max-w-3xl text-base leading-relaxed text-console-muted">
          To make the trail concrete: when the kernel{" "}
          <strong className="text-console-ink">DEFERs</strong> an intent — parking it
          until an external signal arrives — here is the kind of row that lands
          in <code className="font-mono text-sm text-console-ink">intent_audit</code>.
          The <code className="font-mono text-sm text-console-ink">metadata</code> jsonb
          column carries the why (the awaited signal and its timeout); no raw
          payload or command text is ever stored in these illustrative fields.
        </p>

        <CodeBlock
          className="mt-4"
          language="json"
          filename="intent_audit · sample row (DEFER)"
          code={AUDIT_ROW_SNIPPET}
        />

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-console-muted">
          That same row is what an operator reads end-to-end in the{" "}
          <a
            href="#operator-console"
            className="font-medium text-console-ink underline decoration-console-edge underline-offset-2 hover:decoration-console-ink"
          >
            operator console
          </a>{" "}
          — from the durable mirror, and live over the bus.
        </p>

        <Callout className="mt-6" tone="warn" title="Bring your own retention.">
          Partitions are created and dropped on your schedule — typically a 7-year
          window for financial intents, 2 years for general transactional audit.
          Adjudicate writes the rows; your migration tooling owns the lifecycle.
        </Callout>
      </Section>

      {/* (c) Operator console */}
      <Section id="operator-console" tone="console">
        <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
          Operator console
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
          Once you are persisting audit records, the console gives operators a
          live tail of decisions and the reasons behind them.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-console-ink">Self-host the OSS console</p>
              <Badge tone="shipped">Shipping</Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-console-muted">
              The open-source console ships in{" "}
              <code className="font-mono text-[13px] text-console-ink">apps/console</code>.
              Run it against your own Postgres and Redis: it reads the audit
              table over an admin SDK and streams real-time events to a live
              tail. You own the data and the deployment.
            </p>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-console-ink">Hosted control plane</p>
              <Badge tone="roadmap">Roadmap</Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-console-muted">
              A managed control plane — multi-tenant dashboards and aggregate
              governance reporting without operating the console yourself — is on
              the roadmap. Today, self-hosting is the shipping path.
            </p>
          </Card>
        </div>
      </Section>

      {/* (d) Examples strip */}
      <Section tone="console">
        <h2 className="text-2xl font-semibold tracking-tight text-console-ink">
          Runnable examples
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-console-muted">
          Every snippet above is lifted from code that runs. Clone the repo and
          execute these end-to-end.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {EXAMPLES.map((example) => (
            <Card key={example.slug} href={example.githubHref} external>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-console-ink">{example.title}</p>
                <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-console-faint" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-console-muted">
                {example.description}
              </p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-section text-console-muted">
                {example.path}
              </p>
            </Card>
          ))}
        </div>
      </Section>
    </main>
  );
}
