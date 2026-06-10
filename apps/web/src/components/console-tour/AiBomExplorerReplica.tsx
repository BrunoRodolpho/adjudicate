"use client";

import { useState, type ReactNode } from "react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { RevealStack, RevealStackItem } from "./ChartReveal";
import { DataTable, type DataTableColumn } from "@/components/console-kit/a11y/DataTable";
import {
  AI_BOM_TRANSPARENCY_SAMPLE,
  type AiBomTransparencySample,
} from "@/lib/transparency-fixtures";
import { cn } from "@/lib/cn";

/**
 * AiBomExplorerReplica — a faithful replica of the operator console's
 * AI-BOM Explorer (ADR-130), mirroring apps/console/src/app/ai-bom/page.tsx.
 *
 * CLIENT component. Interactivity is purely local React state over the committed
 * fixtures (no network, no clock, no RNG, no admin/DB). It renders inside
 * {@link ConsoleChrome} (the reviewed honesty boundary — the standing
 * "Illustrative replica · sample data" label is non-removable) over a two-pane
 * layout:
 *
 *   Left rail  — every reference pack's BOM summary (health dot, conformance,
 *                signed/unsigned, truncated bomDigest), each a real <button>.
 *                Clicking (or keyboard-activating) a pack selects it; the
 *                selected pack carries aria-current and a focus-visible ring.
 *   Detail     — the full BOM for the selected pack: model, conformance/health,
 *                intents/signals/basis chips, a tools DataTable, vector stores,
 *                prompt HASHES (SHA-256 only, never prompt text), and guardrails.
 *
 * The only data ever rendered is the committed, clearly-illustrative
 * {@link AI_BOM_TRANSPARENCY_SAMPLE}. Every BOM field is non-sensitive BY DESIGN
 * (hashes + component references, never contents — ADR-127): no raw prompts, no
 * retrieved documents, no tool invocations, no signature bytes. There is no
 * clock, RNG, network, or admin/DB access in this path — the data is fixed
 * literals, so the surface renders identically everywhere.
 *
 * The console's live "Download JSON" affordance (a Blob export needing a client)
 * is intentionally rendered here as an inert note: this replica is a static
 * display, and there is no live BOM to export.
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

/** Truncate a hash to `head…tail` for dense display. Pure, no deps. */
function truncateHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function AiBomExplorerReplica({
  className,
}: {
  readonly className?: string;
}) {
  const boms = AI_BOM_TRANSPARENCY_SAMPLE;
  // Selection is local client state. The first reference pack is the initial
  // selection; clicking a rail item selects another. Data is the committed
  // fixture only — no network, clock, or RNG.
  const [selectedPackId, setSelectedPackId] = useState<string>(boms[0]!.packId);
  const selected =
    boms.find((b) => b.packId === selectedPackId) ?? boms[0]!;

  return (
    <ConsoleChrome caption="ai-bom · localhost:5180" className={className}>
      <div className="flex flex-col gap-4" data-testid="aibom-replica">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            AI-BOM Explorer · AI Bill-of-Materials
          </h2>
          <span className="text-[10px] text-console-muted">ADR-130</span>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          {/* Left rail — pack list. */}
          <section className="flex flex-col gap-2">
            <header className="text-[10px] uppercase tracking-section text-console-muted">
              Packs
            </header>
            <ul
              aria-label="Installed packs"
              data-testid="aibom-rail"
              className="flex flex-col gap-1"
            >
              {boms.map((b) => (
                <PackRailItem
                  key={b.packId}
                  bom={b}
                  active={b.packId === selected.packId}
                  onSelect={() => setSelectedPackId(b.packId)}
                />
              ))}
            </ul>
          </section>

          {/* Detail pane. */}
          <section className="flex flex-col gap-4">
            <BomDetail bom={selected} />
          </section>
        </div>
      </div>
    </ConsoleChrome>
  );
}

