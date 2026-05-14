import { ArrowRight, Github } from "lucide-react";
import { KernelCube } from "@/components/motion/KernelCube";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-canvas pb-24 pt-20 md:pt-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 text-[11px] uppercase tracking-section text-muted">
            Policy-as-code · v0.1 experimental
          </span>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Deterministic adjudication for{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              LLM-mediated actions
            </span>
            .
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted md:text-xl">
            Replay-safe decisions, ordered policy enforcement, and forensic
            auditability — the governance layer between an LLM proposing an
            action and your system executing it.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Button href="#playground" variant="primary">
              Try the playground <ArrowRight size={16} />
            </Button>
            <Button
              href="https://github.com/anthropics/adjudicate"
              variant="outline"
              external
            >
              <Github size={16} /> View on GitHub
            </Button>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <KernelCube />
        </div>
      </div>
    </section>
  );
}
