import { ArrowRight, Github, Book } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FinalCTA() {
  return (
    <section className="bg-gradient-primary py-20 text-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          The kernel between intent and execution.
        </h2>
        <p className="text-lg text-white/85">
          Adopt the policy-and-audit layer your AI agents already needed.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/anthropics/adjudicate"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-indigo-700 shadow-md hover:shadow-lg"
          >
            <Github size={16} /> Star on GitHub
          </a>
          <Button
            href="https://github.com/anthropics/adjudicate/blob/main/docs/concepts.md"
            variant="outline"
            external
            className="!border-white/40 !bg-white/10 !text-white hover:!bg-white/20"
          >
            <Book size={16} /> Concepts
          </Button>
          <Button
            href="#playground"
            variant="ghost"
            className="!text-white hover:!bg-white/20"
          >
            Playground <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-edge bg-canvas py-8 text-xs text-muted">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-ink">adjudicate</span>
          <span className="text-faint">v0.1 · experimental</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <a className="hover:text-ink" href="/architecture">
            Architecture
          </a>
          <a className="hover:text-ink" href="/comparisons">
            Comparisons
          </a>
          <a className="hover:text-ink" href="/introspection">
            Introspection
          </a>
          <span className="text-faint">·</span>
          <a
            className="hover:text-ink"
            href="https://github.com/anthropics/adjudicate"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            className="hover:text-ink"
            href="https://github.com/anthropics/adjudicate/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
          <a
            className="hover:text-ink"
            href="https://github.com/anthropics/adjudicate/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
        </div>
      </div>
    </footer>
  );
}
