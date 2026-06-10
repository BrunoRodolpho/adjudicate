import type { Metadata } from "next";
import { projectTokenBurndownTransparency } from "@/lib/token-burndown-transparency";
import { TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";
import { TransparencyMetric } from "@/components/transparency/TransparencyMetric";

export const metadata: Metadata = {
  title: "Token governance · Transparency · adjudicate",
  description:
    "Public, aggregate-only token burn-down: how much of the period's token budget is used, as a coarse banded percentage. Illustrative single-tenant sample — never session ids, tenant ids, or raw token counts.",
};

const BAND: Record<
  "ok" | "warn" | "exhausted",
  { tone: "ok" | "warn" | "crit"; bar: string }
> = {
  ok: { tone: "ok", bar: "bg-execute" },
  warn: { tone: "warn", bar: "bg-defer" },
  exhausted: { tone: "crit", bar: "bg-refuse" },
};

/**
 * /transparency/tokens — public, aggregate-only token governance view (ADR-135).
 * Banded percent-of-budget burn-down with coarsely-rounded "≈" figures only —
 * never a session id, tenant id, per-session row, or raw token count.
 */
export default function TokenGovernanceTransparencyPage() {
  const b = projectTokenBurndownTransparency(TOKEN_BURNDOWN_TRANSPARENCY_SAMPLE);
  const band = BAND[b.band];

  return (
    <TransparencyLayout
      slug="tokens"
      eyebrow="token governance"
      title="How much budget is left."
      lead="A single, aggregate burn-down of the period's token budget — a banded percentage, never the session/tenant breakdown or the raw counts behind it."
      hero={
        <TransparencyMetric
          label="Token budget used · this period"
          value={String(b.pctUsed)}
          unit="%"
          tone={band.tone}
          status={b.bandLabel}
          detail={`≈ ${b.consumedDisplay} of ≈ ${b.budgetDisplay} tokens used this period.`}
        >
          <div data-testid="token-budget-bar">
            <div className="flex items-center justify-between text-eyebrow uppercase text-muted">
              <span>Budget consumed</span>
              <span className="tabular-nums">{b.pctUsed}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-edge">
              <div
                className={`h-full rounded-full ${band.bar}`}
                style={{ width: `${b.pctUsed}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-meta text-muted">
              Banded, coarsely rounded — the band, not a precise count, is the
              only signal exposed.
            </p>
          </div>
        </TransparencyMetric>
      }
      shows={
        <>
          <p>
            A <strong>token budget</strong> caps how many tokens an AI deployment
            can consume in a period. As it approaches the limit, the kernel
            starts <strong>deferring</strong> or <strong>refusing</strong> new
            actions instead of letting an agent loop run up an unbounded bill.
            This page is how much of that budget is gone — a single glance, not a
            spreadsheet.
          </p>
          <p className="mt-2 text-meta">
            For rough orientation only (illustrative, not a target): a typical
            SaaS deployment sits around 50–70% by mid-period; a conservative
            enterprise nearer 30–40%.
          </p>
        </>
      }
      notShown={
        <p>
          The figure is <strong>illustrative sample data</strong> for a single
          anonymous tenant. The operator console&apos;s{" "}
          <strong>per-tenant and per-session breakdown</strong>, the tenant and
          session ids, the <strong>exact token counts</strong>, and the
          budget-exhaustion timeline are <strong>never</strong> exposed here —
          the public shape carries only a percentage, a band, and rounded
          approximations.
        </p>
      }
      footnote="Enforcement of budgets is a kernel decision in the operator console, audited and replayable; this public page is read-only telemetry."
    />
  );
}
