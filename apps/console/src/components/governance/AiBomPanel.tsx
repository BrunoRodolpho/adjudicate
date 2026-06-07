"use client";

import { useAiBom } from "@/hooks/useAiBom";

/**
 * AI-BOM panel (ADR-127) — the Pack's AI Bill-of-Materials with a download
 * button. EU-AI-Act / NIST-aligned supply-chain manifest.
 */
export function AiBomPanel() {
  const { data, isLoading, isError } = useAiBom();

  function download() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.packId}-aibom.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="ai-bom-panel">
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">AI-BOM · ADR-127</span>
        {data ? (
          <button type="button" className="text-[10px] text-emerald-300 underline" onClick={download}>
            Download JSON
          </button>
        ) : null}
      </header>
      <div className="px-3 py-2 text-[11px]">
        {isLoading ? (
          <p className="text-muted">Loading AI-BOM…</p>
        ) : isError || !data ? (
          <p className="italic text-faint">AI-BOM not configured.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-faint">Pack</dt>
            <dd className="text-ink">{data.packId}@{data.packVersion}</dd>
            <dt className="text-faint">Model</dt>
            <dd className="text-ink">{data.model ? `${data.model.provider}/${data.model.model}` : "—"}</dd>
            <dt className="text-faint">Conformance</dt>
            <dd className="text-ink">{data.conformance.passed ? "passed" : "FAILED"} ({data.conformance.passedCount}/{data.conformance.total})</dd>
            <dt className="text-faint">Health</dt>
            <dd className="text-ink">{data.healthTier} ({data.healthScore.score}/{data.healthScore.maxScore})</dd>
            <dt className="text-faint">Fingerprint</dt>
            <dd className="font-mono text-ink">{data.fingerprint.slice(0, 16)}…</dd>
            <dt className="text-faint">Frameworks</dt>
            <dd className="text-ink">{data.frameworks.join(", ")}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
