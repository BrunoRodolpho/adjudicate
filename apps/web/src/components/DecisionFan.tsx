import type { DecisionKind } from "@adjudicate/core";
import { DECISIONS, DECISIONS_ORDER } from "@/content/decisions";

/**
 * DecisionFan — a hand-coded SVG centerpiece: one proposed intent fans through
 * the kernel into the six structured outcomes, each in its decision colour.
 * The literal "beyond block-or-allow" message made visible — EXECUTE / REFUSE
 * are the allow/deny pair; the other four are what a permission engine can't
 * express. Pure static SVG (server component, SSR-safe, no JS); scales to its
 * container via the viewBox.
 */

// Per-outcome colour utilities (token-driven) + a short visible label.
const FILL: Record<DecisionKind, string> = {
  EXECUTE: "fill-execute",
  REFUSE: "fill-refuse",
  REWRITE: "fill-rewrite",
  DEFER: "fill-defer",
  ESCALATE: "fill-escalate",
  REQUEST_CONFIRMATION: "fill-confirm",
};
const STROKE: Record<DecisionKind, string> = {
  EXECUTE: "stroke-execute",
  REFUSE: "stroke-refuse",
  REWRITE: "stroke-rewrite",
  DEFER: "stroke-defer",
  ESCALATE: "stroke-escalate",
  REQUEST_CONFIRMATION: "stroke-confirm",
};
const TEXT: Record<DecisionKind, string> = {
  EXECUTE: "fill-execute-strong",
  REFUSE: "fill-refuse-strong",
  REWRITE: "fill-rewrite-strong",
  DEFER: "fill-defer-strong",
  ESCALATE: "fill-escalate-strong",
  REQUEST_CONFIRMATION: "fill-confirm-strong",
};
const SHORT: Record<DecisionKind, string> = {
  EXECUTE: "EXECUTE",
  REFUSE: "REFUSE",
  REWRITE: "REWRITE",
  DEFER: "DEFER",
  ESCALATE: "ESCALATE",
  REQUEST_CONFIRMATION: "REQUEST CONFIRMATION",
};
// EXECUTE + REFUSE are the allow/deny pair a permission engine can express.
const ALLOW_DENY: ReadonlySet<DecisionKind> = new Set(["EXECUTE", "REFUSE"]);

const KERNEL = { x: 250, y: 190, w: 150, h: 60 } as const;
const OUT_X = 556;
const TOP = 44;
const STEP = 60;

export function DecisionFan({ className }: { readonly className?: string }) {
  const kerRight = KERNEL.x + KERNEL.w;
  const kerMidY = KERNEL.y + KERNEL.h / 2;

  return (
    <svg
      viewBox="0 0 800 400"
      role="img"
      aria-label="One AI-proposed action fans through the adjudicate kernel into six structured outcomes: execute, rewrite, defer, escalate, refuse, and request confirmation. Execute and refuse are the allow/deny pair; the other four are unique to adjudicate."
      className={className}
    >
      {/* intent → kernel connector */}
      <path
        d={`M 150 ${kerMidY} H ${KERNEL.x}`}
        className="stroke-edge-strong"
        strokeWidth={2}
        fill="none"
      />
      {/* fan: kernel → each outcome, in its decision colour */}
      {DECISIONS_ORDER.map((kind, i) => {
        const y = TOP + i * STEP;
        const dim = ALLOW_DENY.has(kind);
        return (
          <path
            key={`p-${kind}`}
            d={`M ${kerRight} ${kerMidY} C ${kerRight + 80} ${kerMidY}, ${OUT_X - 90} ${y}, ${OUT_X - 14} ${y}`}
            className={STROKE[kind]}
            strokeWidth={2.5}
            strokeOpacity={dim ? 0.45 : 1}
            fill="none"
          />
        );
      })}

      {/* intent node */}
      <g>
        <rect
          x={28}
          y={kerMidY - 22}
          width={122}
          height={44}
          rx={10}
          className="fill-canvas stroke-edge-strong"
          strokeWidth={1.5}
        />
        <text
          x={89}
          y={kerMidY - 3}
          textAnchor="middle"
          className="fill-muted font-mono text-[10px] uppercase"
          style={{ letterSpacing: "0.08em" }}
        >
          AI proposes
        </text>
        <text
          x={89}
          y={kerMidY + 12}
          textAnchor="middle"
          className="fill-ink text-[12px] font-medium"
        >
          an action
        </text>
      </g>

      {/* kernel node */}
      <g>
        <rect
          x={KERNEL.x}
          y={KERNEL.y}
          width={KERNEL.w}
          height={KERNEL.h}
          rx={14}
          className="fill-surface stroke-brand"
          strokeWidth={1.75}
        />
        <text
          x={KERNEL.x + KERNEL.w / 2}
          y={kerMidY - 4}
          textAnchor="middle"
          className="fill-ink font-mono text-[14px] font-semibold"
        >
          adjudicate
        </text>
        <text
          x={KERNEL.x + KERNEL.w / 2}
          y={kerMidY + 13}
          textAnchor="middle"
          className="fill-muted text-[10px] uppercase"
          style={{ letterSpacing: "0.12em" }}
        >
          decision kernel
        </text>
      </g>

      {/* outcome nodes */}
      {DECISIONS_ORDER.map((kind, i) => {
        const y = TOP + i * STEP;
        const dim = ALLOW_DENY.has(kind);
        return (
          <g key={`o-${kind}`} opacity={dim ? 0.75 : 1}>
            <circle cx={OUT_X} cy={y} r={6} className={FILL[kind]} />
            <text
              x={OUT_X + 16}
              y={y + 4}
              className={`${TEXT[kind]} font-mono text-[12px] font-semibold`}
              style={{ letterSpacing: "0.04em" }}
            >
              {SHORT[kind]}
            </text>
            {dim ? (
              <text
                x={OUT_X + 16}
                y={y + 19}
                className="fill-faint font-mono text-[9px] uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                allow / deny
              </text>
            ) : (
              <text
                x={OUT_X + 16}
                y={y + 19}
                className="fill-muted text-[10px]"
              >
                {DECISIONS[kind].headline}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
