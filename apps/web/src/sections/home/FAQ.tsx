import { Plus } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";
import { SITE } from "@/content/site";

/**
 * FAQ — homepage band of accurate, frequently-asked questions about the kernel.
 *
 * Server component, zero client JS: each Q&A is a native <details>/<summary>
 * disclosure, so it's keyboard- and screen-reader-accessible out of the box and
 * works without hydration. The chevron rotation is a pure CSS affordance keyed
 * off the [open] attribute (transform-only, so it's reduced-motion-safe).
 *
 * The same Q&A array also drives a schema.org FAQPage JSON-LD block, emitted as
 * a <script type="application/ld+json">. Structured data and visible copy are
 * built from ONE source (FAQ_ITEMS) so they can never drift — which is what
 * search engines and LLM answer-extractors reward. Answers are plain-text in the
 * JSON-LD (schema.org `acceptedAnswer.text` expects text/HTML, not React).
 *
 * Every answer is grounded: kernel @adjudicate/core is v1.x, published to npm &
 * API-stable (additive-only); the
 * six outcomes are real; the kernel is pure (it never calls adopter APIs or the
 * database — only the adopter's executor runs side-effects, and only on EXECUTE);
 * Postgres persistence is optional; install is real npm; adapters cover Anthropic
 * and OpenAI; the audit receipt is a hash-chained AuditRecord with an optional
 * signature; guards are plain TypeScript (no policy DSL).
 */
type FaqItem = {
  readonly question: string;
  /** Plain-text answer — used verbatim for both the visible copy and JSON-LD. */
  readonly answer: string;
};

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Is adjudicate production-ready?",
    answer:
      `Yes. The kernel @adjudicate/core is at ${SITE.versionLabel} (${SITE.coreVersion}), published to npm with an API-stable, additive-only public surface, so upgrades within ${SITE.versionLabel} won't break your guards. It's a small, dependency-light, deterministic core designed to sit on the hot path of real agent traffic.`,
  },
  {
    question: "How is it different from OPA, Cedar or other policy engines?",
    answer:
      "Those engines answer a binary question — allow or deny. adjudicate adjudicates each AI action to one of six outcomes: EXECUTE, REFUSE, REWRITE, DEFER, ESCALATE, or REQUEST_CONFIRMATION. That means it can clamp an over-large refund (rewrite), hold an action for a window (defer), route to a human (escalate), or ask the user to confirm — not just block or allow. It's built specifically for LLM tool-calls, not generic request authorization.",
  },
  {
    question: "Does adjudicate call my APIs or touch my database?",
    answer:
      "No. The kernel is pure: given an action and your guards, it returns a decision and an audit record. It never reaches out to your services, your model providers, or your database. Your own executor runs side-effects, and only when the decision is EXECUTE. Persisting audit records to Postgres is optional — the kernel produces the record either way; storing it is your choice.",
  },
  {
    question: "How do I install it?",
    answer:
      "It's published on the public npm registry. Install the kernel with `pnpm add @adjudicate/core` (or your package manager's equivalent), then add provider adapters as needed. There's no account, service, or hosted control plane to sign up for — it's a library you run inside your own process.",
  },
  {
    question: "Which models does it work with?",
    answer:
      "It's provider-neutral. The kernel reasons about actions, not prompts, so it doesn't care which model produced a tool-call. First-party adapters cover Anthropic (@adjudicate/anthropic) and OpenAI (@adjudicate/openai) to map their tool-call shapes into adjudicate actions, and you can wire up any other provider yourself.",
  },
  {
    question: "Is the audit trail tamper-proof?",
    answer:
      "Every decision yields an AuditRecord carrying an auditHash that chains over the record's contents, so any after-the-fact edit is detectable — the chain stops verifying. You can additionally attach a cryptographic signature for stronger, independently verifiable provenance. The result is a tamper-evident receipt for every adjudicated action.",
  },
  {
    question: "Do I need to learn a policy DSL?",
    answer:
      "No. Guards are plain TypeScript functions — no custom policy language, no YAML rule files, no separate evaluator to learn. You get full type-safety, your editor's autocomplete, and the option to unit-test guards like any other code.",
  },
];

/**
 * schema.org FAQPage built from the SAME FAQ_ITEMS so structured data and
 * visible content stay in lock-step.
 */
const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export function FAQ() {
  return (
    <Section tone="surface" id="faq">
      <SectionHeading
        eyebrow="FAQ"
        title="Questions, answered straight"
        subtitle="The honest version — what adjudicate is, what it isn't, and how it sits in your stack."
        align="center"
      />

      <div className="mx-auto mt-12 max-w-3xl divide-y divide-edge rounded-2xl border border-edge bg-canvas">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group px-5 sm:px-6">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between gap-4 py-5",
                "text-left text-base font-semibold text-ink",
                "transition-colors hover:text-ink/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                "[&::-webkit-details-marker]:hidden",
              )}
            >
              <span>{item.question}</span>
              <Plus
                size={18}
                aria-hidden="true"
                className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
              />
            </summary>
            <p className="pb-5 pr-8 text-sm leading-relaxed text-muted">
              {item.answer}
            </p>
          </details>
        ))}
      </div>

      <script
        type="application/ld+json"
        // Structured data must be raw JSON in a script tag; built from FAQ_ITEMS
        // above so it always mirrors the visible Q&A.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
    </Section>
  );
}
