import {
  CircleCheck,
  UserCheck,
  RotateCcw,
  Clock,
  ArrowUpRight,
  ShieldX,
  type LucideIcon,
} from "lucide-react";

/**
 * SixOutcomes — ACT 3: the decision algebra.
 *
 * Every adjudicated action ends in exactly one of six structured outcomes —
 * not the binary allow/deny of a policy engine. The two that OPA and Cedar
 * cannot express, REWRITE and DEFER, are the load-bearing proof that this is
 * an algebra, not a gate. Each outcome is rendered as a large, color-coded
 * card keyed to its decision token, in the canonical lattice order.
 *
 * Server component — purely presentational, no interactivity.
 */

interface Outcome {
  /** The wire name, shown mono/uppercase in the decision color. */
  readonly name: string;
  /** One-line meaning. */
  readonly meaning: string;
  /** Tailwind classes for the decision color (border / tint / text). */
  readonly border: string;
  readonly tint: string;
  readonly text: string;
  /** Top hairline color, as a raw hex for the rail. */
  readonly rail: string;
  readonly icon: LucideIcon;
  /** Optional badge for the two outcomes policy engines cannot express. */
  readonly exclusive?: boolean;
}

const OUTCOMES: ReadonlyArray<Outcome> = [
  {
    name: "EXECUTE",
    meaning:
      "Authorized — a single-use capability is minted, the action runs once.",
    border: "border-execute/40",
    tint: "bg-execute/10",
    text: "text-execute",
    rail: "#10B981",
    icon: CircleCheck,
  },
  {
    name: "REQUEST_CONFIRMATION",
    meaning: "Held for out-of-band human approval.",
    border: "border-confirm/40",
    tint: "bg-confirm/10",
    text: "text-confirm",
    rail: "#0EA5E9",
    icon: UserCheck,
  },
  {
    name: "REWRITE",
    meaning: "The payload is clamped or sanitized, then re-adjudicated.",
    border: "border-rewrite/40",
    tint: "bg-rewrite/10",
    text: "text-rewrite",
    rail: "#F97316",
    icon: RotateCcw,
    exclusive: true,
  },
  {
    name: "DEFER",
    meaning: "Parked until a real-world signal arrives.",
    border: "border-defer/40",
    tint: "bg-defer/10",
    text: "text-defer",
    rail: "#F59E0B",
    icon: Clock,
    exclusive: true,
  },
  {
    name: "ESCALATE",
    meaning:
      "Routed to a human / the governance plane — where risk can only land.",
    border: "border-escalate/40",
    tint: "bg-escalate/10",
    text: "text-escalate",
    rail: "#8B5CF6",
    icon: ArrowUpRight,
  },
  {
    name: "REFUSE",
    meaning: "Denied — the default, fail-closed.",
    border: "border-refuse/40",
    tint: "bg-refuse/10",
    text: "text-refuse",
    rail: "#EF4444",
    icon: ShieldX,
  },
];

export function SixOutcomes() {
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
            Six outcomes, not two
          </span>

          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Every action ends in one of six.
          </h2>

          <p className="text-base leading-relaxed text-console-muted md:text-lg">
            Not allow/deny. Six structured outcomes — and{" "}
            <span className="text-rewrite">REWRITE</span> and{" "}
            <span className="text-defer">DEFER</span> are the two that policy
            engines like OPA and Cedar cannot express.
          </p>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-console-edge bg-console-edge sm:grid-cols-2 lg:grid-cols-3">
          {OUTCOMES.map((o) => (
            <OutcomeCard key={o.name} outcome={o} />
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] leading-relaxed text-console-faint">
          final = min(deterministic, ceiling) over the lattice · EXECUTE &lt;
          REWRITE &lt; REQUEST_CONFIRMATION &lt; DEFER &lt; ESCALATE &lt; REFUSE ·
          structural, not a per-decision clamp
        </p>
      </div>
    </section>
  );
}

function OutcomeCard({ outcome }: { outcome: Outcome }) {
  const { name, meaning, border, tint, text, rail, icon: Icon, exclusive } =
    outcome;
  return (
    <div className="group relative flex flex-col bg-console-panel p-6 transition-colors duration-300 hover:bg-console-panel/70">
      {/* top hairline rail in the decision color */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, ${rail}, ${rail}33)` }}
      />

      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${border} ${tint} ${text}`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        {exclusive ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-console-faint">
            OPA · Cedar can&apos;t
          </span>
        ) : null}
      </div>

      <div
        className={`mt-5 break-words font-mono text-sm font-semibold uppercase tracking-[0.08em] ${text}`}
      >
        {name}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-console-muted">
        {meaning}
      </p>
    </div>
  );
}
