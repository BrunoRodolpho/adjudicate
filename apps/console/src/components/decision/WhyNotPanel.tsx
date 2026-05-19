import type { AuditRecord, DecisionBasis, DecisionKind } from "@adjudicate/core";
import { decisionTheme, DECISION_KIND_ORDER } from "@/lib/decision-theme";

/**
 * Why-not-other-decisions panel (T-081).
 *
 * For the SHOWN decision, explains which OTHER Decision kinds the kernel
 * did NOT reach, and one-liner reasoning per kind. The reasoning is
 * derived from the record's `decision_basis` — the basis entries record
 * every phase the kernel completed, so we can infer what each branch
 * would have required to fire.
 *
 * The framework's six-decision algebra is the differentiating claim;
 * being able to articulate "why not REWRITE? Why not ESCALATE?" in
 * deterministic, basis-grounded terms is the differentiator's visible
 * payoff. The text is intentionally compact (one line per non-matched
 * kind) — a fuller "trace-replay" view is reserved for later work.
 */
export function WhyNotPanel({ record }: { record: AuditRecord }) {
  const actual = record.decision.kind;
  const basis = record.decision_basis;
  const others = DECISION_KIND_ORDER.filter((k) => k !== actual);

  return (
    <section className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/40 p-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Why not other decisions
        </h2>
        <span className="text-[10px] text-faint">
          {basis.length} basis entr{basis.length === 1 ? "y" : "ies"} explain this
          decision
        </span>
      </header>
      <p className="text-[11px] text-muted">
        The kernel produced{" "}
        <span className={decisionTheme[actual].fg}>{actual}</span> for this
        envelope. Here is what each non-matched Decision kind would have
        required.
      </p>
      <ul className="flex flex-col gap-1.5">
        {others.map((kind) => {
          const t = decisionTheme[kind];
          return (
            <li
              key={kind}
              className="flex items-start gap-2 rounded-sm border border-edge bg-canvas px-2 py-1.5"
            >
              <span
                className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${t.border} ${t.bg} ${t.fg}`}
              >
                <span aria-hidden className={`h-1 w-1 rounded-full ${t.dot}`} />
                {t.label}
              </span>
              <p className="text-[11px] leading-relaxed text-muted">
                {explainNonMatch(kind, actual, basis)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] italic text-faint">
        Derived from the recorded basis — not a counterfactual rerun of the
        kernel. For full re-adjudication, use the Replay action.
      </p>
    </section>
  );
}

/**
 * One-liner per non-matched Decision kind, conditioned on the actual
 * decision and the basis vocabulary recorded. The strings are operator-
 * facing English; adopters localizing the console will translate here.
 */
function explainNonMatch(
  candidate: DecisionKind,
  actual: DecisionKind,
  basis: readonly DecisionBasis[],
): string {
  const businessHit = basis.find(
    (b) => b.category === "business" && b.code !== "rule_satisfied",
  );
  const refused = basis.find(
    (b) =>
      b.category === "auth" ||
      b.category === "taint" ||
      b.category === "schema" ||
      b.category === "kill" ||
      b.category === "ledger",
  );
  const business = basis.filter((b) => b.category === "business");
  const allowed = actual === "EXECUTE";

  switch (candidate) {
    case "EXECUTE":
      if (allowed) return "—";
      if (refused)
        return `Would require all guards to pass — \`${refused.category}.${refused.code}\` blocked the path.`;
      if (businessHit)
        return `Would require all business guards to pass — \`${businessHit.code}\` matched first.`;
      return "Would require every guard in the policy to return `rule_satisfied`.";
    case "REFUSE":
      if (actual === "REFUSE") return "—";
      return "Would require an enforce-class guard (`auth`, `taint`, `ledger`, `schema`, or `kill`) to violate.";
    case "DEFER":
      if (actual === "DEFER") return "—";
      return "Would require a guard to return DEFER with a `signal` + `timeoutMs`. None did.";
    case "ESCALATE":
      if (actual === "ESCALATE") return "—";
      return "Would require a guard to escalate to `human` or `supervisor`. None did.";
    case "REQUEST_CONFIRMATION":
      if (actual === "REQUEST_CONFIRMATION") return "—";
      return "Would require a confirmation-requesting guard. None fired.";
    case "REWRITE":
      if (actual === "REWRITE") return "—";
      return business.length > 0
        ? "Would require a sanitize/normalize/cap guard to produce a rewritten envelope. None did."
        : "Would require a structural sanitization guard. None matched.";
  }
}
