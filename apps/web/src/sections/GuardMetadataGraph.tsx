"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { PolicyBundleDescriptorParsed } from "@adjudicate/admin-sdk";

interface PolicyDescriptorResponse {
  packs: ReadonlyArray<{
    id: string;
    name: string;
    descriptor: PolicyBundleDescriptorParsed;
  }>;
}

interface Node {
  readonly id: string;
  readonly packName: string;
  readonly phase: string;
  readonly name: string;
  readonly descKind: string;
}

const DESC_COLOR: Record<string, string> = {
  threshold: "fill-defer stroke-defer",
  state_defer: "fill-confirm stroke-confirm",
  system_taint: "fill-escalate stroke-escalate",
  rewrite: "fill-rewrite stroke-rewrite",
  opaque: "fill-faint stroke-faint",
  unknown: "fill-faint stroke-faint",
};

/**
 * GuardMetadata force-ish graph — server-side `describePolicyBundle` for
 * each shipped Pack, rendered as a radial layout grouped by Pack with
 * description-kind colour coding. Each guard's metadata feeds a node;
 * hover surfaces the metadata fields.
 *
 * "Force-ish" rather than full d3-force: a deterministic radial layout
 * keeps the bundle ~zero-dep (no d3 import) and renders identically
 * every page load.
 */
export function GuardMetadataGraph() {
  const [data, setData] = useState<PolicyDescriptorResponse | null>(null);
  const [active, setActive] = useState<Node | null>(null);

  useEffect(() => {
    void fetch("/api/playground/policy")
      .then((r) => r.json())
      .then((d) => setData(d as PolicyDescriptorResponse))
      .catch(() => {});
  }, []);

  const nodes = useMemo<ReadonlyArray<Node>>(() => {
    if (!data) return [];
    const out: Node[] = [];
    for (const pack of data.packs) {
      for (const phase of pack.descriptor.phases) {
        for (const g of phase.guards) {
          if (g.kind !== "named") continue;
          out.push({
            id: `${pack.id}/${phase.phase}/${g.metadata.name ?? "anon"}`,
            packName: pack.name,
            phase: phase.phase,
            name: g.metadata.name ?? "(unnamed)",
            descKind: g.metadata.description?.kind ?? "unknown",
          });
        }
      }
    }
    return out;
  }, [data]);

  return (
    <section className="bg-canvas py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="GuardMetadata · ADR-105"
          title="Your policy is no longer a black box."
          subtitle="Every guard carries optional metadata — name, author, since, and a structured description (threshold, state_defer, system_taint, rewrite, opaque). Tooling reads it; the graph below is one example."
        />

        <div className="mt-10 grid items-start gap-6 md:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-edge bg-surface p-6 shadow-sm">
            {data === null ? (
              <p className="py-12 text-center text-sm text-muted">
                Loading policy descriptors…
              </p>
            ) : nodes.length === 0 ? (
              <p className="py-12 text-center text-sm italic text-faint">
                No named guards in the installed Packs.
              </p>
            ) : (
              <Graph nodes={nodes} active={active} onHover={setActive} />
            )}
          </div>

          <aside className="rounded-2xl border border-edge bg-surface p-5">
            <h3 className="text-sm font-semibold uppercase tracking-section text-muted">
              Legend
            </h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.entries({
                threshold: "Numeric threshold (refund cap, ramp%, etc.)",
                state_defer: "DEFER on an external signal",
                system_taint: "Taint-gated kind allow-list",
                rewrite: "REWRITE — kernel modifies the envelope",
                opaque: "Free-form guard — analyzers fall back to name",
              }).map(([k, v]) => (
                <li key={k} className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 rounded-full ${DESC_COLOR[k]?.replace(/\bstroke-\S+/, "")}`}
                  />
                  <span>
                    <code className="text-ink">{k}</code>{" "}
                    <span className="text-muted">— {v}</span>
                  </span>
                </li>
              ))}
            </ul>
            {active ? (
              <div className="mt-5 border-t border-edge pt-4">
                <p className="text-xs uppercase tracking-section text-faint">
                  Selected
                </p>
                <p className="mt-1 font-mono text-sm text-ink">{active.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {active.packName} · {active.phase} · {active.descKind}
                </p>
              </div>
            ) : (
              <p className="mt-5 border-t border-edge pt-4 text-xs italic text-faint">
                Hover a node to inspect its metadata.
              </p>
            )}
          </aside>
        </div>

        <p className="mt-6 text-center text-xs italic text-faint">
          GuardMetadata landed in ADR-105 — analyser tooling is nascent and will
          deepen across upcoming releases.
        </p>
      </div>
    </section>
  );
}

function Graph({
  nodes,
  active,
  onHover,
}: {
  nodes: ReadonlyArray<Node>;
  active: Node | null;
  onHover: (n: Node | null) => void;
}) {
  // Group nodes by Pack so each Pack gets its own "ring".
  const byPack = useMemo(() => {
    const m = new Map<string, Node[]>();
    for (const n of nodes) {
      const arr = m.get(n.packName) ?? [];
      arr.push(n);
      m.set(n.packName, arr);
    }
    return Array.from(m.entries());
  }, [nodes]);

  const width = 540;
  const height = 380;
  const cx = width / 2;
  const cy = height / 2;
  const ringStep = 70;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Guard metadata force graph"
      className="w-full"
    >
      {byPack.map(([packName, packNodes], ringIdx) => {
        const r = ringStep * (ringIdx + 1);
        return (
          <g key={packName}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              className="fill-none stroke-edge"
              strokeDasharray="3 4"
            />
            <text
              x={cx + r}
              y={cy - 6}
              className="fill-muted"
              style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            >
              {packName}
            </text>
            {packNodes.map((n, i) => {
              const angle = (i / packNodes.length) * Math.PI * 2;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              const isActive = active?.id === n.id;
              return (
                <motion.g
                  key={n.id}
                  onMouseEnter={() => onHover(n)}
                  onMouseLeave={() => onHover(null)}
                  whileHover={{ scale: 1.4 }}
                  transition={{ duration: 0.15 }}
                  style={{ cursor: "pointer", transformOrigin: `${x}px ${y}px` }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 7 : 5}
                    className={`${DESC_COLOR[n.descKind] ?? DESC_COLOR.unknown}`}
                    strokeWidth={isActive ? 2 : 0.5}
                  />
                </motion.g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
