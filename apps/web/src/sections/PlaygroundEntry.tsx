import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * PlaygroundEntry — compact teaser band for the homepage. The story above has
 * done the teaching; this hands the visitor off to the full playground at
 * /playground rather than mounting it inline. The "Live" indicator signals the
 * kernel there isn't a stub or recording — it runs real Packs server-side.
 *
 * Deliberately does NOT mount <Playground/>; the working two-column playground
 * lives at the /playground route.
 */
export function PlaygroundEntry() {
  return (
    <section className="bg-canvas py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-edge bg-surface px-8 py-8 text-center shadow-sm md:flex-row md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-section text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-execute opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-execute" />
              </span>
              Live · running real Packs server-side
            </span>
            <p className="text-base font-medium text-ink md:text-lg">
              Run your own intents through the kernel.
            </p>
            <p className="max-w-md text-sm text-muted">
              A free-form Decision Lab and scripted Pack flows — every decision
              lands in a live audit log.
            </p>
          </div>
          <Button href="/playground" className="flex-shrink-0">
            Open the playground
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
