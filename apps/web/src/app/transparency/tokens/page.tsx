import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { projectTokenBurndownTransparency } from "@/lib/token-burndown-transparency";
import { TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { Reveal } from "@/components/home/Reveal";
import { AnimatedBurnBar } from "@/components/transparency/AnimatedBurnBar";

export const metadata: Metadata = {
  title: "Token governance · Transparency · adjudicate",
  description:
    "Public, aggregate-only token burn-down: how much of the period's token budget is used, as a coarse banded percentage. Illustrative single-tenant sample — never session ids, tenant ids, or raw token counts.",
};

const BAND_STYLE: Record<
  "ok" | "warn" | "exhausted",
  { bar: string; text: string }
> = {
  ok: { bar: "bg-emerald-400/70", text: "text-emerald-300" },
  warn: { bar: "bg-amber-400/70", text: "text-amber-300" },
  exhausted: { bar: "bg-red-400/70", text: "text-red-300" },
};

/**
 * /transparency/tokens — public, aggregate-only token governance view (ADR-135).
 *
 * Server component. apps/web is public and has no database credentials, so this
 * renders from a committed ILLUSTRATIVE single-tenant fixture, projected through
 * the public token-burndown contract. It shows ONLY a banded percent-of-budget
 * burn-down (within / near / over budget) with COARSELY-ROUNDED "≈" figures —
 * and NEVER any session id, tenant id, per-session row, exhaustion-event detail,
 * or raw token count that maps to a real customer. Redaction is by construction:
 * the public shape carries only `pctUsed`, `band`, and rounded display strings.
 */
export default function TokenGovernanceTransparencyPage() {
  const burndown = projectTokenBurndownTransparency(
    TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE,
  );
  const style = BAND_STYLE[burndown.band];

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
            Public · transparency · token governance
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            How much budget is left.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            A single, aggregate burn-down of the period&apos;s token budget — a
            banded percentage, never the session/tenant breakdown or the raw
            counts behind it.
          </p>
        </div>
      </header>

      <section aria-labelledby="note-heading" className="bg-canvas pb-8">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="note-heading" className="sr-only">
            About this data
          </h2>
          <div className="max-w-3xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              Illustrative sample · aggregate only
            </p>
            <p className="mt-2 text-sm text-muted">
              The figure below is{" "}
              <span className="text-ink">illustrative sample data</span> for a
              single anonymous tenant, not live production numbers. It is an{" "}
              <span className="text-ink">aggregate burn-down only</span> — a
              percent of budget used, bucketed into a coarse band, with counts
              rounded to a coarse unit and shown as{" "}
              <code className="text-ink">≈</code> approximations. The operator
              console&apos;s per-tenant and per-session breakdown, the tenant and
              session ids, the exact token counts, and the budget-exhaustion
              timeline are <span className="text-ink">never</span> exposed here.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="explainer-heading" className="bg-canvas pb-8">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="explainer-heading" className="sr-only">
            What token budgets are
          </h2>
          <div className="max-w-3xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              What this shows
            </p>
            <p className="mt-2 text-sm text-muted">
              A <span className="text-ink">token budget</span> caps how many
              tokens an AI deployment can consume in a period. As you approach the
              limit, the kernel starts <span className="text-ink">deferring</span>{" "}
              or <span className="text-ink">rejecting</span> new actions instead
              of letting an agent loop run up an unbounded bill. This page shows
              how much of that budget is gone — so &ldquo;how much is left&rdquo;
              is a single glance, not a spreadsheet.
            </p>
            <p className="mt-2 text-xs text-muted">
              For rough orientation only (illustrative, not a target): a typical
              SaaS deployment sits around 50–70% by mid-period; a conservative
              enterprise nearer 30–40%.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="burndown-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            id="burndown-heading"
            className="text-xs uppercase tracking-section text-muted"
          >
            Token budget · this period
          </h2>

          <Reveal className="mt-4 max-w-2xl rounded-sm border border-edge bg-surface p-5">
            <AnimatedBurnBar
              pctUsed={burndown.pctUsed}
              bandLabel={burndown.bandLabel}
              barClass={style.bar}
              textClass={style.text}
            />

            <p className="mt-3 text-sm text-muted">
              <span className="tabular-nums text-ink">
                {burndown.consumedDisplay}
              </span>{" "}
              of{" "}
              <span className="tabular-nums text-ink">
                {burndown.budgetDisplay}
              </span>{" "}
              tokens used this period.
            </p>
          </Reveal>

          <p className="mt-4 max-w-2xl text-xs text-muted">
            Figures are coarsely rounded approximations for a single illustrative
            tenant — they never map to a real customer&apos;s usage, and the band
            (not a precise count) is the only live signal exposed. Enforcement of
            budgets is a kernel decision in the operator console, audited and
            replayable; this public page is read-only telemetry.
          </p>
        </div>
      </section>
    </main>
  );
}
