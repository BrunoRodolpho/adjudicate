import { ArrowDown } from "lucide-react";

/**
 * PlaygroundEntry — bridge card between the conceptual story (and the
 * Pack/Decisions context above) and the interactive playground below.
 * Two lines of copy + a downward arrow. The story has done the teaching;
 * this card just hands the visitor off.
 *
 * The "Live" indicator at the top hints that the kernel below isn't a
 * stub or recording — it's running real Packs server-side.
 */
export function PlaygroundEntry() {
  return (
    <section className="bg-canvas pb-6 pt-2">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="inline-flex flex-col items-center gap-3 rounded-2xl border border-edge bg-surface px-8 py-6 shadow-sm">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-section text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-execute opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-execute" />
            </span>
            Live · running real Packs server-side
          </span>
          <p className="text-base font-medium text-ink md:text-lg">
            About to play with the kernel?
          </p>
          <p className="max-w-md text-sm text-muted">
            Each tab routes to one Pack. The audit log on the right tracks
            every decision the kernel makes.
          </p>
          <ArrowDown size={20} className="mt-1 animate-bounce text-muted" />
        </div>
      </div>
    </section>
  );
}
