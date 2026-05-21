"use client";

import { useRouter } from "next/navigation";
import type { Supersession } from "@adjudicate/core";
import type { LineageNode } from "@/hooks/useLineage";
import { decisionTheme } from "@/lib/decision-theme";
import { formatRelative, truncateHash } from "@/lib/format";

/**
 * SVG-rendered top-down chain of an AuditRecord's supersession lineage
 * (T-082).
 *
 * At depth ≤ 20, force-directed layout is overkill — a straight column
 * communicates the chain better and stays legible at small sizes. Each
 * node is a tile (decision badge + intent kind + short hash + relative
 * timestamp); each edge is the supersession reason as a label.
 *
 * Click a node → router push to its detail page. Edges are pure visual;
 * the click target is the node tile.
 */
interface Props {
  readonly nodes: readonly LineageNode[];
  readonly truncated: boolean;
  readonly cyclic: boolean;
}

const NODE_WIDTH = 320;
const NODE_HEIGHT = 64;
const ROW_GAP = 36;
const LEFT_PAD = 16;
const TOP_PAD = 16;

const REASON_LABEL: Record<Supersession["reason"], string> = {
  confirmation_resolved: "confirmation_resolved",
  defer_resumed: "defer_resumed",
  rewrite_executed: "rewrite_executed",
  replay: "replay",
};

export function LineageGraph({ nodes, truncated, cyclic }: Props) {
  const router = useRouter();
  const totalHeight =
    TOP_PAD * 2 + nodes.length * NODE_HEIGHT + (nodes.length - 1) * ROW_GAP;
  const totalWidth = NODE_WIDTH + LEFT_PAD * 2;

  if (nodes.length === 0) {
    return (
      <div className="rounded-sm border border-edge bg-panel/40 px-3 py-6 text-center text-[11px] italic text-faint">
        No predecessor records reachable.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/40 p-3">
      {truncated ? (
        <div className="rounded-sm border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-200">
          Truncated at depth 20. Predecessors beyond this point are reachable
          via the deepest node's link.
        </div>
      ) : null}
      {cyclic ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-2 py-1 text-[10px] text-red-200">
          Cycle detected — supersession chain loops back. Display halted.
        </div>
      ) : null}
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        role="img"
        aria-label="Supersession lineage graph"
        className="max-w-full"
      >
        {nodes.map((node, i) => {
          const y = TOP_PAD + i * (NODE_HEIGHT + ROW_GAP);
          const isFirst = i === 0;
          const t = decisionTheme[node.record.decision.kind];
          const supersedes = node.record.supersedes;
          return (
            <g key={node.record.intentHash}>
              {/* Edge from previous node */}
              {!isFirst && nodes[i - 1] ? (
                <EdgeFromAbove
                  y={y}
                  reason={
                    nodes[i - 1]!.record.supersedes
                      ? REASON_LABEL[nodes[i - 1]!.record.supersedes!.reason]
                      : "—"
                  }
                />
              ) : null}

              {/* Node tile */}
              <g
                transform={`translate(${LEFT_PAD}, ${y})`}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/decisions/${node.record.intentHash}`)
                }
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={4}
                  className={`fill-zinc-900 stroke-current ${t.fg}`}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <text
                  x={12}
                  y={20}
                  className={`fill-current text-[10px] uppercase tracking-wider ${t.fg}`}
                >
                  {t.label}
                </text>
                <text
                  x={12}
                  y={38}
                  className="fill-zinc-200 text-[11px]"
                >
                  {node.record.envelope.kind}
                </text>
                <text
                  x={12}
                  y={54}
                  className="fill-zinc-500 text-[10px] font-mono"
                >
                  {truncateHash(node.record.intentHash, 8, 6)} ·{" "}
                  {formatRelative(node.record.at)}
                </text>
                {supersedes ? (
                  <text
                    x={NODE_WIDTH - 12}
                    y={20}
                    textAnchor="end"
                    className="fill-zinc-500 text-[10px]"
                  >
                    depth {node.depth}
                  </text>
                ) : (
                  <text
                    x={NODE_WIDTH - 12}
                    y={20}
                    textAnchor="end"
                    className="fill-zinc-500 text-[10px]"
                  >
                    root
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] italic text-faint">
        Newest first. Each edge is the `supersedes.reason` that linked the row
        below to the row above.
      </p>
    </div>
  );
}

/**
 * Vertical edge from the bottom of the previous node to the top of the
 * current one, with the reason label centered.
 */
function EdgeFromAbove({ y, reason }: { y: number; reason: string }) {
  const edgeTop = y - ROW_GAP;
  const edgeBottom = y;
  const midY = (edgeTop + edgeBottom) / 2;
  const x = LEFT_PAD + NODE_WIDTH / 2;
  return (
    <g>
      <line
        x1={x}
        y1={edgeTop}
        x2={x}
        y2={edgeBottom - 4}
        className="stroke-zinc-600"
        strokeWidth={1}
      />
      {/* Arrowhead */}
      <polygon
        points={`${x - 4},${edgeBottom - 4} ${x + 4},${edgeBottom - 4} ${x},${edgeBottom + 2}`}
        className="fill-zinc-600"
      />
      {/* Reason label */}
      <rect
        x={x - 72}
        y={midY - 9}
        width={144}
        height={18}
        rx={2}
        className="fill-zinc-950 stroke-zinc-700"
        strokeWidth={1}
      />
      <text
        x={x}
        y={midY + 4}
        textAnchor="middle"
        className="fill-zinc-300 text-[10px] font-mono"
      >
        {reason}
      </text>
    </g>
  );
}
