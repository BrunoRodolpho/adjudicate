import type { Metadata } from "next";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import {
  projectRedTeamDefenses,
  type PublicRedTeamDefense,
} from "@/lib/red-team-transparency";
import { RED_TEAM_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import {
  RevealGrid,
  RevealGridItem,
} from "@/components/transparency/RevealGrid";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";
import { TransparencyMetric } from "@/components/transparency/TransparencyMetric";

export const metadata: Metadata = {
  title: "Red-team defenses · Transparency · adjudicate",
  description:
    "Public, read-only red-team defense status for the reference packs: whether each shipped pack still defends against the adversarial suite, as a clean/regressed badge with defended totals. Aggregates only — no scenario names, attack payloads, basis codes, or per-vector escape detail.",
};

const AS_OF = "2026-06-07T00:00:00.000Z";

/**
 * /transparency/red-team — public, read-only red-team defenses (ADR-133).
 * Per pack: `total` + `defended` counts and a clean/regressed band only —
 * never a scenario name, payload, basis code, or per-vector escape map.
 */
export default function RedTeamTransparencyPage() {
  const defenses = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
  const allClean = defenses.every((d) => d.lastRunStatus === "clean");
  const defended = defenses.reduce((n, d) => n + d.defended, 0);
  const total = defenses.reduce((n, d) => n + d.total, 0);

  return (
    <TransparencyLayout
      slug="red-team"
      eyebrow="red-team defenses"
      title="Do the defenses hold?"
      lead="Whether each shipped pack still withstands the adversarial suite — prompt-injection, taint-escalation, and tool-scope attacks run through the pure kernel. Published as a sanitized clean/regressed badge with defended totals. No scenario names, attack payloads, or which-defense-fired detail ever cross this boundary."
      hero={
        <div className="flex flex-col gap-8">
          <TransparencyMetric
            label="Adversarial scenarios defended"
            value={total > 0 ? `${defended}/${total}` : "—"}
            unit="held"
            tone={allClean ? "ok" : "crit"}
            status={allClean ? "All packs clean" : "Regression detected"}
            detail={
              allClean
                ? `Across ${defenses.length} shipped packs, every probe in the adversarial suite was caught in the latest run.`
                : "One or more packs let at least one probe through — investigate before shipping."
            }
          />
          {defenses.length > 0 ? (
            <RevealGrid
              data-testid="red-team-defenses"
              className="grid gap-3 sm:grid-cols-2"
            >
              {defenses.map((d) => (
                <DefenseCard key={d.packId} defense={d} />
              ))}
            </RevealGrid>
          ) : (
            <p
              data-testid="red-team-empty"
              className="text-body-sm text-muted"
            >
              Transparency data temporarily unavailable.
            </p>
          )}
        </div>
      }
      shows={
        <p>
          Each pack is stress-tested against a known adversarial suite —{" "}
          <strong>prompt injection</strong>, <strong>taint escalation</strong>,
          and <strong>tool-scope attacks</strong> — replayed through the pure
          kernel on every change. A <strong>clean</strong> pack passed every
          scenario; a <strong>regressed</strong> pack let at least one probe
          through and needs immediate investigation. Read the totals as
          &ldquo;held the line on N of M attacks.&rdquo;
        </p>
      }
      notShown={
        <p>
          The operator console shows the full adversarial report — each{" "}
          <strong>scenario name</strong>, the <strong>basis code</strong> of the
          defense that fired, decisions, and a per-vector escape table. None of
          that is published here — this status carries only two counts and a
          clean/regressed band per pack.
        </p>
      }
      footnote={
        <>
          As of <time dateTime={AS_OF}>{AS_OF.slice(0, 10)}</time> ·{" "}
          {allClean
            ? "all shipped packs defend the full suite"
            : "one or more packs show a regression"}{" "}
          · aggregates only · illustrative sample data.
        </>
      }
    />
  );
}

function DefenseCard({ defense }: { defense: PublicRedTeamDefense }) {
  const clean = defense.lastRunStatus === "clean";
  return (
    <RevealGridItem
      data-testid="red-team-defense-card"
      data-pack={defense.packId}
      role="group"
      aria-label={cardAriaLabel(defense)}
      className="flex flex-col rounded-xl bg-canvas p-4 shadow-xs"
    >
      <div className="flex items-center gap-3">
        {clean ? (
          <ShieldCheck size={24} aria-hidden className="shrink-0 text-execute-strong" />
        ) : (
          <ShieldAlert size={24} aria-hidden className="shrink-0 text-refuse-strong" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="text-body-sm font-medium text-ink">
            {defense.displayName}
          </span>
          <span className="text-meta tabular-nums text-muted">
            {defense.defended} of {defense.total} attack scenarios defended
          </span>
        </div>
      </div>
      <div className="mt-4">
        <span
          data-testid="red-team-status"
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-eyebrow uppercase ${
            clean
              ? "border-execute/40 bg-execute/10 text-execute-strong"
              : "border-refuse/40 bg-refuse/10 text-refuse-strong"
          }`}
        >
          {clean ? "Clean" : "Regressed"}
        </span>
      </div>
    </RevealGridItem>
  );
}

function cardAriaLabel(defense: PublicRedTeamDefense): string {
  return `${defense.displayName}: ${
    defense.lastRunStatus === "clean" ? "Clean" : "Regressed"
  }, ${defense.defended} of ${defense.total} attack scenarios defended.`;
}
