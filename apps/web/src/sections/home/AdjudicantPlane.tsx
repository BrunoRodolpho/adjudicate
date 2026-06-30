import {
  ArrowRight,
  ClipboardList,
  Eye,
  GaugeCircle,
  ScrollText,
  SignalHigh,
} from "lucide-react";

/**
 * AdjudicantPlane — ACT 4 of the dark marketing homepage: GOVERNANCE.
 *
 * Introduces Adjudicant, the write-isolated observer plane. Its admin surface is
 * the operator's admin router minus every authorize/weaken mutation — 36 read
 * queries plus exactly one friction-monotone write (escalate.raise) — so it can
 * observe, investigate, and escalate, but can never authorize. The centrepiece diagram makes the load-bearing claim spatial:
 * ADJUDICANT sits ABOVE the live path and connects to it only by a DASHED
 * "observe" line. It is never IN the path "authority → kernel → execution".
 *
 * Server component. Built in the console design system (matches {@link Hero} and
 * {@link KernelTrace}): zinc surfaces, hairline edges, mono data, one restrained
 * glow. Adjudicant reads as a governance observer, so it is tinted with the
 * escalate-violet of the six load-bearing decision colours; the live path uses
 * neutral/brand emphasis.
 */
export function AdjudicantPlane() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* one restrained governance glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-8%] h-[460px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(139,92,246,0.12), rgba(139,92,246,0.03), transparent)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* header */}
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-escalate" />
            The governance plane
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Adjudicant &mdash; write-isolated by construction.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
            Observe. Investigate. Escalate.{" "}
            <span className="text-console-ink">Never authorize.</span> A
            write-isolated plane whose admin surface is the operator&rsquo;s
            minus every authorize/weaken mutation &mdash;{" "}
            <span className="font-mono text-escalate">
              36 read queries plus exactly one friction-monotone write
              (escalate.raise)
            </span>
            . It sits above the kernel like an inspector general: always
            watching, never in the path.
          </p>
        </header>

        {/* the diagram: ADJUDICANT above, the live path below, joined by a
            dashed observe line that proves it is never IN the path */}
        <div className="mt-12 rounded-xl border border-console-edge bg-console-panel p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
              the governance topology
            </span>
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-escalate/80">
              <Eye size={12} aria-hidden /> write-isolated
            </span>
          </div>

          {/* inset well */}
          <div className="mt-4 rounded-lg border border-console-edge bg-console-canvas p-5 md:p-8">
            {/* ADJUDICANT — above the path */}
            <div className="flex flex-col items-center">
              <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-escalate/40 bg-escalate/10 px-4 py-3 text-center">
                <span className="font-mono text-[13px] font-semibold tracking-tight text-escalate">
                  ADJUDICANT
                </span>
                <span className="font-mono text-[10px] tracking-tight text-escalate/70">
                  write-isolated observer plane
                </span>
              </div>

              {/* the DASHED observe line — explicitly not a solid path */}
              <div
                aria-hidden
                className="my-1 h-9 w-px border-l border-dashed border-escalate/50"
              />
              <span className="mb-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-escalate/70">
                <SignalHigh size={12} aria-hidden /> observe &middot; never in the
                path
              </span>
              <div
                aria-hidden
                className="mb-4 h-3 w-px border-l border-dashed border-escalate/50"
              />
            </div>

            {/* the live path — solid, neutral/brand */}
            <div className="rounded-lg border border-console-edge bg-console-panel/60 p-4">
              <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-console-faint">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                the live path
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
                <PathNode>authority</PathNode>
                <PathArrow />
                <PathNode emphasis>kernel</PathNode>
                <PathArrow />
                <PathNode>execution</PathNode>
              </div>
            </div>

            <p className="mt-4 text-center font-mono text-[11px] leading-relaxed text-console-faint">
              Adjudicant only watches the path &mdash; it is{" "}
              <span className="text-escalate/80">never a node in it</span>. No
              mutation it could issue can reach the kernel.
            </p>
          </div>
        </div>

        {/* four read-only capability tags */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CapabilityTag
            icon={ClipboardList}
            label="incident investigation"
          />
          <CapabilityTag icon={ScrollText} label="compliance review" />
          <CapabilityTag icon={GaugeCircle} label="operations dashboards" />
          <CapabilityTag icon={SignalHigh} label="escalation management" />
        </div>
      </div>
    </section>
  );
}

/** A solid node on the live path. The kernel gets the brand emphasis. */
function PathNode({
  children,
  emphasis,
}: {
  readonly children: React.ReactNode;
  readonly emphasis?: boolean;
}) {
  const cls = emphasis
    ? "border-brand/40 bg-brand/10 text-brand"
    : "border-console-edge bg-console-panel text-console-muted";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-[12px] tracking-tight ${cls}`}
    >
      {children}
    </span>
  );
}

/** A short directional arrow along the live path. */
function PathArrow() {
  return <ArrowRight size={16} aria-hidden className="text-console-faint" />;
}

/** A read-only capability the observer plane exposes. */
function CapabilityTag({
  icon: Icon,
  label,
}: {
  readonly icon: typeof Eye;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-console-edge bg-console-panel p-5">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-escalate/40 bg-escalate/10 text-escalate"
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <span className="font-mono text-[12px] leading-snug tracking-tight text-console-ink">
        {label}
      </span>
    </div>
  );
}
