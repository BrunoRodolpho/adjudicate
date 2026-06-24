import {
  Banknote,
  Fingerprint,
  Headphones,
  Bot,
  type LucideIcon,
} from "lucide-react";

/**
 * UseCases — organized by authority, not by industry.
 *
 * The kernel doesn't care what vertical you're in; it cares whether an agent is
 * about to move something real. This grid names four domains where that happens
 * — and, for each, three concrete actions that pass through the same six guards
 * to the same six outcomes. Each domain is keyed to one of the load-bearing
 * decision colors purely as a scannable accent (a low-alpha tint on the icon
 * and a hairline rail); the chips are the actual intent kinds, in mono.
 *
 * Server component — purely presentational, no interactivity.
 */

interface Domain {
  /** Domain title, in console ink. */
  readonly title: string;
  /** One-line framing of what the kernel adjudicates here. */
  readonly blurb: string;
  /** Three example actions, shown as mono chips. */
  readonly actions: readonly [string, string, string];
  readonly icon: LucideIcon;
  /** Decision-color classes for the icon chip (border / tint / text). */
  readonly border: string;
  readonly tint: string;
  readonly text: string;
  /** Top hairline rail color, as a raw hex. */
  readonly rail: string;
}

const DOMAINS: ReadonlyArray<Domain> = [
  {
    title: "Financial Operations",
    blurb:
      "Money in motion — every transfer gated by ownership and a single-use, budgeted capability.",
    actions: ["payments", "treasury", "transfers"],
    icon: Banknote,
    border: "border-execute/40",
    tint: "bg-execute/10",
    text: "text-execute",
    rail: "#10B981",
  },
  {
    title: "Identity",
    blurb:
      "Who someone is and what they may reach — the owner predicate closing the IDOR seam.",
    actions: ["KYC", "access", "verification"],
    icon: Fingerprint,
    border: "border-confirm/40",
    tint: "bg-confirm/10",
    text: "text-confirm",
    rail: "#0EA5E9",
  },
  {
    title: "Customer Operations",
    blurb:
      "High-volume judgment calls — clamped to limits, or escalated when they exceed them.",
    actions: ["refunds", "credits", "approvals"],
    icon: Headphones,
    border: "border-rewrite/40",
    tint: "bg-rewrite/10",
    text: "text-rewrite",
    rail: "#F97316",
  },
  {
    title: "Autonomous Agents",
    blurb:
      "Tool calls the LLM proposes and the kernel decides — provenance-tracked, fail-closed.",
    actions: ["tool use", "workflows", "orchestration"],
    icon: Bot,
    border: "border-escalate/40",
    tint: "bg-escalate/10",
    text: "text-escalate",
    rail: "#8B5CF6",
  },
];

export function UseCases() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* one restrained constitutional glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-8%] h-[420px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.12), rgba(99,102,241,0.03), transparent)",
          filter: "blur(36px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Organized by authority
          </span>

          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Wherever an agent can move something real.
          </h2>

          <p className="text-base leading-relaxed text-console-muted md:text-lg">
            The kernel is indifferent to your vertical — it adjudicates any
            intent that touches the real world. Four domains, one decision point.
          </p>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-console-edge bg-console-edge sm:grid-cols-2 lg:grid-cols-4">
          {DOMAINS.map((d) => (
            <DomainCard key={d.title} domain={d} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DomainCard({ domain }: { domain: Domain }) {
  const { title, blurb, actions, icon: Icon, border, tint, text, rail } =
    domain;
  return (
    <div className="group relative flex flex-col bg-console-panel p-6 transition-colors duration-300 hover:bg-console-panel/70">
      {/* top hairline rail in the decision color */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, ${rail}, ${rail}33)` }}
      />

      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${border} ${tint} ${text}`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>

      <h3 className="mt-5 text-base font-semibold tracking-tight text-console-ink">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-console-muted">{blurb}</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <span
            key={action}
            className="rounded border border-console-edge bg-console-canvas px-2 py-0.5 font-mono text-[11px] text-console-muted"
          >
            {action}
          </span>
        ))}
      </div>
    </div>
  );
}
