import type {
  GuardManifestNodeParsed,
  IntentManifestNodeParsed,
} from "@adjudicate/admin-sdk";
import { Section } from "@/components/decision/Section";
import { DecisionChip } from "./DecisionChip";
import { RuleNode } from "./RuleNode";
import type { ManifestDiff } from "@/lib/manifest-diff";
import { guardKey, intentKey } from "@/lib/manifest-diff";

const TAINT_STYLE: Record<string, string> = {
  UNTRUSTED: "border-edge text-muted",
  TRUSTED: "border-amber-500/40 text-amber-300",
  SYSTEM: "border-violet-500/40 text-violet-300",
  unknown: "border-red-500/40 text-red-300",
};

/**
 * One intent kind: its taint floor, the tools that resolve to it, the
 * statically-inferred possible decisions, basis-code vocabulary, and — in
 * kernel evaluation order — every guard that gates it. Pack guards that are
 * NOT specific to this kind still apply (they self-filter at runtime); only
 * guards with a declared kind-scope are narrowed out.
 */
export function IntentNode({
  packId,
  intent,
  guards,
  basisCodes,
  fireCounts,
  diff,
}: {
  packId: string;
  intent: IntentManifestNodeParsed;
  guards: ReadonlyArray<GuardManifestNodeParsed>;
  basisCodes: ReadonlyArray<string>;
  fireCounts?: ReadonlyMap<string, number>;
  diff?: ManifestDiff;
}) {
  const status = diff?.intentStatus.get(intentKey(packId, intent.kind));
  const unguarded = guards.length === 0;

  const badge = (
    <span className="flex flex-wrap items-center gap-1">
      {intent.outcomes.possible.map((o) => (
        <DecisionChip key={o} kind={o} />
      ))}
    </span>
  );

  return (
    <Section title={intent.kind} badge={badge}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span
            className={`rounded-sm border px-1 py-px font-mono ${
              TAINT_STYLE[intent.taintFloor] ?? TAINT_STYLE.unknown
            }`}
            title="Minimum taint required to propose this kind"
          >
            taint ≥ {intent.taintFloor}
          </span>
          {intent.systemOnly ? (
            <span className="text-faint">system-only (not LLM-proposable)</span>
          ) : null}
          {status && status !== "unchanged" ? (
            <span className="font-mono uppercase tracking-section text-amber-300">{status}</span>
          ) : null}
        </div>

        {intent.tools.length > 0 ? (
          <div className="text-[10px] text-faint">
            tools:{" "}
            {intent.tools.map((t) => (
              <span key={t} className="mr-1 font-mono text-muted">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-section text-faint">
            Guards · state → taint → auth → business
          </div>
          {unguarded ? (
            <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              ⚠ No applicable guards — this kind reaches the policy default
              (<span className="font-mono">{intent.default}</span>) directly.
            </div>
          ) : (
            <div className="border-l border-edge">
              {guards.map((g) => {
                const fc = fireCounts?.get(g.name);
                const ds = diff?.guardStatus.get(guardKey(packId, g.name));
                return (
                  <RuleNode
                    key={`${g.phase}:${g.index}:${g.name}`}
                    guard={g}
                    {...(fc !== undefined ? { fireCount: fc } : {})}
                    {...(ds !== undefined ? { diffStatus: ds } : {})}
                  />
                );
              })}
            </div>
          )}
          {intent.outcomes.hasOpaqueGuards ? (
            <div className="mt-1 text-[10px] italic text-faint">
              Some guards have no structured description — the possible-outcome
              set above is a lower bound.
            </div>
          ) : null}
        </div>

        {basisCodes.length > 0 ? (
          <div className="text-[10px]">
            <span className="text-faint">basis codes: </span>
            {basisCodes.map((c) => (
              <span
                key={c}
                className="mr-1 rounded-sm border border-edge px-1 py-px font-mono text-muted"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
