import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Branded 404 (WS-L). Replaces the bare Next default with an on-system page:
 * the decision vocabulary as a wink ("this route was REFUSED"), a clear primary
 * action home, and the highest-value links so a lost visitor recovers fast.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-content flex-col items-center justify-center gap-6 px-6 py-section text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-refuse/40 bg-refuse/10 px-3 py-1 text-eyebrow uppercase text-refuse-strong">
        404 · refused
      </span>
      <h1 className="text-h1 text-ink md:text-h1-lg">
        This route doesn&apos;t exist.
      </h1>
      <p className="max-w-measure text-lead text-muted">
        The page you asked for couldn&apos;t be adjudicated — it isn&apos;t part
        of the site. Head back, or jump straight to what most people are
        looking for.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button href="/" variant="primary">
          Back to home
        </Button>
        <Button href="/playground" variant="outline">
          Try the playground
        </Button>
      </div>
      <nav
        aria-label="Popular destinations"
        className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-body-sm"
      >
        {[
          { label: "How it works", href: "/how-it-works" },
          { label: "Capabilities", href: "/capabilities" },
          { label: "Recipes", href: "/recipes" },
          { label: "Console", href: "/console" },
          { label: "Docs", href: "/architecture" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-sm text-muted transition-colors hover:text-ink focus-ring"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
