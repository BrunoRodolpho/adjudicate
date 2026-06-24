import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { GUARD_KIND_INFO } from "@/lib/guard-colors";

/**
 * GuardMetadataPrimer — the plain-English on-ramp for /introspection (AUDIT P1).
 *
 * A visitor landing here from search or a share link may have never seen the
 * homepage and has no idea what "GuardMetadata" or "ADR-105" mean. Before the
 * radial graph (which is dense and assumes the vocabulary), this section
 * answers three questions in order: *what is it*, *why does it matter*, and
 * *what are the five description kinds*. It closes the loop with one concrete
 * threshold example so the abstraction lands.
 *
 * The five-kind list is sourced from the same `GUARD_KIND_INFO` table the graph
 * legend uses, so the copy can never drift from the canonical vocabulary.
 * Server component for the copy; motion is the reduced-motion-safe Reveal /
 * Stagger wrappers (static under `prefers-reduced-motion`).
 */

/** The five canonical description kinds, in the legend's order. */
const KIND_ORDER = [
  "threshold",
  "state_defer",
  "system_taint",
  "rewrite",
  "opaque",
] as const;

export function GuardMetadataPrimer() {
  return (
    <Section tone="console" className="pt-12">
      <Reveal className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-section text-console-muted">
          Start here
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-console-ink md:text-3xl">
          What GuardMetadata is, and why it matters.
        </h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-console-muted">
          <p>
            A <strong className="text-console-ink">guard</strong> is one rule in your
            policy — a function that inspects a proposed AI action and votes on
            what should happen to it.{" "}
            <strong className="text-console-ink">GuardMetadata</strong> is an optional
            layer of structured labels attached to that rule: its name, who
            authored it, when it landed, and — most importantly — a typed{" "}
            <em>description</em> of what it actually does.
          </p>
          <p>
            That description is what turns a policy from a black box into
            something tooling can <strong className="text-console-ink">read</strong>.
            An auditor, an analyzer, or the operator console can introspect your
            policy programmatically — &ldquo;which rules cap amounts? which ones
            defer on an external signal? which can rewrite the request?&rdquo; —
            instead of reverse-engineering behaviour from logs after the fact.
            You learn what governs an action <em>before</em> it runs, not from
            the wreckage afterwards.
          </p>
        </div>
      </Reveal>

      {/* The five description kinds — sourced from the canonical legend table. */}
      <Stagger className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KIND_ORDER.map((kind) => {
          const info = GUARD_KIND_INFO[kind]!;
          return (
            <StaggerItem
              key={kind}
              className="rounded-xl border border-console-edge bg-console-panel p-4"
            >
              <code className="text-sm font-semibold text-console-ink">{kind}</code>
              <p className="mt-1.5 text-sm leading-relaxed text-console-muted">
                {info.oneLiner}
              </p>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* One concrete worked example to anchor the abstraction. */}
      <Reveal className="mt-6 max-w-3xl rounded-xl border border-defer/40 bg-defer/5 p-5">
        <p className="text-sm font-semibold text-console-ink">
          A worked example: a <code className="font-mono">threshold</code> guard.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-console-muted">
          Say a rule allows a refund only when the amount is under a cap. Its
          metadata tags it as a <code className="font-mono text-console-ink">threshold</code>{" "}
          kind and records the cap value and the reason it exists. An analyzer
          can now answer &ldquo;what is the largest refund this policy permits
          without escalation?&rdquo; by reading the metadata alone — no test run,
          no log mining. That is the difference between a policy you can{" "}
          <em>describe</em> and one you can only <em>observe</em>.
        </p>
      </Reveal>
    </Section>
  );
}
