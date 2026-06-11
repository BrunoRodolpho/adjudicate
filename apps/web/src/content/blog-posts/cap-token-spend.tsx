import Link from "next/link";
import { Code } from "@/components/blog/Code";
import { Prose } from "@/components/blog/Prose";
import { Lead } from "@/components/blog/PullQuote";

const REFUSE_GUARD = `import { createTokenBudgetGuard } from "@adjudicate/primitives";

// Reads a consumed-tokens counter from state S and REFUSEs the step once it
// crosses the budget. The counter is folded into S after each LLM response,
// so given a fixed S the decision is pure and replay-verifiable.
const tokenBudgetGuard = createTokenBudgetGuard<string, unknown, unknown>({
  extractSessionTokens: (s) =>
    (s as { tokensConsumed?: number }).tokensConsumed ?? 0,
  sessionBudget: 5000, // hard per-session ceiling
});`;

const DEFER_VARIANT = `import { createTokenBudgetGuard } from "@adjudicate/primitives";

// Same budget, softer landing: instead of REFUSE, DEFER the step and park
// the session on a reset signal. When the budget is topped up (a new billing
// window, an operator override) the runtime resumes the same step.
const tokenBudgetGuard = createTokenBudgetGuard<string, unknown, unknown>({
  extractSessionTokens: (s) =>
    (s as { tokensConsumed?: number }).tokensConsumed ?? 0,
  sessionBudget: 5000,
  action: "DEFER",
  deferSignal: "token_budget_reset",
  deferTimeoutMs: 60 * 60 * 1000, // 1h
});`;

export function CapTokenSpend() {
  return (
    <Prose>
      <Lead>
        An agent loop that keeps calling the model has exactly one natural
        stopping point: the invoice. Here is how to give it a hard, replayable
        token ceiling instead.
      </Lead>
      <p>
        LLM cost is dominated by the long tail — the session that retries, the
        plan-execute loop that never converges, the prompt-injected agent told
        to &quot;keep going.&quot; Rate limits help, but they are the provider&apos;s
        ceiling, not yours, and they say nothing about <em>which</em> session is
        burning the budget. What you want is a per-session cap that <em>you</em>{" "}
        own, enforced before the next model call, with the counter living in
        audited state.
      </p>
      <p>
        That is a guard problem, and <code>@adjudicate/core</code> is built for
        it. The kernel is pure — it never calls the model or your billing API —
        so the budget guard does not meter tokens itself. It reads a
        consumed-tokens counter you fold into state after each response, and
        disposes the next step accordingly. Given a fixed state, the decision is
        deterministic and replay-verifiable.
      </p>

      <h2>The token-budget guard</h2>
      <p>
        The primitive is <code>createTokenBudgetGuard</code>. Point it at where
        your consumed-tokens counter lives in state, set the budget, and it
        handles the rest:
      </p>
      <Code code={REFUSE_GUARD} lang="ts" copyable />
      <p>
        Wire it into a <code>PolicyBundle</code> ahead of your normal
        agent-step logic. While <code>tokensConsumed</code> stays under{" "}
        <code>5000</code>, the guard returns <code>null</code> and the step
        proceeds. The moment it crosses the cap, the next <code>agent.step</code>{" "}
        comes back <code>REFUSE</code>d — a hard, deterministic stop with a basis
        explaining exactly why. The full guard and a live run that REFUSEs at{" "}
        <code>6000</code> tokens are in the{" "}
        <Link href="/recipes/cap-token-spend">cap token spend recipe</Link>.
      </p>

      <h2>REFUSE or DEFER?</h2>
      <p>
        A hard <code>REFUSE</code> is the right default for a cost ceiling — it
        stops the spend, full stop. But sometimes you do not want to kill the
        session, only to <em>pause</em> it until the budget is topped up. The
        same guard supports a <code>DEFER</code> variant that parks the step on a
        reset signal instead:
      </p>
      <Code code={DEFER_VARIANT} lang="ts" copyable />
      <p>
        Now an over-budget step is parked on <code>token_budget_reset</code>
        rather than refused. When the signal fires — a new billing window, an
        operator override — the runtime resumes the exact same step. (For how
        park-and-resume works end to end, see the related write-up on pausing an
        agent for human approval.) Either way, the spend never runs unbounded.
      </p>

      <h2>Why state, not a side-effect</h2>
      <p>
        The reason the counter lives in state — and not inside the guard — is
        replay. Because the guard is a pure function of the envelope and state
        S, you can take any historical <code>AuditRecord</code>, feed its inputs
        back through the kernel, and get the identical <code>REFUSE</code>. The
        <code>auditHash</code> on each record makes that tamper-evident:
        &quot;this session hit its cap at step 14&quot; becomes a verifiable
        claim, not a log you have to trust. Postgres persistence is optional;
        the hash chain stands on its own.
      </p>
      <p>
        For the full design — sliding windows, multi-tenant budgets, and how the
        counter is folded back into state — see the{" "}
        <Link href="/capabilities/token-budget-guard">
          token-budget guard capability
        </Link>
        .
      </p>
      <p>
        Install is real: <code>pnpm add @adjudicate/core @adjudicate/primitives</code>.
        The kernel is v1.x and API-frozen. The budget guard sits behind any
        model — wire it through <code>@adjudicate/anthropic</code> or{" "}
        <code>@adjudicate/openai</code> and the same ceiling applies regardless
        of which provider is running the loop.
      </p>
    </Prose>
  );
}
