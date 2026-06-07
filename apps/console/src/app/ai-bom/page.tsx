"use client";

import { useEffect, useMemo, useState } from "react";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import {
  useAiBomById,
  useAiBomList,
} from "@/hooks/useAiBomExplorer";
import { truncateHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * AI-BOM Explorer (ADR-130) — a two-pane browser over every installed Pack's
 * AI Bill-of-Materials.
 *
 *   Left rail  — pack summaries from `pack.aiBomList` (packId@version, health
 *                tier, conformance dot, signed badge, truncated bomDigest).
 *   Detail     — the full BOM for the selected pack from `pack.aiBomById`:
 *                model, intents/signals/basisCodes, tools, vector stores (rag),
 *                prompt hashes, guardrails, conformance, health, full
 *                fingerprint + bomDigest, versions, plus a "Download JSON".
 *
 * All BOM fields are author-controlled but non-sensitive (hashes + component
 * references, never contents — ADR-127). They are rendered as inert plain text
 * / <code> only; no dangerouslySetInnerHTML, and export is plain JSON.stringify.
 */

const TOOL_COLUMNS: readonly DataTableColumn[] = [
  { key: "name", header: "Name" },
  { key: "description", header: "Description" },
  { key: "version", header: "Version" },
  { key: "schemaDigest", header: "Schema digest" },
];

const RAG_COLUMNS: readonly DataTableColumn[] = [
  { key: "name", header: "Name" },
  { key: "kind", header: "Kind" },
  { key: "version", header: "Version" },
  { key: "embeddingModel", header: "Embedding model" },
];

const PROMPT_COLUMNS: readonly DataTableColumn[] = [
  { key: "id", header: "Prompt id" },
  { key: "sha256", header: "SHA-256" },
];

export default function AiBomExplorerPage() {
  const list = useAiBomList();
  const boms = list.data?.boms ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default the selection to the first rail item once the list loads (and
  // re-select if the current selection vanishes from the list).
  useEffect(() => {
    if (boms.length === 0) return;
    if (selectedId === null || !boms.some((b) => b.packId === selectedId)) {
      setSelectedId(boms[0]!.packId);
    }
  }, [boms, selectedId]);

  const detail = useAiBomById(selectedId);

  const listEmpty = boms.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          AI-BOM Explorer · AI Bill-of-Materials
        </h1>
        <span className="text-[10px] text-faint">ADR-130</span>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Left rail — pack list. */}
        <section className="flex flex-col gap-2">
          <header className="text-[10px] uppercase tracking-section text-faint">
            Packs
          </header>
          <AsyncBoundary
            isLoading={list.isLoading}
            isError={list.isError}
            isEmpty={listEmpty}
            emptyFallback={
              <EmptyState title="AI-BOM not configured." hint="Wire ctx.aiBoms in the admin route handler." />
            }
            errorMessage="AI-BOM list unavailable."
            onRetry={() => void list.refetch()}
          >
            <ul
              role="listbox"
              aria-label="Installed packs"
              data-testid="aibom-rail"
              className="flex flex-col gap-1"
            >
              {boms.map((b) => {
                const active = b.packId === selectedId;
                return (
                  <li key={b.packId} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedId(b.packId)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-sm border px-2.5 py-2 text-left transition-colors",
                        active
                          ? "border-ink/30 bg-edge text-ink"
                          : "border-edge bg-panel/40 text-muted hover:border-ink/20 hover:text-ink",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink">
                          {b.packId}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-faint">
                          @{b.packVersion}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-[10px]">
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            b.conformance.passed ? "bg-emerald-400" : "bg-red-400",
                          )}
                        />
                        <span className="uppercase tracking-section text-faint">
                          {b.healthTier}
                        </span>
                        <span
                          className={cn(
                            "ml-auto uppercase tracking-section",
                            b.signed ? "text-emerald-300" : "text-faint",
                          )}
                        >
                          {b.signed ? "signed" : "unsigned"}
                        </span>
                      </span>
                      <code className="truncate font-mono text-[10px] text-faint">
                        {truncateHash(b.bomDigest)}
                      </code>
                    </button>
                  </li>
                );
              })}
            </ul>
          </AsyncBoundary>
        </section>

        {/* Detail pane. */}
        <section className="flex flex-col gap-4">
          <AsyncBoundary
            isLoading={detail.isLoading || (selectedId !== null && !detail.data && !detail.isError)}
            isError={detail.isError}
            isEmpty={selectedId === null}
            emptyFallback={<EmptyState title="Select a pack to view its AI-BOM." />}
            errorMessage="Couldn't load this AI-BOM."
            onRetry={() => void detail.refetch()}
          >
            {detail.data ? <BomDetail bom={detail.data} /> : null}
          </AsyncBoundary>
        </section>
      </div>
    </div>
  );
}

