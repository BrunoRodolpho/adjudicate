"use client";

import type { PolicyBundleDescriptorParsed } from "@adjudicate/admin-sdk";
import { Section } from "@/components/decision/Section";

/**
 * Renders the active PolicyBundle's structure — one collapsible row per
 * phase, with each guard's metadata. Anonymous guards collapse to a generic
 * row so the count stays accurate. The `description.kind` drives the
 * colour stripe so adopters can scan for "where are the threshold guards?"
 * at a glance.
 */
export function PolicyBundleView({
  descriptor,
}: {
  descriptor: PolicyBundleDescriptorParsed;
}) {
  return (
    <div className="flex flex-col">
      <p className="mb-3 text-[11px] text-muted">
        Default outcome:{" "}
        <code className="text-ink">{descriptor.default}</code>
      </p>
      {descriptor.phases.map((p) => (
        <Section
          key={p.phase}
          title={`${p.phase}  ·  ${p.guards.length} guard${p.guards.length === 1 ? "" : "s"}`}
          defaultOpen={p.guards.length > 0}
        >
          <ul className="flex flex-col gap-1">
            {p.guards.map((g, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-sm border border-edge bg-canvas/40 px-2 py-1.5"
              >
                <span
                  aria-hidden
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${stripeColor(
                    g.kind === "named" ? g.metadata.description?.kind : undefined,
                  )}`}
                />
                <div className="flex flex-1 flex-col gap-0.5 text-[11px]">
                  {g.kind === "named" ? (
                    <>
                      <span className="text-ink">
                        {g.metadata.name ?? "(unnamed)"}
                      </span>
                      <span className="text-[10px] text-faint">
                        {g.metadata.description?.kind ?? "(no description)"}
                        {g.metadata.author ? ` · ${g.metadata.author}` : ""}
                        {g.metadata.since ? ` · since ${g.metadata.since}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint italic">anonymous guard</span>
                  )}
                </div>
              </li>
            ))}
            {p.guards.length === 0 ? (
              <li className="px-2 py-1 text-[11px] italic text-faint">
                No guards in this phase.
              </li>
            ) : null}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function stripeColor(kind?: string): string {
  switch (kind) {
    case "threshold":
      return "bg-amber-400";
    case "state_defer":
      return "bg-sky-400";
    case "system_taint":
      return "bg-violet-400";
    case "rewrite":
      return "bg-orange-400";
    case "opaque":
      return "bg-faint";
    default:
      return "bg-edge";
  }
}
