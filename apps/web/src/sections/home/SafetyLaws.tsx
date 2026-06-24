import { ArrowDown, ArrowRight } from "lucide-react";

/**
 * SafetyLaws — ACT 3 of the dark marketing homepage.
 *
 * The two laws that make probabilistic systems safe to deploy against the real
 * world. LEFT: "Risk never authorizes" — a probabilistic signal may influence a
 * decision but can never make one; the kernel always decides. RIGHT: "Monotonic
 * safety" — over the lattice EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER <
 * ESCALATE < REFUSE, every uncertain signal can only move the decision toward
 * MORE friction, never less. final = min(deterministic, ceiling); any failure
 * routes to friction, never to execute.
 *
 * Server component. The page wraps each section in <Reveal>, so no scroll-reveal
 * or background is set here.
 */

/** One step of the friction lattice, least friction (top) → most (bottom). */
interface Rung {
  readonly label: string;
  /** decision-color token suffix (execute/rewrite/confirm/defer/escalate/refuse). */
  readonly tone: string;
  readonly hex: string;
}

const LATTICE: ReadonlyArray<Rung> = [
  { label: "EXECUTE", tone: "execute", hex: "#10B981" },
  { label: "REWRITE", tone: "rewrite", hex: "#F97316" },
  { label: "REQUEST_CONFIRMATION", tone: "confirm", hex: "#0EA5E9" },
  { label: "DEFER", tone: "defer", hex: "#F59E0B" },
  { label: "ESCALATE", tone: "escalate", hex: "#8B5CF6" },
  { label: "REFUSE", tone: "refuse", hex: "#EF4444" },
];

