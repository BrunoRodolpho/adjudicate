import {
  Fingerprint,
  Radiation,
  KeyRound,
  Gauge,
  AlertTriangle,
  ShieldX,
  type LucideIcon,
} from "lucide-react";

/**
 * KernelGuards — ACT 3: THE KERNEL.
 *
 * The constitutional kernel, stated as a discipline: every proposed action runs
 * the SAME ordered gauntlet of six guards. The first guard to decide wins
 * (short-circuit); if none allows, the default is refuse (fail-closed). The six
 * cards are numbered 01..06 to make the order load-bearing and visible.
 *
 * This is the static, teaching counterpart to the live <KernelTrace> in the
 * hero: where the trace animates one scenario at a time through the gauntlet,
 * this lays the gauntlet itself out in full so a reader can study each guard.
 *
 * Server component — no interactivity. Matches the dark "constitutional control
 * room" system: console-* surfaces, mono data, crisp hairlines, the six
 * decision colours as the semantic accent system, one restrained brand glow.
 *
 * Truthfulness: the ownership guard is an IDOR-closing SEAM (it proves the
 * declared owner truly owns the resource), not "IDOR-proof" — full closure
 * needs the adopter-supplied authenticated principal. Risk is escalate-only: it
 * can ADD friction, never authorize.
 */

interface Guard {
  /** Ordinal, rendered as a two-digit mono numeral (01..06). */
  readonly n: string;
  readonly icon: LucideIcon;
  readonly title: string;
  /** The mono identifier the guard keys on (mirrors the live trace labels). */
  readonly tag: string;
  readonly body: string;
  /** Optional muted caveat (truthfulness seam) shown beneath the body. */
  readonly caveat?: string;
  /**
   * Decision-colour accent token for this card. Most guards stay neutral
   * (brand/indigo); risk uses escalate(violet) and the default uses
   * refuse(red) because those guards ARE those outcomes.
   */
  readonly accent: "brand" | "escalate" | "refuse";
}

const GUARDS: ReadonlyArray<Guard> = [
  {
    n: "01",
    icon: Fingerprint,
    title: "Intent verification",
    tag: "intentHash",
    body: "intentHash binds kind + payload + taint — no tampering, no replay.",
    accent: "brand",
  },
  {
    n: "02",
    icon: Radiation,
    title: "Provenance & taint",
    tag: "provenance",
    body: "Origin is tracked; contaminated input fails closed.",
    accent: "brand",
  },
  {
    n: "03",
    icon: KeyRound,
    title: "Ownership predicate",
    tag: "ownership",
    body: "Authority derives from a real ownership edge, not model confidence.",
    caveat:
      "An IDOR-closing seam — it proves the declared owner truly owns the resource. Full closure needs the adopter-supplied authenticated principal.",
    accent: "brand",
  },
  {
    n: "04",
    icon: Gauge,
    title: "Deterministic limits",
    tag: "limits",
    body: "Velocity, exposure, accumulation — cumulative caps with reservation.",
    accent: "brand",
  },
  {
    n: "05",
    icon: AlertTriangle,
    title: "Risk",
    tag: "risk",
    body: "Escalate-only. It never authorizes.",
    accent: "escalate",
  },
  {
    n: "06",
    icon: ShieldX,
    title: "Default refuse",
    tag: "default",
    body: "Unknown is denied.",
    accent: "refuse",
  },
];

/** Per-accent class bundles. Decision colours are applied as low-alpha tints. */
const ACCENT: Record<
  Guard["accent"],
  {
    /** Card hover ring + numeral colour. */
    numeral: string;
    /** Icon well border + bg + icon colour. */
    iconWell: string;
    /** Mono tag pill. */
    tag: string;
    /** Left order-rail segment. */
    rail: string;
  }
> = {
  brand: {
    numeral: "text-console-faint",
    iconWell: "border-console-edge bg-console-canvas text-brand",
    tag: "border-console-edge bg-console-canvas text-console-muted",
    rail: "bg-brand/50",
  },
  escalate: {
    numeral: "text-escalate",
    iconWell: "border-escalate/40 bg-escalate/10 text-escalate",
    tag: "border-escalate/40 bg-escalate/10 text-escalate",
    rail: "bg-escalate/60",
  },
  refuse: {
    numeral: "text-refuse",
    iconWell: "border-refuse/40 bg-refuse/10 text-refuse",
    tag: "border-refuse/40 bg-refuse/10 text-refuse",
    rail: "bg-refuse/60",
  },
};

export function KernelGuards() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* one restrained constitutional glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-8%] h-[440px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.14), rgba(99,102,241,0.03), transparent)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* header */}
        <header className="flex max-w-3xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            The constitutional kernel
          </span>

          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Six guards. One order. Fail-closed.
          </h2>

          <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
            Every proposed action runs the same ordered gauntlet. The first guard
            to decide wins; if none allows, the default is{" "}
            <span className="text-console-ink">refuse</span>.
          </p>
        </header>

        {/* the ordered gauntlet — order rail above the grid encodes 01 → 06 */}
        <div className="mt-12 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-console-faint">
          <span>order</span>
          <span aria-hidden className="h-px flex-1 bg-console-edge" />
          <span className="flex items-center gap-1.5 text-console-muted">
            01
            <span aria-hidden className="text-console-faint">
              &rarr;
            </span>
            06
          </span>
          <span aria-hidden className="h-px w-8 bg-console-edge" />
          <span className="text-refuse">default refuse</span>
        </div>

        <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARDS.map((g) => {
            const a = ACCENT[g.accent];
            const Icon = g.icon;
            return (
              <li
                key={g.n}
                className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-console-edge bg-console-panel p-6 transition-colors duration-300 hover:border-console-faint"
              >
                {/* left order-rail — a thin coloured spine encoding sequence */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-[3px] ${a.rail}`}
                />

                {/* top row: numeral · icon well · mono tag */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-2xl font-semibold leading-none tracking-tight ${a.numeral}`}
                    >
                      {g.n}
                    </span>
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border ${a.iconWell}`}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </span>
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${a.tag}`}
                  >
                    {g.tag}
                  </span>
                </div>

                {/* title + body */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-semibold tracking-tight text-console-ink">
                    {g.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-console-muted">
                    {g.body}
                  </p>
                  {g.caveat ? (
                    <p className="mt-1 border-t border-console-edge pt-2 font-mono text-[11px] leading-relaxed text-console-faint">
                      {g.caveat}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {/* fail-closed footer line — restates the default in mono */}
        <p className="mt-6 font-mono text-[11px] tracking-[0.04em] text-console-faint">
          first guard to decide wins · short-circuit · default = refuse ·
          fail-closed
        </p>
      </div>
    </section>
  );
}
