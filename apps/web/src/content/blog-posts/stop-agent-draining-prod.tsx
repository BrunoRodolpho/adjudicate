import Link from "next/link";
import { CodeBlock } from "@/components/ui/CodeBlock";

const RAMP_CLAMP = `import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionRewrite,
} from "@adjudicate/core";
import type { Guard } from "@adjudicate/core/kernel";

const MAX_PRODUCTION_RAMP_PERCENT = 25;

// A production ramp above the cap is REWRITTEN down to the maximum, so a
// typo (or a hallucinated "100") can't push all of prod traffic at a new
// build. actor / taint / nonce pass through unchanged, so the rewritten
// intent stays auditable.
const clampProductionRamp: Guard<string, unknown, unknown> = (envelope) => {
  if (envelope.kind !== "deployment.approval.request") return null;
  const p = envelope.payload as { environment: string; rampPercent?: number };
  if (p.environment !== "production") return null;
  if ((p.rampPercent ?? 100) <= MAX_PRODUCTION_RAMP_PERCENT) return null;

  const rewritten = buildEnvelope({
    kind: envelope.kind,
    payload: { ...p, rampPercent: MAX_PRODUCTION_RAMP_PERCENT },
    actor: envelope.actor,
    taint: envelope.taint,
    nonce: envelope.nonce,
    createdAt: envelope.createdAt,
  });
  return decisionRewrite(
    rewritten,
    \`Production ramp clamped from \${p.rampPercent ?? 100}% to \${MAX_PRODUCTION_RAMP_PERCENT}%.\`,
    [basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
      requested: p.rampPercent ?? 100,
      cap: MAX_PRODUCTION_RAMP_PERCENT,
    })],
  );
};`;

const TOKEN_BUDGET = `import { createTokenBudgetGuard } from "@adjudicate/primitives";

// A runaway loop keeps calling the model. This guard reads a consumed-tokens
// counter from state S and REFUSEs the next step once it crosses the budget —
// a hard cost ceiling, not an unbounded bill. Given a fixed S the decision is
// pure and replay-verifiable.
const tokenBudgetGuard = createTokenBudgetGuard<string, unknown, unknown>({
  extractSessionTokens: (s) =>
    (s as { tokensConsumed?: number }).tokensConsumed ?? 0,
  sessionBudget: 5000, // hard per-session cap
});`;

export function StopAgentDrainingProd() {
  return (
    <article className="prose-body flex flex-col gap-5">
      <p className="text-lg italic text-ink">
        An AI agent with deploy access, a shell, and a model loop can do real
        damage to production before anyone reads the logs. Here is how to put a
        deterministic kernel between the model and the blast radius.
      </p>
      <p>
        The failure mode is familiar. An agent is wired to your CI, your
        terminal, and your billing-backed model API. It is confident,
        autonomous, and occasionally wrong — a hallucinated ramp percentage, a
        retry storm that never terminates, a piped-from-the-internet shell
        command it &quot;decided&quot; was safe. None of these are exotic
        attacks. They are ordinary agent behaviour meeting a system with no
        ceiling.
      </p>
      <p>
        The fix is not a smarter prompt. It is a policy kernel —{" "}
        <code>@adjudicate/core</code> — sitting between the model and every
        side-effect. The kernel is <strong>pure</strong>: it never calls your
        APIs. It takes an intent, returns one of six structured outcomes, and
        your executor runs the side-effect only when the outcome is{" "}
        <code>EXECUTE</code>. For draining-prod scenarios, the two outcomes that
        matter are <code>REWRITE</code> (clamp the action to something safe) and{" "}
        <code>REFUSE</code> (stop it cold).
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        1. Clamp the deploy ramp
      </h2>
      <p>
        A production rollout at 100% ramp is the single fastest way to turn a
        bad build into an outage. You do not want to refuse every deploy — you
        want over-sized ramps reduced to a safe ceiling automatically, with a
        receipt. The deployments-approval pack ships exactly this guard:
      </p>
      <CodeBlock code={RAMP_CLAMP} language="ts" copyable />
      <p>
        A request for <code>production</code> at <code>100%</code> comes back as
        a <code>REWRITE</code> down to <code>25%</code> — a kernel-owned
        modification, not the model proposing a different action. The same pack
        also <code>ESCALATE</code>s an un-approved production release to a human.
        Full worked code and a live run are in the{" "}
        <Link
          href="/recipes/gate-prod-deploys"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          gate production deploys recipe
        </Link>
        .
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        2. Cap the token spend
      </h2>
      <p>
        The second drain is financial. An agent stuck in a loop will keep
        hitting the model until the bill — or a rate limit — stops it. A
        per-session token budget held in audited state turns that into a hard,
        deterministic ceiling:
      </p>
      <CodeBlock code={TOKEN_BUDGET} language="ts" copyable />
      <p>
        Once <code>tokensConsumed</code> crosses <code>5000</code>, the next{" "}
        <code>agent.step</code> is <code>REFUSE</code>d. (Swap{" "}
        <code>action: &quot;DEFER&quot;</code> to park the session on a
        budget-reset signal instead of killing it.) The full guard and a live
        run are in the{" "}
        <Link
          href="/recipes/cap-token-spend"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          cap token spend recipe
        </Link>
        .
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        3. Score the command risk
      </h2>
      <p>
        The third drain is the shell. A terminal agent will, sooner or later,
        propose <code>curl … | sh</code> or a destructive flag. The
        command-risk guard classifies a proposed command into a risk{" "}
        <em>category</em> and disposes it — safe commands <code>EXECUTE</code>,
        recoverable ones <code>REQUEST_CONFIRMATION</code>, strippable danger
        flags <code>REWRITE</code>, and irrecoverable ones <code>REFUSE</code>.
        Crucially, the decision is reported by category and basis only; the raw
        command string is never echoed into the audit surface. See the{" "}
        <Link
          href="/capabilities/command-risk-guard"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          command-risk guard capability
        </Link>{" "}
        for the full classification model.
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        Why a kernel and not a try/catch
      </h2>
      <p>
        Each of these is a small, named guard. Composed in a{" "}
        <code>PolicyBundle</code>, they run in order and short-circuit on the
        first match — ramp clamp, then approval escalation, then budget, then
        command risk. Every decision produces an <code>AuditRecord</code> with
        an <code>auditHash</code> for tamper-evidence (Postgres persistence is
        optional; the hash chain stands on its own). Because the kernel is pure
        and deterministic, you can replay any record and get the same outcome —
        which is what makes &quot;the agent did X&quot; a verifiable claim
        rather than a guess.
      </p>
      <p>
        Install is real:{" "}
        <code>pnpm add @adjudicate/core @adjudicate/pack-deployments-approval</code>
        . The kernel is v1.x and API-frozen. Bridges for{" "}
        <code>@adjudicate/anthropic</code> and <code>@adjudicate/openai</code>{" "}
        turn a model tool-call into an intent the kernel can adjudicate — so the
        same ceilings apply no matter which model is driving.
      </p>
    </article>
  );
}
