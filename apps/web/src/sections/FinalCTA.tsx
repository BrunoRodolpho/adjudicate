import { ArrowRight, Github, Book } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Button } from "@/components/ui/Button";
import { GITHUB_REPO, githubBlob } from "@/content/github";

/**
 * AUDIT P1: the closing CTA now leads with outcome — the benefit before the
 * ask — rather than restating the product category. The headline, subhead, and
 * button cluster cascade in on scroll (motion kit, reduced-motion-safe), and
 * the buttons carry hover affordances: the primary GitHub button nudges up in
 * scale and the playground arrow slides right. Both are transform-only and
 * `motion-safe:`-gated, so under reduced motion only the static colour/shadow
 * states apply.
 */
export function FinalCTA() {
  return (
    <section className="bg-gradient-primary py-20 text-white">
      <Stagger
        as="div"
        className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center"
        stagger={0.09}
      >
        <StaggerItem as="h2" className="text-3xl font-semibold leading-tight md:text-4xl">
          Ship AI that users can trust.
        </StaggerItem>
        <StaggerItem as="p" className="text-lg text-white/85">
          Every LLM decision is audited, every risky action is blocked or
          rewritten, and every trace is provable — before anything touches
          production.
        </StaggerItem>
        <StaggerItem className="mt-2 flex flex-wrap justify-center gap-3">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-brand-ink shadow-md transition-all hover:shadow-lg motion-safe:hover:scale-[1.02]"
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
            className="group !text-white hover:!bg-white/20"
          >
            Playground{" "}
            <ArrowRight
              size={16}
              className="transition-transform duration-200 motion-safe:group-hover:translate-x-1"
            />
          </Button>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
