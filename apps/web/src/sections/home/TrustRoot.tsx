import { ArrowRight, Check, X } from "lucide-react";

/**
 * TrustRoot — ACT 1 of the dark marketing homepage: THE PROBLEM.
 *
 * States the category thesis as a contrast between two flows. The WRONG path
 * lets the probabilistic model both decide AND authorize (it's the trust root,
 * so a hallucination or prompt-injection becomes a real-world action). The
 * RIGHT path demotes the model to a proposer and moves authority into the
 * deterministic constitutional kernel — the thing that doesn't drift.
 *
 * Server component. Built from mono pill-nodes + arrows in the console design
 * system (matches {@link Hero} and {@link KernelTrace}): zinc surfaces, hairline
 * edges, mono data, and the load-bearing six-decision colours used as low-alpha
 * tints (refuse-red marks the broken path, execute-green the correct one).
 */
export function TrustRoot() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* one restrained constitutional glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-8%] h-[460px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.12), rgba(99,102,241,0.03), transparent)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* header */}
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-refuse" />
            The problem
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            AI can&rsquo;t be the trust root.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
            Models are non-deterministic — they hallucinate, they get
            prompt-injected, they drift.{" "}
            <span className="text-console-ink">
              Trust has to live in something that doesn&rsquo;t.
            </span>
          </p>
        </header>

        {/* the two contrasting flows */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <FlowCard
            tone="wrong"
            kicker="how it works today"
            label="the model decides — and authorizes."
            nodes={[
              { text: "LLM", tone: "wrong" },
              { text: "Tool / API", tone: "wrong" },
            ]}
            note="A hallucination or an injected instruction becomes a real-world action. The trust root is probabilistic."
          />
          <FlowCard
            tone="right"
            kicker="how it works with adjudicate"
            label="the model proposes — the kernel authorizes."
            nodes={[
              { text: "LLM", tone: "muted" },
              { text: "Constitutional Kernel", tone: "right" },
              { text: "Capability", tone: "right" },
              { text: "Execution", tone: "right" },
            ]}
            note="The LLM only proposes. A deterministic kernel decides — and only an EXECUTE verdict reaches the tool; nothing else runs. That verdict can be carried as a single-use, intent-bound capability the executor must redeem first — an available hardening, off by default."
          />
        </div>
      </div>
    </section>
  );
}

type Tone = "wrong" | "right" | "muted";

interface FlowNode {
  readonly text: string;
  readonly tone: Tone;
}

/** A single contrasting flow: header verdict, the pill→arrow chain, a note. */
function FlowCard({
  tone,
  kicker,
  label,
  nodes,
  note,
}: {
  readonly tone: Exclude<Tone, "muted">;
  readonly kicker: string;
  readonly label: string;
  readonly nodes: ReadonlyArray<FlowNode>;
  readonly note: string;
}) {
  const wrong = tone === "wrong";
  const verdictCls = wrong ? "text-refuse" : "text-execute";
  const badgeCls = wrong
    ? "border-refuse/40 bg-refuse/10 text-refuse"
    : "border-execute/40 bg-execute/10 text-execute";

  return (
    <div
      className={`flex h-full flex-col rounded-xl border p-6 ${
        wrong
          ? "border-console-edge bg-console-panel"
          : "border-execute/40 bg-console-panel"
      }`}
    >
      {/* verdict row */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
          {kicker}
        </span>
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${badgeCls}`}
          aria-hidden
        >
          {wrong ? <X size={14} /> : <Check size={14} />}
        </span>
      </div>

      {/* the flow itself, inset into a well */}
      <div className="mt-4 rounded-lg border border-console-edge bg-console-canvas p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {nodes.map((node, i) => (
            <div key={node.text} className="flex items-center gap-x-2">
              <PillNode tone={node.tone}>{node.text}</PillNode>
              {i < nodes.length - 1 ? <FlowArrow tone={tone} /> : null}
            </div>
          ))}
        </div>
      </div>

      {/* the load-bearing label */}
      <p className={`mt-4 font-mono text-[12px] leading-relaxed ${verdictCls}`}>
        {label}
      </p>

      {/* supporting note */}
      <p className="mt-2 text-[13px] leading-relaxed text-console-muted">
        {note}
      </p>

      {wrong ? (
        <p className="mt-auto pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-console-faint">
          trust root: the model
        </p>
      ) : (
        <p className="mt-auto inline-flex items-center gap-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-execute/80">
          trust root: the kernel <ArrowRight size={12} aria-hidden />
        </p>
      )}
    </div>
  );
}

/** A mono pill-node. Tone drives the tint: wrong=red, right=green, muted=neutral. */
function PillNode({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: React.ReactNode;
}) {
  const cls =
    tone === "wrong"
      ? "border-refuse/40 bg-refuse/10 text-refuse"
      : tone === "right"
        ? "border-execute/40 bg-execute/10 text-execute"
        : "border-console-edge bg-console-panel text-console-muted";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-[12px] tracking-tight ${cls}`}
    >
      {children}
    </span>
  );
}

/** A short directional arrow tinted to the flow's verdict. */
function FlowArrow({ tone }: { readonly tone: Exclude<Tone, "muted"> }) {
  return (
    <ArrowRight
      size={16}
      aria-hidden
      className={tone === "wrong" ? "text-refuse/50" : "text-execute/60"}
    />
  );
}