type Bom = NonNullable<ReturnType<typeof useAiBomById>["data"]>;

function BomDetail({ bom }: { bom: Bom }) {
  function download() {
    const blob = new Blob([JSON.stringify(bom, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bom.packId}-${bom.packVersion}-aibom.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toolRows = useMemo(
    () =>
      bom.tools.map((t, i) => ({
        _key: `${t.name}:${i}`,
        name: <span className="text-ink">{t.name}</span>,
        description: <span className="text-muted">{t.description ?? "—"}</span>,
        version: <span className="tabular-nums text-muted">{t.version ?? "—"}</span>,
        schemaDigest: (
          <code className="font-mono text-faint">
            {t.schemaDigest ? truncateHash(t.schemaDigest) : "—"}
          </code>
        ),
      })),
    [bom.tools],
  );

  const ragRows = useMemo(
    () =>
      bom.rag.map((r, i) => ({
        _key: `${r.name}:${i}`,
        name: <span className="text-ink">{r.name}</span>,
        kind: <span className="text-muted">{r.kind ?? "—"}</span>,
        version: <span className="tabular-nums text-muted">{r.version ?? "—"}</span>,
        embeddingModel: <span className="text-muted">{r.embeddingModel ?? "—"}</span>,
      })),
    [bom.rag],
  );

  const promptRows = useMemo(
    () =>
      bom.promptHashes.map((p, i) => ({
        _key: `${p.id}:${i}`,
        id: <span className="text-ink">{p.id}</span>,
        sha256: <code className="font-mono text-faint">{truncateHash(p.sha256)}</code>,
      })),
    [bom.promptHashes],
  );

  const guardrailsByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of bom.guardrails) {
      const list = map.get(g.category) ?? [];
      list.push(g.basisCode);
      map.set(g.category, list);
    }
    return [...map.entries()];
  }, [bom.guardrails]);

  return (
    <div className="flex flex-col gap-4" data-testid="aibom-detail">
      {/* Header. */}
      <header className="rounded-sm border border-edge bg-panel/40 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            tabIndex={-1}
            className="text-sm font-medium text-ink"
            data-testid="aibom-detail-heading"
          >
            {bom.packId}
            <span className="ml-1 text-faint">@{bom.packVersion}</span>
          </h2>
          <button
            type="button"
            onClick={download}
            className="rounded-sm border border-edge px-2 py-1 text-[10px] uppercase tracking-section text-emerald-300 hover:border-emerald-400/40"
          >
            Download JSON
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
          <Field label="Contract" value={bom.contract} />
          <Field label="Kernel min" value={bom.kernelMinVersion} />
          <Field label="BOM version" value={bom.bomVersion} />
          <Field label="Generated at" value={bom.generatedAt} />
          <Field label="Frameworks" value={bom.frameworks.join(", ")} />
          <Field
            label="Signed"
            value={bom.signature ? "yes" : "no"}
            emphasize={!bom.signature}
          />
          <FieldCode label="Fingerprint" value={bom.fingerprint} />
          <FieldCode label="BOM digest" value={bom.bomDigest} />
        </dl>
      </header>

      {/* Model. */}
      <Section title="Model">
        {bom.model ? (
          <p className="text-[11px] text-ink">
            {bom.model.provider}/{bom.model.model}
            {bom.model.modelVersion ? ` @${bom.model.modelVersion}` : ""}
          </p>
        ) : (
          <p className="text-[11px] italic text-faint">Not declared.</p>
        )}
      </Section>

      {/* Health + conformance. */}
      <Section title="Conformance & health">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4">
          <Field
            label="Conformance"
            value={`${bom.conformance.passed ? "passed" : "FAILED"} (${bom.conformance.passedCount}/${bom.conformance.total})`}
            emphasize={!bom.conformance.passed}
          />
          <Field label="Failed" value={String(bom.conformance.failedCount)} />
          <Field
            label="Health"
            value={`${bom.healthTier} (${bom.healthScore.score}/${bom.healthScore.maxScore})`}
          />
          <FieldCode label="Report digest" value={bom.conformance.reportDigest} />
        </dl>
      </Section>

      {/* Intents / signals / basis codes. */}
      <Section title="Intents, signals & basis codes">
        <div className="flex flex-col gap-2">
          <ChipList label="Intents" items={bom.intents} />
          <ChipList label="Signals" items={bom.signals} />
          <ChipList label="Basis codes" items={bom.basisCodes} />
        </div>
      </Section>

      {/* Tools. */}
      <Section title="Tools">
        {bom.tools.length > 0 ? (
          <DataTable
            caption="Declared tools"
            columns={TOOL_COLUMNS}
            rows={toolRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-faint">None declared.</p>
        )}
      </Section>

      {/* Vector stores (RAG). */}
      <Section title="Vector stores (RAG)">
        {bom.rag.length > 0 ? (
          <DataTable
            caption="Declared retrieval / vector stores"
            columns={RAG_COLUMNS}
            rows={ragRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-faint">None declared.</p>
        )}
      </Section>

      {/* Prompt hashes. */}
      <Section title="Prompt hashes">
        {bom.promptHashes.length > 0 ? (
          <DataTable
            caption="Declared prompt-template hashes (hashes only, never contents)"
            columns={PROMPT_COLUMNS}
            rows={promptRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-faint">No declared prompt templates.</p>
        )}
      </Section>

      {/* Guardrails. */}
      <Section title="Guardrails">
        {guardrailsByCategory.length > 0 ? (
          <div className="flex flex-col gap-2">
            {guardrailsByCategory.map(([category, codes]) => (
              <div key={category} className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-section text-faint">
                  {category}
                </span>
                <ChipList label={category} items={codes} hideLabel />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] italic text-faint">None declared.</p>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-edge bg-panel/40 p-3">
      <header className="mb-2 text-[10px] uppercase tracking-section text-faint">
        {title}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-edge/50 py-0.5">
      <dt className="text-faint">{label}</dt>
      <dd className={cn("text-right", emphasize ? "text-red-300" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function FieldCode({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-edge/50 py-0.5">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right">
        <code
          className="break-all font-mono text-ink"
          title={value}
          data-testid={`field-code-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </code>
      </dd>
    </div>
  );
}

function ChipList({
  label,
  items,
  hideLabel = false,
}: {
  label: string;
  items: ReadonlyArray<string>;
  hideLabel?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideLabel ? (
        <span className="mr-1 text-[10px] uppercase tracking-section text-faint">
          {label}
        </span>
      ) : null}
      {items.length > 0 ? (
        items.map((item) => (
          <code
            key={item}
            className="rounded-sm border border-edge bg-canvas/40 px-1.5 py-0.5 font-mono text-[10px] text-ink"
          >
            {item}
          </code>
        ))
      ) : (
        <span className="text-[11px] italic text-faint">None</span>
      )}
    </div>
  );
}
