import type { GuardManifestNodeParsed } from "@adjudicate/admin-sdk";
import { guardKindInfo, guardKindText } from "@/lib/guard-colors";
import { GuardDescriptionDetail } from "@/components/playground/GuardDescriptionDetail";
import { DecisionChip } from "./DecisionChip";
import type { DiffStatus } from "@/lib/manifest-diff";

const DIFF_RING: Record<DiffStatus, string> = {
  added: "border-l-2 border-emerald-500/70",
  removed: "border-l-2 border-red-500/70 opacity-60 line-through",
  changed: "border-l-2 border-amber-500/70",
  unchanged: "",
};

/**
 * A guard leaf — the provenance node. Answers, for one rule: what it enforces
 * (structured GuardDescription), what decision it can produce, where it's
 * defined (path:line), and who/when (author/since). Unannotated guards render
 * via their Function.name fallback and are flagged, never dropped.
 */
export function RuleNode({
  guard,
  fireCount,
  diffStatus,
}: {
  guard: GuardManifestNodeParsed;
  fireCount?: number;
  diffStatus?: DiffStatus;
}) {
  const kind = guard.description?.kind;
  const info = guardKindInfo(kind);
  const ring = diffStatus ? DIFF_RING[diffStatus] : "";

  return (
    <div className={`py-1 pl-2 ${ring}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono text-[9px] uppercase tracking-section text-faint">
          {guard.phase}[{guard.index}]
        </span>
        <span className={`font-mono text-[12px] ${guardKindText(kind)}`}>{guard.name}</span>
        <span className="rounded-sm border border-edge px-1 py-px font-mono text-[9px] text-faint">
          {info.label}
        </span>
        {guard.emits ? <DecisionChip kind={guard.emits} /> : null}
        {guard.adopterInjected ? (
          <span className="rounded-sm border border-sky-500/40 bg-sky-500/10 px-1 py-px text-[9px] text-sky-300">
            adopter-injected
          </span>
        ) : null}
        {guard.appliesToKinds && guard.appliesToKinds.length > 0 ? (
          <span className="font-mono text-[9px] text-faint">
            only: {guard.appliesToKinds.join(", ")}
          </span>
        ) : null}
        {fireCount !== undefined ? (
          <span
            className="ml-auto rounded-sm bg-edge/40 px-1 py-px font-mono text-[9px] text-muted"
            title="Guard fire count in the selected window"
          >
            fired {fireCount}×
          </span>
        ) : null}
      </div>

      <GuardDescriptionDetail kind={kind} description={guard.description as Record<string, unknown> | undefined} />

      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-0.5 text-[10px] text-faint">
        {guard.sourceLocation ? (
          <span className="font-mono" title="Defined at">
            {shortPath(guard.sourceLocation.file)}:{guard.sourceLocation.line}
          </span>
        ) : null}
        {guard.author ? <span>· {guard.author}</span> : null}
        {guard.since ? <span>· since {guard.since}</span> : null}
        {guard.anonymous ? (
          <span className="italic">· no metadata — name is the {guard.nameSource} fallback</span>
        ) : guard.nameSource === "function" ? (
          <span className="italic">· name from Function.name (no GuardMetadata)</span>
        ) : null}
      </div>
    </div>
  );
}

function shortPath(file: string): string {
  // Trim to the workspace-relative tail (…/packages/pack-x/src/policies.ts).
  const idx = file.indexOf("packages/");
  return idx >= 0 ? file.slice(idx) : file.split("/").slice(-2).join("/");
}
