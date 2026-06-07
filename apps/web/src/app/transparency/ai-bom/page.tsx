import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/sections/FinalCTA";
import {
  projectAiBomTransparency,
  type PublicAiBom,
} from "@/lib/ai-bom-transparency";
import { AI_BOM_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";

export const metadata: Metadata = {
  title: "AI bill-of-materials · Transparency · adjudicate",
  description:
    "Public, read-only AI bills-of-materials for the reference packs: model, tools, vector stores, prompt hashes, guardrails, conformance, and fingerprints — EU AI Act / NIST AI RMF aligned. Illustrative sample data; hashes and references only, never contents.",
};

/**
 * /transparency/ai-bom — public, read-only AI-BOM viewer (ADR-130).
 *
 * Server component. apps/web is public and has no kernel runtime, so this
 * renders from a committed ILLUSTRATIVE fixture, projected through the
 * `sanitizeBomForPublic` ALLOWLIST. The BOM is non-sensitive by design — a
 * manifest of hashes and component references, never contents (no raw prompts,
 * no retrieved documents, no signature value). All fields are rendered as inert
 * plain text / <code>; no dangerouslySetInnerHTML.
 */
export default function AiBomTransparencyPage() {
  const boms = projectAiBomTransparency(AI_BOM_TRANSPARENCY_SAMPLE);

  return (
    <main>
      <header className="bg-canvas pb-6 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/transparency"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> Back to transparency
          </Link>
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            Public · transparency · AI bill-of-materials
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            What goes into each pack.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            A machine-readable manifest of the AI components in each reference
            pack — model, tools, vector stores, prompt hashes, guardrails, and
            conformance. EU AI Act (Art. 11) and NIST AI RMF aligned.
          </p>
        </div>
      </header>

      <section aria-labelledby="note-heading" className="bg-canvas pb-8">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="note-heading" className="sr-only">
            About this data
          </h2>
          <div className="max-w-3xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              Illustrative sample · hashes and references only
            </p>
            <p className="mt-2 text-sm text-muted">
              A bill-of-materials is a{" "}
              <span className="text-ink">manifest of components and hashes,
              not contents</span>. These figures are{" "}
              <span className="text-ink">illustrative sample data</span> for the
              shipped reference packs, not a live deployment. Prompt entries are{" "}
              <span className="text-ink">SHA-256 hashes of declared
              templates</span> — never the template text. Vector-store and tool
              entries are <span className="text-ink">references</span> (names,
              kinds, schema digests) — never retrieved documents or invocations.
              No raw prompts, no contents, no signature values ever appear here.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="boms-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            id="boms-heading"
            className="text-xs uppercase tracking-section text-muted"
          >
            Reference pack manifests
          </h2>

          {boms.length === 0 ? (
            <p className="mt-4 text-sm italic text-faint">
              No published manifests yet.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-6">
              {boms.map((bom) => (
                <BomCard key={`${bom.packId}@${bom.packVersion}`} bom={bom} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

function BomCard({ bom }: { bom: PublicAiBom }) {
  return (
    <article className="overflow-hidden rounded-sm border border-edge bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-ink">
            {bom.packId}
            <span className="ml-1.5 text-muted">@{bom.packVersion}</span>
          </h3>
          <p className="mt-1 text-xs text-muted">
            contract {bom.contract} · kernel {bom.kernelMinVersion} · BOM{" "}
            {bom.bomVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bom.frameworks.map((f) => (
            <span
              key={f}
              className="rounded-sm border border-edge px-2 py-0.5 text-[10px] uppercase tracking-section text-muted"
            >
              {f}
            </span>
          ))}
          <span
            className={
              bom.signed
                ? "rounded-sm border border-edge px-2 py-0.5 text-[10px] uppercase tracking-section text-ink"
                : "rounded-sm border border-edge px-2 py-0.5 text-[10px] uppercase tracking-section text-faint"
            }
          >
            {bom.signed ? "signed" : "unsigned"}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-px bg-edge md:grid-cols-2">
        <Cell title="Model">
          {bom.model ? (
            <p className="text-sm text-ink">
              {bom.model.provider}/{bom.model.model}
              {bom.model.modelVersion ? ` @${bom.model.modelVersion}` : ""}
            </p>
          ) : (
            <p className="text-sm italic text-faint">Not declared.</p>
          )}
        </Cell>

        <Cell title="Conformance & health">
          <p className="text-sm text-ink">
            {bom.conformance.passed ? "Passed" : "FAILED"} (
            {bom.conformance.passedCount}/{bom.conformance.total}) · health{" "}
            {bom.healthTier} ({bom.healthScore.score}/{bom.healthScore.maxScore})
          </p>
        </Cell>

        <Cell title="Intents">
          <ChipList items={bom.intents} />
        </Cell>

        <Cell title="Signals">
          <ChipList items={bom.signals} />
        </Cell>

        <Cell title="Basis codes">
          <ChipList items={bom.basisCodes} />
        </Cell>

        <Cell title="Guardrails">
          <ChipList items={bom.guardrails.map((g) => g.basisCode)} />
        </Cell>

        <Cell title="Tools">
          {bom.tools.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {bom.tools.map((t) => (
                <li key={t.name} className="text-ink">
                  {t.name}
                  {t.description ? (
                    <span className="text-muted"> — {t.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-faint">None declared.</p>
          )}
        </Cell>

        <Cell title="Vector stores (RAG)">
          {bom.rag.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {bom.rag.map((r) => (
                <li key={r.name} className="text-ink">
                  {r.name}
                  {r.kind ? <span className="text-muted"> · {r.kind}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-faint">None declared.</p>
          )}
        </Cell>

        <Cell title={`Prompt hashes (${bom.promptHashes.length})`}>
          {bom.promptHashes.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {bom.promptHashes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="text-ink">{p.id}</span>
                  <code className="break-all font-mono text-xs text-muted">
                    {p.sha256}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-faint">
              No declared prompt templates.
            </p>
          )}
        </Cell>

        <Cell title="Fingerprint">
          <code className="break-all font-mono text-xs text-muted">
            {bom.fingerprint}
          </code>
        </Cell>

        <Cell title="BOM digest">
          <code className="break-all font-mono text-xs text-muted">
            {bom.bomDigest}
          </code>
        </Cell>
      </div>

      <footer className="border-t border-edge px-5 py-3 text-xs text-faint">
        Generated at {bom.generatedAt} (illustrative). The BOM digest is
        recomputable from this manifest, so anyone can verify it hasn&apos;t been
        tampered with.
      </footer>
    </article>
  );
}

function Cell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <h4 className="mb-1.5 text-[10px] uppercase tracking-section text-muted">
        {title}
      </h4>
      {children}
    </div>
  );
}

function ChipList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p className="text-sm italic text-faint">None.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <code
          key={item}
          className="rounded-sm border border-edge bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink"
        >
          {item}
        </code>
      ))}
    </div>
  );
}
