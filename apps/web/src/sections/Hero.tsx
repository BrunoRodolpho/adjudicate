import { ArrowRight, Github } from "lucide-react";
import { HeroKernelLoop } from "@/components/motion/HeroKernelLoop";
import { HeroMechanismPanel } from "@/components/motion/HeroMechanismPanel";
import { HeroOutcomeStrip } from "@/components/motion/HeroOutcomeStrip";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-canvas pb-24 pt-20 md:pt-24">
      {/* Subtle dotted grid backdrop — adds visual texture without noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgb(228 228 231) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Warm radial glow in the top-right — single brand accent. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(139,92,246,0.18), rgba(217,70,239,0.06), transparent)",
          filter: "blur(20px)",
        }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6">
        {/* Row 1 — copy header, centered. */}
        <header className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-edge bg-surface/80 px-3 py-1 text-[11px] uppercase tracking-section text-muted backdrop-blur-sm">
            Execution mediation · v0.1 · REWRITE under the hood
          </span>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Every AI action passes through a{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent drop-shadow-sm">
              control layer
            </span>{" "}
            that can rewrite it.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            The kernel returns one of six structured decisions — and{" "}
            <span className="font-medium text-ink">REWRITE</span> substitutes a
            sanitised replacement envelope before anything runs. Every step is
            hashed, every decision auditable.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="#how-it-works" variant="primary">
              See how it works <ArrowRight size={16} />
            </Button>
            <Button
              href="https://github.com/anthropics/adjudicate"
              variant="outline"
              external
            >
              <Github size={16} /> View on GitHub
            </Button>
          </div>
        </header>

        {/* Row 2 — video + mechanism panel, side-by-side at md+. */}
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_340px] md:gap-10">
          <div className="flex justify-center md:justify-end">
            <HeroKernelLoop />
          </div>
          <div className="flex justify-center md:justify-start">
            <HeroMechanismPanel />
          </div>
        </div>

        {/* Row 3 — six-outcome comparison strip. */}
        <HeroOutcomeStrip />
      </div>
    </section>
  );
}
