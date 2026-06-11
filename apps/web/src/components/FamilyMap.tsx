/**
 * FamilyMap — a hand-coded SVG for the capabilities index: the kernel branching
 * into the four capability families, each with its colour and count. Gives the
 * "14 capabilities, four families" taxonomy a real structural visual instead of
 * a plain header. Pure static SVG (server component, SSR-safe), scales via the
 * viewBox. Distinct from the DecisionFan (outcomes) — this is the capability
 * organisation.
 */

interface Family {
  readonly label: string;
  readonly count: number;
  readonly dot: string;
  readonly text: string;
  readonly stroke: string;
}

const FAMILIES: ReadonlyArray<Family> = [
  { label: "Content & data safety", count: 3, dot: "fill-confirm", text: "fill-confirm-strong", stroke: "stroke-confirm" },
  { label: "Adversarial & behavioral", count: 3, dot: "fill-refuse", text: "fill-refuse-strong", stroke: "stroke-refuse" },
  { label: "Budget & integrity", count: 3, dot: "fill-defer", text: "fill-defer-strong", stroke: "stroke-defer" },
  { label: "Workflow & governance", count: 5, dot: "fill-escalate", text: "fill-escalate-strong", stroke: "stroke-escalate" },
];

const KERNEL = { x: 24, y: 122, w: 172, h: 64 } as const;
const NODE = { x: 300, w: 412, h: 56 } as const;
const ROW_TOP = 18;
const ROW_STEP = 78;

export function FamilyMap({ className }: { readonly className?: string }) {
  const kerRight = KERNEL.x + KERNEL.w;
  const kerMidY = KERNEL.y + KERNEL.h / 2;

  return (
    <svg
      viewBox="0 0 740 330"
      role="img"
      aria-label="The adjudicate kernel organises 14 capabilities into four families: Content & data safety (3), Adversarial & behavioral (3), Budget & integrity (3), and Workflow & governance (5)."
      className={className}
    >
      {/* branches kernel → each family */}
      {FAMILIES.map((f, i) => {
        const cy = ROW_TOP + i * ROW_STEP + NODE.h / 2;
        return (
          <path
            key={`b-${f.label}`}
            d={`M ${kerRight} ${kerMidY} C ${kerRight + 70} ${kerMidY}, ${NODE.x - 70} ${cy}, ${NODE.x} ${cy}`}
            className={f.stroke}
            strokeWidth={3}
            strokeOpacity={0.9}
            fill="none"
          />
        );
      })}

      {/* kernel node */}
      <rect
        x={KERNEL.x}
        y={KERNEL.y}
        width={KERNEL.w}
        height={KERNEL.h}
        rx={14}
        className="fill-surface stroke-brand"
        strokeWidth={1.75}
      />
      <text x={KERNEL.x + KERNEL.w / 2} y={kerMidY - 4} textAnchor="middle" className="fill-ink font-mono text-[14px] font-semibold">
        adjudicate
      </text>
      <text
        x={KERNEL.x + KERNEL.w / 2}
        y={kerMidY + 13}
        textAnchor="middle"
        className="fill-muted text-[10px] uppercase"
        style={{ letterSpacing: "0.12em" }}
      >
        14 capabilities
      </text>

      {/* family nodes */}
      {FAMILIES.map((f, i) => {
        const y = ROW_TOP + i * ROW_STEP;
        const cy = y + NODE.h / 2;
        return (
          <g key={`n-${f.label}`}>
            <rect
              x={NODE.x}
              y={y}
              width={NODE.w}
              height={NODE.h}
              rx={12}
              className={`fill-surface ${f.stroke}`}
              strokeWidth={1.25}
              strokeOpacity={0.4}
            />
            <circle cx={NODE.x + 22} cy={cy} r={6} className={f.dot} />
            <text x={NODE.x + 40} y={cy - 4} className={`${f.text} text-[14px] font-semibold`}>
              {f.label}
            </text>
            <text
              x={NODE.x + 40}
              y={cy + 14}
              className="fill-muted font-mono text-[11px] uppercase"
              style={{ letterSpacing: "0.08em" }}
            >
              {f.count} {f.count === 1 ? "capability" : "capabilities"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
