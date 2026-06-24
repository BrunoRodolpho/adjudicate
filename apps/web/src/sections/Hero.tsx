import { ArrowRight } from "lucide-react";
import { KernelTrace } from "@/components/home/KernelTrace";
import { WatchFlowModal } from "@/components/home/WatchFlowModal";
import { Button } from "@/components/ui/Button";

/**
 * Hero — the constitutional control room.
 *
 * The category claim, stated directly: the LLM proposes, the kernel decides.
 * The centerpiece is the live {@link KernelTrace} — a real execution trace that
 * cycles five scenarios through the six ordered guards to one of six outcomes,
 * proving the kernel rather than illustrating it. The cinematic Remotion film
 * is demoted to a "Watch the constitutional flow" modal.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-console-canvas pb-20 pt-14 md:pb-28 md:pt-20">
      {/* faint grid, masked to the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: "radial-gradient(rgb(39 39 42) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(90% 55% at 50% 0%, black, transparent)",
          WebkitMaskImage: "radial-gradient(90% 55% at 50% 0%, black, transparent)",
        }}
      />
      {/* one cool constitutional glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12%] h-[540px] w-[860px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.20), rgba(99,102,241,0.05), transparent)",
          filter: "blur(28px)",
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-12 px-6">
        <header className="flex max-w-3xl flex-col items-center gap-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-console-edge bg-console-panel/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-console-muted backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Deterministic constitutional infrastructure
          </span>

          <h1 className="text-[2.6rem] font-semibold leading-[1.04] tracking-tight md:text-6xl lg:text-[4.5rem]">
            <span className="block text-console-faint">The LLM proposes.</span>
            <span className="block text-console-ink">The kernel decides.</span>
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
            Adjudicate is the deterministic constitutional layer between your AI
            and reality. Everything probabilistic is advisory —{" "}
            <span className="text-console-ink">only the kernel can authorize</span>{" "}
            a real-world action.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button href="/how-it-works" variant="primary">
              Explore the kernel <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button
              href="/architecture"
              variant="outline"
              className="border-0 bg-console-panel/70 text-console-ink ring-1 ring-console-edge hover:bg-console-panel hover:ring-console-faint"
            >
              Read the architecture
            </Button>
            <WatchFlowModal />
          </div>
        </header>

        <div className="w-full max-w-5xl">
          <KernelTrace />
        </div>
      </div>
    </section>
  );
}
