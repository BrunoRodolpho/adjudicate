"use client";

import { Check, Minus, X } from "lucide-react";
import { WEDGE } from "@/content/wedge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

function Mark({ value }: { value: "yes" | "no" | "partial" | "seam" }) {
  if (value === "yes")
    return (
      <span className="inline-flex items-center gap-1 text-execute">
        <Check size={14} /> yes
      </span>
    );
  if (value === "no")
    return (
      <span className="inline-flex items-center gap-1 text-refuse/80">
        <X size={14} /> no
      </span>
    );
  if (value === "partial")
    return (
      <span className="inline-flex items-center gap-1 text-defer">
        <Minus size={14} /> partial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-confirm">
      <Minus size={14} /> seam
    </span>
  );
}

export function WedgeTable() {
  return (
    <section className="bg-canvas py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="vs OPA / Cedar"
          title="The wedge."
          subtitle="Existing policy engines say allow or deny. Adjudicate adds the answers AI agent workflows actually need."
        />

        <div className="mt-10 overflow-x-auto rounded-2xl border border-edge bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="px-5 py-3 text-xs uppercase tracking-section text-muted">
                  Capability
                </th>
                <th className="px-5 py-3 text-xs uppercase tracking-section text-muted">
                  OPA / Cedar
                </th>
                <th className="px-5 py-3 text-xs uppercase tracking-section text-muted">
                  adjudicate
                </th>
              </tr>
            </thead>
            <Stagger as="tbody" stagger={0.06}>
              {WEDGE.map((row) => (
                <StaggerItem
                  as="tr"
                  key={row.capability}
                  className="group border-b border-edge/60 transition-shadow last:border-b-0 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 hover:shadow-md"
                >
                  <td className="px-5 py-4 align-top text-ink">
                    {row.capability}
                    {row.snippet ? (
                      <div className="mt-2 max-w-md">
                        <CodeBlock code={row.snippet} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <Mark value={row.opaCedar} />
                  </td>
                  <td className="px-5 py-4 align-top">
                    <Mark value={row.adjudicate} />
                  </td>
                </StaggerItem>
              ))}
            </Stagger>
          </table>
        </div>
      </div>
    </section>
  );
}
