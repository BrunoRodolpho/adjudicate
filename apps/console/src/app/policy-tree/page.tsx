"use client";

import { useMemo, useState } from "react";
import type { PolicyManifestParsed } from "@adjudicate/admin-sdk";
import { PolicyManifestSchema } from "@adjudicate/admin-sdk";
import { usePolicyManifest } from "@/hooks/usePolicyManifest";
import { useGuardFireStats } from "@/hooks/useGuardFireStats";
import { PolicyTree } from "@/components/policy-tree/PolicyTree";
import { DECISION_KIND_ORDER } from "@/lib/decision-theme";
import { diffManifests, removedNodes, type ManifestDiff } from "@/lib/manifest-diff";

const SINCE_7D = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

interface Filters {
  q: string;
  decision: string; // "ALL" | DecisionKind
  unguardedOnly: boolean;
}

function filterManifest(m: PolicyManifestParsed, f: Filters): PolicyManifestParsed {
  const ql = f.q.trim().toLowerCase();
  const packs = m.packs
    .map((pack) => {
      const intents = pack.intents.filter((intent) => {
        if (f.unguardedOnly && intent.guardNames.length > 0) return false;
        if (f.decision !== "ALL" && !intent.outcomes.possible.includes(f.decision)) return false;
        if (ql.length > 0) {
          const hit =
            intent.kind.toLowerCase().includes(ql) ||
            intent.guardNames.some((n) => n.toLowerCase().includes(ql)) ||
            intent.tools.some((t) => t.toLowerCase().includes(ql)) ||
            pack.basisCodes.some((c) => c.toLowerCase().includes(ql)) ||
            pack.id.toLowerCase().includes(ql);
          if (!hit) return false;
        }
        return true;
      });
      return { ...pack, intents };
    })
    .filter((p) => p.intents.length > 0);
  return { ...m, packs };
}

