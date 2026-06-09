import { ArrowRight } from "lucide-react";
import { HeroKernelLoop } from "@/components/motion/HeroKernelLoop";
import { HeroOutcomeStrip } from "@/components/motion/HeroOutcomeStrip";
import { ActiveStepStrip } from "@/components/home/ActiveStepStrip";
import { Button } from "@/components/ui/Button";
import { CodeBlock } from "@/components/ui/CodeBlock";

/**
 * Hero — outcome-first repositioning (round-2 AUDIT P0).
 *
 * The headline now leads with the *outcome* — guardrails that go beyond
 * block-or-allow — instead of the product category. The subhead is the literal
 * decision spine the rest of the page proves: the agent proposes, adjudicate
 * decides (one of six), and every decision is a signed receipt.
 *
 * The CTA cluster mixes a high-intent primary ("Try the 5-min demo" → the live
 * /playground kernel), a one-click copyable install chip, and a low-commitment
 * tertiary ghost ("How it works"). A 4-chip anchor rail (ActiveStepStrip) lets
 * a visitor jump to any spine step and tracks the section in view. The
 * HeroKernelLoop video + HeroOutcomeStrip carry the visual proof below.
 */

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
            Open-source · AI-agent guardrails · v1
          </span>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Guardrails for AI agents that go{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent drop-shadow-sm">
              beyond block-or-allow
            </span>
            .
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            Your agent proposes an action.{" "}
            <span className="font-medium text-ink">adjudicate decides</span> —
            execute, rewrite, defer, escalate, or refuse — before anything
            touches production.{" "}
            <span className="font-medium text-ink">
              Every decision, a signed receipt.
            </span>
          </p>

          {/* 4-chip anchor rail — the spine, jumpable; tracks the section
              currently in view (static under reduced motion). */}
          <ActiveStepStrip />

          {/* CTA cluster: live demo (primary), one-click install (copyable
              chip), and a low-commitment mechanism link (tertiary ghost). */}
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              <Button href="/playground" variant="primary">
                Try the 5-min demo <ArrowRight size={16} />
              </Button>
              <Button href="/how-it-works" variant="ghost">
                How it works
              </Button>
            </div>
            <CodeBlock
              code="pnpm add @adjudicate/core"
              copyable
              className="w-full max-w-xs"
            />
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
