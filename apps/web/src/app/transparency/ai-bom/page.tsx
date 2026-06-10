import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  projectAiBomTransparency,
  type PublicAiBom,
} from "@/lib/ai-bom-transparency";
import { AI_BOM_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import {
  RevealArticle,
  RevealSection,
} from "@/components/transparency/RevealArticle";

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
            Know exactly what goes into each pack.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            An AI bill-of-materials answers a compliance question in one place:{" "}
            <span className="text-ink">
              what model, tools, data, and guardrails does this pack actually
              run?
            </span>{" "}
            Each card is a machine-readable manifest — model, tools, vector
            stores, prompt hashes, guardrails, and conformance — aligned to{" "}
            EU AI Act (Art. 11) and the NIST AI RMF, so an auditor can verify the
            pack without trusting a screenshot.
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
            <p className="mt-4 text-sm italic text-muted">
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
    </main>
  );
}

/**
 * Semantic tint for a health tier. The tier is a non-sensitive label already in
 * the public projection; mapping it to a colour just makes the card scannable.
 * Unknown tiers fall back to a neutral muted style.
 */
function healthTierTone(tier: string): string {
  switch (tier.toLowerCase()) {
    case "gold":
      return "border-emerald-500/40 text-emerald-300";
    case "silver":
      return "border-teal-500/40 text-teal-300";
    case "bronze":
      return "border-amber-500/40 text-amber-300";
    default:
      return "border-edge text-muted";
  }
}

function BomCard({ bom }: { bom: PublicAiBom }) {
  return (
    <RevealArticle className="overflow-hidden rounded-sm border border-edge bg-surface">
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
                : "rounded-sm border border-edge px-2 py-0.5 text-[10px] uppercase tracking-section text-muted"
            }
          >
            {bom.signed ? "signed" : "unsigned"}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-px bg-edge">
        {/* Model & conformance — "what runs, and does it pass the bar?" */}
        <RevealSection className="bg-surface px-5 py-4">
          <SectionHeader
            title="Model & conformance"
            hint="What LLM powers this pack, and whether it passes its declared compliance checks."
          />
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Model">
              {bom.model ? (
                <p className="text-sm text-ink">
                  {bom.model.provider}/{bom.model.model}
                  {bom.model.modelVersion ? ` @${bom.model.modelVersion}` : ""}
                </p>
              ) : (
                <p className="text-sm italic text-muted">Not declared.</p>
              )}
            </Field>
            <Field label="Conformance & health">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    bom.conformance.passed
                      ? "rounded-sm border border-emerald-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-emerald-300"
                      : "rounded-sm border border-red-500/50 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-red-300"
                  }
                >
                  {bom.conformance.passed ? "Passed" : "FAILED"}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {bom.conformance.passedCount}/{bom.conformance.total} checks
                </span>
                {bom.healthTier ? (
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-section ${healthTierTone(
                      bom.healthTier,
                    )}`}
                  >
                    {bom.healthTier} · {bom.healthScore.score}/
                    {bom.healthScore.maxScore}
                  </span>
                ) : null}
              </div>
            </Field>
          </div>
        </RevealSection>

        {/* Decision surface — intents / signals / basis the pack governs. */}
        <RevealSection className="bg-surface px-5 py-4">
          <SectionHeader
            title="Decision surface"
            hint="The actions this pack adjudicates, the signals it reads, and the basis codes its decisions carry."
          />
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label="Intents">
              <ChipList items={bom.intents} />
            </Field>
            <Field label="Signals">
              <ChipList items={bom.signals} />
            </Field>
            <Field label="Basis codes">
              <ChipList items={bom.basisCodes} />
            </Field>
          </div>
        </RevealSection>

        {/* Guardrails & tools — what the kernel enforces and can reach. */}
        <RevealSection className="bg-surface px-5 py-4">
          <SectionHeader
            title="Guardrails & tools"
            hint="The safeguard rules the kernel enforces, plus the tools and retrieval stores this pack is allowed to reach."
          />
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label="Guardrails">
              <ChipList items={bom.guardrails.map((g) => g.basisCode)} />
            </Field>
            <Field label="Tools">
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
                <p className="text-sm italic text-muted">None declared.</p>
              )}
            </Field>
            <Field label="Vector stores (RAG)">
              {bom.rag.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {bom.rag.map((r) => (
                    <li key={r.name} className="text-ink">
                      {r.name}
                      {r.kind ? (
                        <span className="text-muted"> · {r.kind}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic text-muted">None declared.</p>
              )}
            </Field>
          </div>
        </RevealSection>

        {/* Manifest hashes — the verifiable fingerprints. */}
        <RevealSection className="bg-surface px-5 py-4">
          <SectionHeader
            title="Manifest hashes"
            hint="Prompt-template fingerprints plus the pack and BOM digests — references only, never the underlying text."
          />
          <div className="flex flex-col gap-3">
            <Field label={`Prompt hashes (${bom.promptHashes.length})`}>
              {bom.promptHashes.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {bom.promptHashes.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-baseline gap-2"
                    >
                      <span className="text-ink">{p.id}</span>
                      <code className="break-all font-mono text-xs text-muted">
                        {p.sha256}
                      </code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic text-muted">
                  No declared prompt templates.
                </p>
              )}
            </Field>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Fingerprint">
                <code className="break-all font-mono text-xs text-muted">
                  {bom.fingerprint}
                </code>
              </Field>
              <Field label="BOM digest">
                <code className="break-all font-mono text-xs text-muted">
                  {bom.bomDigest}
                </code>
              </Field>
            </div>
          </div>
        </RevealSection>
      </div>

      <footer className="border-t border-edge px-5 py-3 text-xs text-muted">
        Generated at {bom.generatedAt} (illustrative). The BOM digest is
        recomputable from this manifest, so anyone can verify it hasn&apos;t been
        tampered with.
      </footer>
    </RevealArticle>
  );
}

function SectionHeader({
  title,
  hint,
}: {
  readonly title: string;
  readonly hint: string;
}) {
  return (
    <div className="mb-3">
      <h4 className="text-xs uppercase tracking-section text-ink">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <h5 className="mb-1.5 text-[10px] uppercase tracking-section text-muted">
        {label}
      </h5>
      {children}
    </div>
  );
}

function ChipList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p className="text-sm italic text-muted">None.</p>;
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
