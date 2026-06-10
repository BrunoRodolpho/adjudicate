import { CodeBlock } from "@/components/ui/CodeBlock";
import { SectionHeading } from "@/components/ui/SectionHeading";

const INSTALL = `pnpm add @adjudicate/core @adjudicate/primitives`;

const DEFINE_GUARD = `import { decisionRefuse, refuse } from "@adjudicate/core";
import type { Guard } from "@adjudicate/core/kernel";

const blockOverspend: Guard<"cart.checkout", { total: number }, unknown> =
  (envelope) => {
    if (envelope.payload.total <= 50_000) return null;
    return decisionRefuse(
      refuse("BUSINESS_RULE", "cart.over_limit", "Cart exceeds R$ 500 cap."),
      [{ category: "business", code: "rule_violated" }],
    );
  };`;

const ADJUDICATE = `import { adjudicate, buildEnvelope } from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "cart.checkout",
  payload: { total: 64_000 },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  nonce: "n-1",
  createdAt: new Date().toISOString(),
});

const decision = adjudicate(envelope, {}, {
  stateGuards: [], authGuards: [],
  taint: { minimumFor: () => "UNTRUSTED" },
  business: [blockOverspend],
  default: "REFUSE",
});

console.log(decision.kind); // "REFUSE"`;

export function GetStarted() {
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Get started"
          title="Three steps to your first decision."
          subtitle="Add the package, define a guard, adjudicate an envelope. No DSL, no policy language — TypeScript end-to-end."
        />

        <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted">
          Adjudicate runs in three lines of setup — install the package, define
          a guard, call <code className="font-mono text-sm text-ink">adjudicate()</code>.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Step n={1} title="Install">
            <CodeBlock code={INSTALL} language="shell" copyable />
          </Step>
          <Step n={2} title="Define a guard">
            <CodeBlock code={DEFINE_GUARD} language="ts" copyable />
          </Step>
          <Step n={3} title="Adjudicate">
            <CodeBlock code={ADJUDICATE} language="ts" copyable />
          </Step>
        </div>
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">
          {n}
        </span>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}
