import { Package } from "lucide-react";
import { PACKS } from "@/content/packs";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function PacksSection() {
  return (
    <section className="bg-canvas py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Pack architecture"
          title="Bring your own governance domain."
          subtitle="A Pack is a typed governance bundle — intents, taint, policy, handlers — that drops into the kernel. Three real Packs ship today; the rest are clearly-marked roadmap."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PACKS.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col gap-3 rounded-xl border p-5 transition-all duration-200 ${
                p.status === "shipped"
                  ? "border-edge bg-surface shadow-sm hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
                  : "border-dashed border-edge bg-canvas opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <Package
                  size={18}
                  className={p.status === "shipped" ? "text-execute" : "text-faint"}
                />
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-section ${
                    p.status === "shipped"
                      ? "bg-execute/10 text-execute"
                      : "bg-edge text-muted"
                  }`}
                >
                  {p.status === "shipped" ? "shipped" : "roadmap"}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">{p.displayName}</h3>
              <p className="text-sm text-muted">{p.tagline}</p>
              {p.status === "shipped" ? (
                <>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.intents.map((i) => (
                      <code
                        key={i}
                        className="rounded-md border border-edge bg-canvas px-1.5 py-0.5 text-[10px] text-ink"
                      >
                        {i}
                      </code>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-muted">
                    Covers {p.outcomesCovered.length}/6 outcomes
                  </div>
                </>
              ) : (
                <p className="text-[11px] italic text-muted">
                  Domain template — in design.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
