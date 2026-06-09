import { ArrowRight, Github, Book } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GITHUB_REPO, githubBlob } from "@/content/github";

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
            href={GITHUB_REPO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-indigo-700 shadow-md hover:shadow-lg"
          >
            <Github size={16} /> Star on GitHub
          </a>
          <Button
            href={githubBlob("docs/concepts.md")}
            variant="outline"
            external
            className="!border-white/40 !bg-white/10 !text-white hover:!bg-white/20"
          >
            <Book size={16} /> Concepts
          </Button>
          <Button
            href="/playground"
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