function PackRailItem({
  bom,
  active,
  onSelect,
}: {
  readonly bom: AiBomTransparencySample;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  // The committed transparency sample carries no live `signature` object, so the
  // public posture is honestly "unsigned" (ADR-130: the signature value is never
  // published).
  const signed = false;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={`Show AI-BOM for ${bom.packId}`}
        className={cn(
          "flex w-full flex-col gap-1 rounded-sm border px-2.5 py-2 text-left",
          "motion-safe:transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
          active
            ? "border-console-ink/30 bg-console-edge text-console-ink"
            : "border-console-edge bg-console-panel/40 text-console-muted hover:bg-console-edge/40",
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-console-ink">
            {bom.packId}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-console-muted">
            @{bom.packVersion}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10px]">
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              bom.conformance.passed ? "bg-emerald-400" : "bg-red-400",
            )}
          />
          <span className="uppercase tracking-section text-console-muted">
            {bom.healthTier}
          </span>
          <span
            className={cn(
              "ml-auto uppercase tracking-section",
              signed ? "text-emerald-300" : "text-console-muted",
            )}
          >
            {signed ? "signed" : "unsigned"}
          </span>
        </span>
        <code className="truncate font-mono text-[10px] text-console-muted">
          {truncateHash(bom.bomDigest)}
        </code>
      </button>
    </li>
  );
}

