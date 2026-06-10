import type { PolicyManifestParsed } from "@adjudicate/admin-sdk";
import { Section } from "@/components/decision/Section";
import { IntentNode } from "./IntentNode";
import type { ManifestDiff } from "@/lib/manifest-diff";

/**
 * The rule-provenance tree: Adopter → Pack → Intent kind → Guards.
 *
 * A collapsible containment outline (nested `<details>`), NOT a graph — the
 * user is tracing "everything this library enforces", which is a hierarchy.
 * Anonymous/unannotated guards are rendered (via Function.name), never dropped.
 */
export function PolicyTree({
  manifest,
  fireCounts,
  diff,
}: {
  manifest: PolicyManifestParsed;
  fireCounts?: ReadonlyMap<string, number>;
  diff?: ManifestDiff;
}) {
  const totalIntents = manifest.packs.reduce((n, p) => n + p.intents.length, 0);
  const totalGuards = manifest.packs.reduce((n, p) => n + p.guards.length, 0);

  return (
    <div className="rounded-sm border border-edge bg-panel/40">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-3 py-2">
        <span className="text-[12px] font-semibold text-ink">{manifest.adopter}</span>
        <span className="font-mono text-[10px] text-faint">
          {manifest.packs.length} packs · {totalIntents} intents · {totalGuards} guards
          {manifest.kernelVersion ? ` · kernel ${manifest.kernelVersion}` : ""} · digest{" "}
          {manifest.digest.slice(0, 12)}…
        </span>
      </header>

      {manifest.packs.length === 0 ? (
        <p className="px-3 py-4 text-[11px] italic text-faint">No packs match the current filters.</p>
      ) : (
        manifest.packs.map((pack) => {
          const packStatus = diff?.packStatus.get(pack.id);
          return (
            <Section
              key={pack.id}
              title={`${pack.id}  ·  v${pack.version}`}
              defaultOpen={manifest.packs.length <= 3}
              badge={
                <span className="flex items-center gap-2">
                  {packStatus && packStatus !== "unchanged" ? (
                    <span className="font-mono text-[9px] uppercase tracking-section text-amber-300">
                      {packStatus}
                    </span>
                  ) : null}
                  <span className="font-mono text-[10px] text-faint">
                    {pack.intents.length} intents
                  </span>
                </span>
              }
            >
              <div className="flex flex-col">
                {pack.intents.map((intent) => {
                  // Resolve applicable guards in kernel evaluation order (pack
                  // guards are already ordered state → auth → business).
                  const guards = pack.guards.filter((g) =>
                    intent.guardNames.includes(g.name),
                  );
                  return (
                    <IntentNode
                      key={intent.kind}
                      packId={pack.id}
                      intent={intent}
                      guards={guards}
                      basisCodes={pack.basisCodes}
                      {...(fireCounts ? { fireCounts } : {})}
                      {...(diff ? { diff } : {})}
                    />
                  );
                })}
              </div>
            </Section>
          );
        })
      )}
    </div>
  );
}
