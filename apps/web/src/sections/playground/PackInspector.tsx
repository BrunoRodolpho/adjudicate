"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { guardKindInfo } from "@/lib/guard-colors";
import { GuardDescriptionDetail } from "@/components/playground/GuardDescriptionDetail";
import { TAB_TO_PACK_ID, usePolicy, type InstalledPackDescriptor } from "./policy-context";

/**
 * Pack Inspector — surfaces `describePolicyBundle()` data inside the
 * playground, scoped to the active tab's Pack. For the Decision Lab tab
 * (which routes by intent kind to any of the three Packs), shows a
 * compact three-Pack overview so the visitor can see what's installed.
 *
 * Tab → Pack mapping lives in `policy-context.tsx`.
 */
export function PackInspector({ activeTab }: { activeTab: string }) {
  const { packs, error } = usePolicy();
  const targetId = TAB_TO_PACK_ID[activeTab] ?? "all";

  if (error) {
    return (
      <div className="rounded-lg border border-refuse/30 bg-refuse/10 px-3 py-2 text-xs text-refuse">
        Failed to load Pack metadata: {error}
      </div>
    );
  }
  if (!packs) {
    return (
      <div className="rounded-lg border border-edge bg-canvas px-3 py-2 text-xs italic text-faint">
        Loading Pack metadata…
      </div>
    );
  }

  const visible =
    targetId === "all" ? packs : packs.filter((p) => p.id === targetId);

  const compact = targetId === "all";
  return (
    <div className="flex flex-col gap-2">
      {visible.map((p) => (
        // Key on (pack id + compact) so switching tabs forces a remount
        // and the `useState(!compact)` initializer re-runs — otherwise the
        // panel keeps the open/closed state from the previous tab.
        <PackPanel key={`${p.id}-${compact ? "c" : "e"}`} pack={p} compact={compact} />
      ))}
    </div>
  );
}

function PackPanel({
  pack,
  compact,
}: {
  pack: InstalledPackDescriptor;
  compact: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const named = pack.descriptor.phases.flatMap((phase) =>
    phase.guards
      .filter((g): g is Extract<typeof g, { kind: "named" }> => g.kind === "named")
      .map((g) => ({ phase: phase.phase, metadata: g.metadata })),
  );
  return (
    <div className="rounded-lg border border-edge bg-canvas">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg px-3 py-2 text-left transition-colors hover:bg-surface"
      >
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown size={14} className="flex-shrink-0 text-muted" />
          ) : (
            <ChevronRight size={14} className="flex-shrink-0 text-muted" />
          )}
          <span className="truncate text-sm font-semibold text-ink">
            Pack: {pack.name}
          </span>
          <span className="text-[11px] text-faint">
            ({named.length} named guard{named.length === 1 ? "" : "s"})
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-section text-faint">
          default {pack.descriptor.default}
        </span>
      </button>
      {open ? (
        <div className="border-t border-edge px-3 py-3">
          <ol className="flex flex-col gap-1.5">
            {named.map((g, i) => {
              const info = guardKindInfo(g.metadata.description?.kind);
              return (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${info.fill.replace(/\bstroke-\S+/, "")}`}
                  />
                  <div className="min-w-0 flex-1">
                    <code className="text-[12px] text-ink">
                      <span className="text-faint">{g.phase}</span>
                      <span className="text-faint"> · </span>
                      {g.metadata.name ?? "(unnamed)"}
                    </code>
                    {g.metadata.description ? (
                      <span className="ml-2 text-[10px] uppercase tracking-section text-muted">
                        {info.label}
                      </span>
                    ) : null}
                    <GuardDescriptionDetail
                      kind={g.metadata.description?.kind}
                      description={g.metadata.description}
                    />
                  </div>
                </li>
              );
            })}
            {named.length === 0 ? (
              <li className="text-[12px] italic text-faint">
                No named guards in this Pack.
              </li>
            ) : null}
          </ol>
          <p className="mt-3 text-[10px] uppercase tracking-section text-faint">
            Source: <code>packages/{pack.id}</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}

