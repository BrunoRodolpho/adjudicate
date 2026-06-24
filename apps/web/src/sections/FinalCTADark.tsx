import { ArrowRight, Github } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GITHUB_REPO } from "@/content/github";

/**
 * FinalCTADark — the closing band of the dark marketing homepage.
 *
 * A single bordered, slightly-elevated panel restates the category claim one
 * last time ("AI proposes. The kernel decides.") and routes the visitor to the
 * three things that matter: the architecture write-up, the live playground, and
 * the open-source repository. Restrained to one indigo glow, hairlines, and a
 * mono eyebrow — consistent with the Hero and the KernelTrace centerpiece.
 */
export function FinalCTADark() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="relative mx-auto max-w-6xl px-6">
        <div
          className="relative overflow-hidden rounded-2xl border border-console-edge bg-console-panel px-6 py-14 text-center md:px-12 md:py-20"
          style={{
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 80px -20px rgba(0,0,0,0.7)",
          }}
        >
          {/* one subtle indigo constitutional glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-30%] h-[420px] w-[640px] -translate-x-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(99,102,241,0.18), rgba(99,102,241,0.04), transparent)",
              filter: "blur(28px)",
            }}
          />

          <div className="relative flex flex-col items-center gap-6">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              decision · 1 of 6
            </span>

            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
              AI proposes. The kernel decides.
            </h2>

            <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
              Deterministic authority for autonomous systems. Open source,
              in-process, replayable.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <Button href="/architecture" variant="primary">
                Read the architecture{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <Button
                href="/playground"
                variant="outline"
                className="border-0 bg-console-panel/70 text-console-ink ring-1 ring-console-edge hover:bg-console-panel hover:ring-console-faint"
              >
                Try the live playground
              </Button>
              <Button
                href={GITHUB_REPO}
                external
                variant="outline"
                className="border-0 bg-console-panel/70 text-console-ink ring-1 ring-console-edge hover:bg-console-panel hover:ring-console-faint"
              >
                <Github size={16} aria-hidden="true" />
                Star on GitHub
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
