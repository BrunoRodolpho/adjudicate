import { ArrowRight, BookOpen } from "lucide-react";
import { HeroKernelLoop } from "@/components/motion/HeroKernelLoop";
import { HeroOutcomeStrip } from "@/components/motion/HeroOutcomeStrip";
import { Button } from "@/components/ui/Button";

/**
 * Hero — the four-step spine in miniature, above the fold.
 *
 * Headline names the product category; the subhead is the literal four-step
 * sentence the rest of the page proves: AI acts → guard decides → receipt
 * saved → console shows. A 4-chip anchor rail lets a visitor jump straight to
 * any step. The HeroKernelLoop video + HeroOutcomeStrip carry the visual
 * proof; the inline mechanism panel was retired in favour of the dedicated
 * Step-3 receipt below.
 */

const STEPS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "AI acts", href: "#step-acts" },
  { label: "Guard decides", href: "#step-decides" },
  { label: "Receipt saved", href: "#step-receipt" },
  { label: "Console shows", href: "#step-console" },
];

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
            Execution mediation · v0.1
          </span>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
            A decision kernel for{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent drop-shadow-sm">
              AI actions
            </span>
            .
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            Your AI tries to act.{" "}
            <span className="font-medium text-ink">A guard decides.</span> A
            signed receipt is saved.{" "}
            <span className="font-medium text-ink">
              Your console shows every one.
            </span>
          </p>

          {/* 4-chip anchor rail — the spine, jumpable. */}
          <nav
            aria-label="The four steps"
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2"
          >
            {STEPS.map((step, idx) => (
              <span key={step.href} className="flex items-center gap-2">
                <a
                  href={step.href}
                  className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink/30 hover:text-ink"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-edge font-mono text-[11px] text-ink">
                    {idx + 1}
                  </span>
                  {step.label}
                </a>
                {idx < STEPS.length - 1 ? (
                  <span className="text-faint" aria-hidden="true">
                    &rarr;
                  </span>
                ) : null}
              </span>
            ))}
          </nav>

          <div className="flex flex-wrap justify-center gap-3">
            <Button href="/playground" variant="primary">
              See it run <ArrowRight size={16} />
            </Button>
            <Button href="/how-it-works" variant="ghost">
              <BookOpen size={16} /> Read the mechanism
            </Button>
          </div>
        </header>

        {/* Row 2 — the kernel loop video, centered. */}
        <div className="flex justify-center">
          <HeroKernelLoop />
        </div>

        {/* Row 3 — six-outcome comparison strip. */}
        <HeroOutcomeStrip />
      </div>
    </section>
  );
}