export function SafetyLaws() {
  return (
    <section className="relative py-20 md:py-28">
      {/* one restrained constitutional glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[6%] h-[420px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(139,92,246,0.12), rgba(139,92,246,0.03), transparent)",
          filter: "blur(36px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-escalate" />
            The safety laws
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            New information can reduce authority —{" "}
            <span className="text-console-faint">never create it.</span>
          </h2>
          <p className="text-base leading-relaxed text-console-muted md:text-lg">
            Two invariants make probabilistic systems safe to point at reality.
            Risk is advisory, and friction only ever increases.
          </p>
        </header>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-console-edge bg-console-edge md:mt-14 md:grid-cols-2">
          <RiskNeverAuthorizes />
          <MonotonicSafety />
        </div>
      </div>
    </section>
  );
}

/* ── LEFT: Risk never authorizes ─────────────────────────────────────────── */

function RiskNeverAuthorizes() {
  return (
    <div className="flex flex-col gap-5 bg-console-panel p-6">
      <PanelHead
        tone="escalate"
        index="law 01"
        title="Risk never authorizes"
      />

      <FlowCard
        label="Traditional"
        muted
        steps={[
          { text: "risk engine", tone: "muted" },
          { text: "approve", tone: "muted" },
        ]}
        note="the model's score is the verdict"
      />

      <FlowCard
        label="Adjudicate"
        steps={[
          { text: "risk engine", tone: "muted" },
          { text: "signal", tone: "escalate" },
          { text: "kernel decides", tone: "ink" },
        ]}
        note="the score is one input; the kernel rules"
      />

      <p className="mt-1 border-l border-escalate/40 pl-3 text-sm leading-relaxed text-console-muted">
        Probabilistic systems may{" "}
        <span className="text-console-ink">influence</span> a decision. They
        never <span className="text-console-ink">make</span> one.
      </p>
    </div>
  );
}

/** A horizontal mono flow: token -> token -> token. */
function FlowCard({
  label,
  steps,
  note,
  muted = false,
}: {
  label: string;
  steps: ReadonlyArray<{ text: string; tone: "muted" | "ink" | "escalate" }>;
  note: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-console-edge bg-console-canvas p-4 ${
        muted ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">
          {label}
        </span>
        {!muted ? (
          <span className="rounded border border-escalate/40 bg-escalate/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-escalate">
            escalate-only
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        {steps.map((s, i) => (
          <span key={s.text} className="flex items-center gap-2">
            <FlowToken text={s.text} tone={s.tone} />
            {i < steps.length - 1 ? (
              <ArrowRight
                size={14}
                aria-hidden="true"
                className="shrink-0 text-console-faint"
              />
            ) : null}
          </span>
        ))}
      </div>

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-console-faint">
        {note}
      </p>
    </div>
  );
}

function FlowToken({
  text,
  tone,
}: {
  text: string;
  tone: "muted" | "ink" | "escalate";
}) {
  const cls =
    tone === "escalate"
      ? "border-escalate/40 bg-escalate/10 text-escalate"
      : tone === "ink"
        ? "border-brand/40 bg-brand/10 text-console-ink"
        : "border-console-edge bg-console-panel text-console-muted";
  return (
    <span className={`rounded-md border px-2 py-1 ${cls}`}>{text}</span>
  );
}

/* ── RIGHT: Monotonic safety ─────────────────────────────────────────────── */

function MonotonicSafety() {
  return (
    <div className="flex flex-col gap-5 bg-console-panel p-6">
      <PanelHead tone="refuse" index="law 02" title="Monotonic safety" />

      <p className="text-sm leading-relaxed text-console-muted">
        Every uncertain signal can only move the decision{" "}
        <span className="text-console-ink">toward more friction</span> — toward{" "}
        <span className="text-refuse">REFUSE</span> — never less.
      </p>

      <div className="rounded-lg border border-console-edge bg-console-canvas p-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">
          <span>least friction</span>
          <span className="flex items-center gap-1 text-console-muted">
            friction
            <ArrowDown size={12} aria-hidden="true" />
          </span>
        </div>

        <ul className="mt-3 flex flex-col gap-1.5">
          {LATTICE.map((rung, i) => (
            <LatticeRung key={rung.label} rung={rung} step={i} />
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">
          <span>most friction</span>
          <span className="text-refuse">fail-closed</span>
        </div>
      </div>

      <div className="rounded-md border border-console-edge bg-console-canvas px-3 py-2.5 font-mono text-[11px] leading-relaxed text-console-muted">
        <span className="text-console-faint">final</span> ={" "}
        <span className="text-console-ink">min</span>(
        <span className="text-execute">deterministic</span>,{" "}
        <span className="text-escalate">ceiling</span>)
      </div>

      <p className="mt-1 border-l border-refuse/40 pl-3 text-sm leading-relaxed text-console-muted">
        final = min(deterministic, ceiling) —{" "}
        <span className="text-console-ink">structural</span> (guard order +
        lint), not a per-decision clamp. Any failure routes to{" "}
        <span className="text-console-ink">friction</span>, never to{" "}
        <span className="text-execute">execute</span>.
      </p>
    </div>
  );
}

function LatticeRung({ rung, step }: { rung: Rung; step: number }) {
  // total rungs - 1 = 5; width grows monotonically with friction.
  const width = 36 + (step / 5) * 64; // 36% → 100%
  return (
    <li className="flex items-center gap-3">
      <span className="w-4 shrink-0 text-right font-mono text-[10px] text-console-faint">
        {step}
      </span>
      <span
        className="flex h-7 items-center rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-all"
        style={{
          width: `${width}%`,
          borderColor: `${rung.hex}66`,
          background: `${rung.hex}1a`,
          color: rung.hex,
        }}
      >
        {rung.label}
      </span>
    </li>
  );
}

/* ── shared ──────────────────────────────────────────────────────────────── */

/** Static map so Tailwind's extractor keeps the decision-color utilities. */
const DOT: Record<"escalate" | "refuse", string> = {
  escalate: "bg-escalate",
  refuse: "bg-refuse",
};

function PanelHead({
  tone,
  index,
  title,
}: {
  tone: "escalate" | "refuse";
  index: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
        {index}
      </span>
      <h3 className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-console-ink">
        {title}
      </h3>
    </div>
  );
}