function BomDetail({ bom }: { readonly bom: AiBomTransparencySample }) {
  const toolRows = bom.tools.map((t, i) => ({
    _key: `${t.name}:${i}`,
    name: <span className="text-console-ink">{t.name}</span>,
    description: <span className="text-console-muted">{t.description ?? "—"}</span>,
    version: (
      <span className="tabular-nums text-console-muted">{t.version ?? "—"}</span>
    ),
    schemaDigest: (
      <code className="font-mono text-console-muted">
        {t.schemaDigest ? truncateHash(t.schemaDigest) : "—"}
      </code>
    ),
  }));

  const ragRows = bom.rag.map((r, i) => ({
    _key: `${r.name}:${i}`,
    name: <span className="text-console-ink">{r.name}</span>,
    kind: <span className="text-console-muted">{r.kind ?? "—"}</span>,
    version: (
      <span className="tabular-nums text-console-muted">{r.version ?? "—"}</span>
    ),
    embeddingModel: (
      <span className="text-console-muted">{r.embeddingModel ?? "—"}</span>
    ),
  }));

  const promptRows = bom.promptHashes.map((p, i) => ({
    _key: `${p.id}:${i}`,
    id: <span className="text-console-ink">{p.id}</span>,
    sha256: (
      <code className="font-mono text-console-muted">{truncateHash(p.sha256)}</code>
    ),
  }));

  // Group guardrail basis codes by category (deterministic insertion order).
  const guardrailsByCategory = (() => {
    const map = new Map<string, string[]>();
    for (const g of bom.guardrails) {
      const list = map.get(g.category) ?? [];
      list.push(g.basisCode);
      map.set(g.category, list);
    }
    return [...map.entries()];
  })();

  return (
    <RevealStack className="flex flex-col gap-4" data-testid="aibom-detail">
      {/* Header. */}
      <RevealStackItem className="rounded-sm bg-console-panel/40 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="text-sm font-medium text-console-ink"
            data-testid="aibom-detail-heading"
          >
            {bom.packId}
            <span className="ml-1 text-console-muted">@{bom.packVersion}</span>
          </h3>
          {/* The live console exports the BOM via a client-side Blob download.
              This static replica has no live BOM, so the affordance is an inert
              note rather than a no-op control. */}
          <span
            className="rounded-sm border border-console-edge px-2 py-1 text-[10px] uppercase tracking-section text-console-muted"
            title="The live console exports the BOM as JSON. This replica is a static display, so export is illustrative only."
          >
            Download JSON · illustrative
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
          <Field label="Contract" value={bom.contract} />
          <Field label="Kernel min" value={bom.kernelMinVersion} />
          <Field label="BOM version" value={bom.bomVersion} />
          <Field label="Generated at" value={bom.generatedAt} />
          <Field label="Frameworks" value={bom.frameworks.join(", ")} />
          {/* The committed sample omits the live signature object, so the public
              posture is honestly "no". */}
          <Field label="Signed" value="no" emphasize />
          <FieldCode label="Fingerprint" value={bom.fingerprint} />
          <FieldCode label="BOM digest" value={bom.bomDigest} />
        </dl>
      </RevealStackItem>

      {/* Model. */}
      <RevealStackItem>
        <DetailSection
          title="Model"
          description="The LLM powering this pack — the provider and model the kernel adjudicates around."
        >
        {bom.model ? (
          <p className="text-[11px] text-console-ink">
            {bom.model.provider}/{bom.model.model}
            {bom.model.modelVersion ? ` @${bom.model.modelVersion}` : ""}
          </p>
        ) : (
          <p className="text-[11px] italic text-console-muted">Not declared.</p>
        )}
        </DetailSection>
      </RevealStackItem>

      {/* Health + conformance. */}
      <RevealStackItem>
        <DetailSection
          title="Conformance & health"
          description="Pass/fail and score against this pack's declared guardrails — its readiness signal."
        >
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
        </DetailSection>
      </RevealStackItem>

      {/* Intents / signals / basis codes. */}
      <RevealStackItem>
        <DetailSection
          title="Intents, signals & basis codes"
          description="The actions this pack governs, the signals it reads, and the basis codes it can cite."
        >
        <div className="flex flex-col gap-2">
          <ChipList label="Intents" items={bom.intents} />
          <ChipList label="Signals" items={bom.signals} />
          <ChipList label="Basis codes" items={bom.basisCodes} />
        </div>
        </DetailSection>
      </RevealStackItem>

      {/* Tools. */}
      <RevealStackItem>
        <DetailSection
          title="Tools"
          description="Side-effecting tools the pack can call — each with a schema digest for tamper-evidence."
        >
        {bom.tools.length > 0 ? (
          <DataTable
            caption="Declared tools"
            columns={TOOL_COLUMNS}
            rows={toolRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-console-muted">None declared.</p>
        )}
        </DetailSection>
      </RevealStackItem>

      {/* Vector stores (RAG). */}
      <RevealStackItem>
        <DetailSection
          title="Vector stores (RAG)"
          description="Retrieval sources that ground the model's answers, with their embedding models."
        >
        {bom.rag.length > 0 ? (
          <DataTable
            caption="Declared retrieval / vector stores"
            columns={RAG_COLUMNS}
            rows={ragRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-console-muted">None declared.</p>
        )}
        </DetailSection>
      </RevealStackItem>

      {/* Prompt hashes — SHA-256 only, never prompt text. */}
      <RevealStackItem>
        <DetailSection
          title="Prompt hashes"
          description="SHA-256 fingerprints of the pack's prompt templates — proof of what shipped, never the prompt text."
        >
        {bom.promptHashes.length > 0 ? (
          <DataTable
            caption="Declared prompt-template hashes (hashes only, never contents)"
            columns={PROMPT_COLUMNS}
            rows={promptRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        ) : (
          <p className="text-[11px] italic text-console-muted">
            No declared prompt templates.
          </p>
        )}
        </DetailSection>
      </RevealStackItem>

      {/* Guardrails. */}
      <RevealStackItem>
        <DetailSection
          title="Guardrails"
          description="The safeguard rules active in this pack, grouped by category — what it actually enforces."
        >
        {guardrailsByCategory.length > 0 ? (
          <div className="flex flex-col gap-2">
            {guardrailsByCategory.map(([category, codes]) => (
              <div key={category} className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-section text-console-muted">
                  {category}
                </span>
                <ChipList label={category} items={codes} hideLabel />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] italic text-console-muted">None declared.</p>
        )}
        </DetailSection>
      </RevealStackItem>
    </RevealStack>
  );
}

function DetailSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  /** One-line, plain-language note on why this section matters (a11y + clarity). */
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-sm bg-console-panel/40 p-3">
      <header className="mb-2 flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-section text-console-muted">
          {title}
        </span>
        {description ? (
          <span className="text-[10px] leading-relaxed text-console-muted">
            {description}
          </span>
        ) : null}
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
  readonly label: string;
  readonly value: string;
  readonly emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-console-edge/50 py-0.5">
      <dt className="text-console-muted">{label}</dt>
      <dd className={cn("text-right", emphasize ? "text-red-300" : "text-console-ink")}>
        {value}
      </dd>
    </div>
  );
}

function FieldCode({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-console-edge/50 py-0.5">
      <dt className="text-console-muted">{label}</dt>
      <dd className="text-right">
        <code className="break-all font-mono text-console-ink" title={value}>
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
  readonly label: string;
  readonly items: ReadonlyArray<string>;
  readonly hideLabel?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideLabel ? (
        <span className="mr-1 text-[10px] uppercase tracking-section text-console-muted">
          {label}
        </span>
      ) : null}
      {items.length > 0 ? (
        items.map((item) => (
          <code
            key={item}
            className="rounded-sm border border-console-edge bg-console-canvas/40 px-1.5 py-0.5 font-mono text-[10px] text-console-ink"
          >
            {item}
          </code>
        ))
      ) : (
        <span className="text-[11px] italic text-console-muted">None</span>
      )}
    </div>
  );
}