export default function PolicyTreePage() {
  const manifest = usePolicyManifest();
  const [filters, setFilters] = useState<Filters>({ q: "", decision: "ALL", unguardedOnly: false });
  const [showLive, setShowLive] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [baselineText, setBaselineText] = useState("");
  const [diff, setDiff] = useState<ManifestDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const [since] = useState(SINCE_7D);
  const stats = useGuardFireStats({ since });

  const fireCounts = useMemo<ReadonlyMap<string, number> | undefined>(() => {
    if (!showLive) return undefined;
    const buckets = (stats.data?.buckets ?? []) as ReadonlyArray<{
      guardName: string;
      count: number;
    }>;
    const map = new Map<string, number>();
    for (const b of buckets) map.set(b.guardName, (map.get(b.guardName) ?? 0) + b.count);
    return map;
  }, [showLive, stats.data]);

  const filtered = useMemo(
    () => (manifest.data ? filterManifest(manifest.data, filters) : undefined),
    [manifest.data, filters],
  );

  function runDiff() {
    setDiffError(null);
    if (!manifest.data) return;
    try {
      const parsed = PolicyManifestSchema.safeParse(JSON.parse(baselineText));
      if (!parsed.success) {
        setDiffError("Pasted JSON is not a valid PolicyManifest.");
        setDiff(null);
        return;
      }
      setDiff(diffManifests(parsed.data, manifest.data));
    } catch {
      setDiffError("Could not parse JSON.");
      setDiff(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Policy Tree · Rule Provenance
        </h1>
        <span className="text-[10px] text-faint">
          every rule an adopter enforces on the kernel — by intent kind, in evaluation order
        </span>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <input
          type="text"
          value={filters.q}
          onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
          placeholder="filter: kind / guard / tool / basis code"
          className="min-w-[14rem] flex-1 rounded-sm border border-edge bg-panel/60 px-2 py-1 font-mono text-[11px] text-ink placeholder:text-faint"
        />
        <select
          value={filters.decision}
          onChange={(e) => setFilters((s) => ({ ...s, decision: e.target.value }))}
          className="rounded-sm border border-edge bg-panel/60 px-2 py-1 text-[11px] text-ink"
          title="Show only intents that can produce this decision"
        >
          <option value="ALL">any decision</option>
          {DECISION_KIND_ORDER.map((d) => (
            <option key={d} value={d}>
              can {d}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-faint">
          <input
            type="checkbox"
            checked={filters.unguardedOnly}
            onChange={(e) => setFilters((s) => ({ ...s, unguardedOnly: e.target.checked }))}
          />
          unguarded only
        </label>
        <label className="flex items-center gap-1 text-faint" title="Join per-guard fire counts (last 7d)">
          <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} />
          live activity
        </label>
        <button
          type="button"
          onClick={() => setDiffOpen((v) => !v)}
          className="rounded-sm border border-edge px-2 py-1 text-faint hover:text-ink"
        >
          {diffOpen ? "× drift" : "drift / diff"}
        </button>
      </div>

      {/* Drift / diff panel */}
      {diffOpen ? (
        <div className="rounded-sm border border-edge bg-panel/40 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-section text-faint">
            Paste a baseline manifest (e.g. a committed <code>policy-manifest.json</code>) to diff
            against the live one
          </p>
          <textarea
            value={baselineText}
            onChange={(e) => setBaselineText(e.target.value)}
            rows={4}
            placeholder="{ …PolicyManifest JSON… }"
            className="w-full rounded-sm border border-edge bg-canvas px-2 py-1 font-mono text-[10px] text-ink"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={runDiff}
              className="rounded-sm border border-edge px-2 py-1 text-[11px] text-ink hover:bg-edge/30"
            >
              Compare
            </button>
            {diff ? (
              <span className="text-[10px] text-muted">
                {diff.identical ? (
                  <span className="text-emerald-300">identical — no drift</span>
                ) : (
                  <>
                    <span className="text-emerald-300">+{diff.counts.added}</span>{" "}
                    <span className="text-red-300">−{diff.counts.removed}</span>{" "}
                    <span className="text-amber-300">~{diff.counts.changed}</span>{" "}
                    changed
                  </>
                )}
              </span>
            ) : null}
            {diff ? (
              <button
                type="button"
                onClick={() => setDiff(null)}
                className="text-[10px] text-faint hover:text-ink"
              >
                clear
              </button>
            ) : null}
            {diffError ? <span className="text-[10px] text-red-300">{diffError}</span> : null}
          </div>
          {diff && !diff.identical ? <RemovedNodes diff={diff} /> : null}
        </div>
      ) : null}

      {/* Tree */}
      {manifest.isLoading ? (
        <p className="text-[11px] text-muted">Loading policy manifest…</p>
      ) : manifest.isError ? (
        <p className="text-[11px] italic text-faint">
          No policy manifest configured. Wire one into the route-handler context via{" "}
          <code>describeInstalledPacks(...)</code> (or drop a{" "}
          <code>policy-manifests/&lt;adopter&gt;.json</code> from <code>ibx policy export</code>).
        </p>
      ) : filtered ? (
        <PolicyTree
          manifest={filtered}
          {...(fireCounts ? { fireCounts } : {})}
          {...(diff ? { diff } : {})}
        />
      ) : null}
    </div>
  );
}

/**
 * Removed nodes can't appear in the tree (it renders only the LIVE manifest),
 * so the drift panel lists them explicitly — a silently-removed guard is the
 * most safety-critical drift direction.
 */
function RemovedNodes({ diff }: { diff: ManifestDiff }) {
  const removed = removedNodes(diff);
  if (removed.packs.length + removed.intents.length + removed.guards.length === 0) return null;
  return (
    <div className="mt-2 rounded-sm border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px]">
      <span className="uppercase tracking-section text-red-300">Removed (not in live)</span>
      <div className="mt-1 flex flex-col gap-0.5 font-mono text-muted">
        {removed.packs.map((p) => (
          <span key={`p:${p}`}>pack · {p}</span>
        ))}
        {removed.intents.map((i) => (
          <span key={`i:${i}`}>intent · {i}</span>
        ))}
        {removed.guards.map((g) => (
          <span key={`g:${g}`}>guard · {g}</span>
        ))}
      </div>
    </div>
  );
}
