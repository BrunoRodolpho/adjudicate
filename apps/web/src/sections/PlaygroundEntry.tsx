import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * PlaygroundEntry — compact teaser band for the homepage. The story above has
 * done the teaching; this hands the visitor off to the full playground at
 * /playground rather than mounting it inline.
 *
 * AUDIT P1 (clarity): the copy now spells out what "live" means and what a
 * Pack is, so a first-time visitor isn't asked to know the vocabulary. The
 * pulsing "Live" dot signals the kernel runs for real — not a stub or a
 * recording — server-side. AUDIT P2: the CTA arrow slides on hover
 * (transform-only, `motion-safe:`-gated).
 *
 * Deliberately does NOT mount <Playground/>; the working two-column playground
 * lives at the /playground route.
 */
export function PlaygroundEntry() {
  return (
    <section className="bg-console-canvas py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-console-edge bg-console-panel px-8 py-8 text-center shadow-sm md:flex-row md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-section text-console-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-execute opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-execute" />
              </span>
              Live · the real kernel runs server-side
            </span>
            <p className="text-base font-medium text-console-ink md:text-lg">
              Run your own scenarios through the real kernel.
            </p>
            <p className="max-w-md text-sm text-console-muted">
              Packs are pre-built decision flows — deployments, charges, KYC.
              Pick one or build your own intent in the Decision Lab; every
              decision returns a tamper-evident, replayable receipt and lands
              in a live audit log.
            </p>
          </div>
          <Button href="/playground" className="group flex-shrink-0">
            Open the playground
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="transition-transform duration-200 motion-safe:group-hover:translate-x-1"
            />
          </Button>
        </div>
      </div>
    </section>
  );
}
