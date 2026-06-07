import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import { Footer } from "@/sections/FinalCTA";
import {
  projectRedTeamDefenses,
  type PublicRedTeamDefense,
} from "@/lib/red-team-transparency";
import { RED_TEAM_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";

export const metadata: Metadata = {
  title: "Red-team defenses · Transparency · adjudicate",
  description:
    "Public, read-only red-team defense status for the reference packs: whether each shipped pack still defends against the adversarial suite, as a clean/regressed badge with defended totals. Aggregates only — no scenario names, attack payloads, basis codes, or per-vector escape detail.",
};

/**
 * /transparency/red-team — public, read-only red-team defenses (ADR-133).
 *
 * Server component. apps/web is public and has no kernel runtime, so this
 * renders from a committed ILLUSTRATIVE fixture projected through the
 * AGGREGATE-ONLY, BANDED `projectRedTeamDefenses`. The projection exposes only,
 * per shipped pack, the `total` + `defended` counts and a BOOLEAN clean/regressed
 * band — NEVER a scenario name, an attack payload, a basis code, a decision, an
 * error string, a per-vector `escapesByVector` map, or a raw escape count (all
 * operator-only on the console). apps/web never imports the red-team report
 * shape and has no path to `results[]`. All values render as inert text.
 */

const AS_OF = "2026-06-07T00:00:00.000Z";

export default function RedTeamTransparencyPage() {
  const defenses = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
  const allClean = defenses.every((d) => d.lastRunStatus === "clean");

  return (
    <main>
      <header className="bg-canvas pb-6 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/transparency"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> Back to transparency
          </Link>
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            Public · transparency · red-team defenses
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            Do the defenses hold?
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Whether each shipped pack still withstands the adversarial suite —
            prompt-injection, taint-escalation, and tool-scope attacks run
            through the pure kernel. Published as a sanitized clean/regressed
            badge with defended totals. No scenario names, attack payloads, or
            which-defense-fired detail ever cross this boundary.
          </p>
        </div>
      </header>

      <section aria-labelledby="defenses-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="defenses-heading" className="sr-only">
            Red-team defenses per shipped pack
          </h2>

          {defenses.length === 0 ? (
            <p
              data-testid="red-team-empty"
              className="max-w-2xl rounded-sm border border-edge bg-surface p-5 text-sm text-muted"
            >
              Transparency data temporarily unavailable.
            </p>
          ) : (
            <ul
              data-testid="red-team-defenses"
              className="grid gap-3 sm:grid-cols-2"
            >
              {defenses.map((d) => (
                <DefenseCard key={d.packId} defense={d} />
              ))}
            </ul>
          )}

          <div className="mt-6 max-w-2xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              What this does not show
            </p>
            <p className="mt-2 text-sm text-muted">
              The operator console shows the full adversarial report — each{" "}
              <span className="text-ink">scenario name</span>, the{" "}
              <span className="text-ink">basis code</span> of the defense that
              fired, decisions, and a per-vector escape table. None of that is
              published here — this status is built field-by-field from an
              allowlist that carries only two counts and a clean/regressed band
              per pack.
            </p>
          </div>

          <p className="mt-4 text-xs text-faint">
            As of <time dateTime={AS_OF}>{AS_OF.slice(0, 10)}</time> ·{" "}
            {allClean
              ? "all shipped packs defend the full suite"
              : "one or more packs show a regression"}{" "}
            · aggregates only · illustrative sample data.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function DefenseCard({ defense }: { defense: PublicRedTeamDefense }) {
  const clean = defense.lastRunStatus === "clean";
  return (
    <li
      data-testid="red-team-defense-card"
      data-pack={defense.packId}
      role="group"
      aria-label={cardAriaLabel(defense)}
      className="flex flex-col rounded-sm border border-edge bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        {clean ? (
          <ShieldCheck size={24} aria-hidden className="shrink-0 text-emerald-400" />
        ) : (
          <ShieldAlert size={24} aria-hidden className="shrink-0 text-red-400" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink">{defense.displayName}</span>
          <span className="text-xs tabular-nums text-muted">
            {defense.defended} of {defense.total} attack scenarios defended
          </span>
        </div>
      </div>
      <div className="mt-4 border-t border-edge pt-3">
        <span
          data-testid="red-team-status"
          className={`rounded-sm border px-2 py-0.5 text-xs uppercase tracking-section ${
            clean
              ? "border-emerald-500/40 text-emerald-300"
              : "border-red-500/50 text-red-300"
          }`}
        >
          {clean ? "Clean" : "Regressed"}
        </span>
      </div>
    </li>
  );
}

/** Color-independent accessible label for a defense card. */
function cardAriaLabel(defense: PublicRedTeamDefense): string {
  return `${defense.displayName}: ${
    defense.lastRunStatus === "clean" ? "Clean" : "Regressed"
  }, ${defense.defended} of ${defense.total} attack scenarios defended.`;
}
