import Link from "next/link";
import { CodeBlock } from "@/components/ui/CodeBlock";

const DEFER_GUARD = `import { createStateDeferGuard } from "@adjudicate/primitives";
import { basis } from "@adjudicate/core";

// kyc.start always DEFERs: the kernel parks the intent on a wire signal and
// the runtime resumes the SAME intent when that signal fires (the adopter's
// documents-uploaded webhook), or ages it out past the timeout.
const requireDocumentUpload = createStateDeferGuard<string, unknown, unknown>({
  matches: (env) => env.kind === "kyc.start",
  signal: "kyc.documents.uploaded",
  timeoutMs: 24 * 60 * 60 * 1000, // 24h
  basis: [
    basis("state", "transition_valid", {
      reason: "documents_required",
      transition: "INIT→DOCS_REQUIRED",
    }),
  ],
});`;

const RESUME = `// The DEFER decision carries a signal + timeout. Park the intent, persist
// the AuditRecord, and return control to the caller — no side-effect runs.
const result = await adjudicateAndAudit(envelope, state, policy, { sink });

if (result.decision.kind === "DEFER") {
  await park({
    envelope,                       // the EXACT intent, stored verbatim
    signal: result.decision.signal, // "kyc.documents.uploaded"
    timeoutMs: result.decision.timeoutMs,
  });
}

// ...hours later, your webhook fires. Re-adjudicate the SAME envelope
// against the now-advanced state. Documents present -> EXECUTE.
async function onDocumentsUploaded(sessionId: string) {
  const parked = await unpark(sessionId);
  const next = await adjudicateAndAudit(
    parked.envelope,                // not a new intent — the resumed one
    await loadState(sessionId),
    policy,
    { sink },
  );
  if (next.decision.kind === "EXECUTE") await execute(parked.envelope);
}`;

export function HumanApprovalResume() {
  return (
    <article className="prose-body flex flex-col gap-5">
      <p className="text-lg italic text-ink">
        Some agent actions cannot proceed until a human responds — an upload, an
        approval, a vendor callback. The wrong answer is to refuse them. The
        right one is to <em>park</em> the intent and resume the very same step
        when the signal arrives.
      </p>
      <p>
        Most guardrail systems can only say yes or no. That forces an awkward
        choice for anything human-in-the-loop: either block the action (and lose
        the agent&apos;s context) or wave it through and bolt on approval
        somewhere else. Adjudicate has a third outcome built into the decision
        algebra — <code>DEFER</code> — that models async as a first-class
        result.
      </p>
      <p>
        When the kernel returns <code>DEFER</code>, it hands back a{" "}
        <code>signal</code> and a <code>timeoutMs</code>. Your runtime parks the
        intent against that signal. When the signal fires — a documents-uploaded
        webhook, a reviewer clicking approve — the runtime re-adjudicates the{" "}
        <strong>same intent</strong> against the now-advanced state. Nothing was
        refused, nothing was re-derived by the model, and no side-effect ran in
        between. Remember the kernel is pure: it never calls your APIs. It only
        ever tells your executor what to do, and on <code>DEFER</code> the
        answer is &quot;wait.&quot;
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        The DEFER guard
      </h2>
      <p>
        Here is the guard the Identity / KYC pack ships. A <code>kyc.start</code>{" "}
        intent always defers on the documents-uploaded signal — the canonical
        &quot;we need a human to do something first&quot; gate:
      </p>
      <CodeBlock code={DEFER_GUARD} language="ts" copyable />
      <p>
        The same shape applies to PIX flows where a transfer waits on a payment
        webhook, or any approval gate where the agent should hold rather than
        guess. The full guard and a live run are in the{" "}
        <Link
          href="/recipes/pause-for-human"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          pause for human approval recipe
        </Link>
        .
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        Park and resume — safely
      </h2>
      <p>
        The runtime side is small. Persist the deferred envelope verbatim, wait
        for the signal, then feed the <em>exact same envelope</em> back through
        the kernel:
      </p>
      <CodeBlock code={RESUME} language="ts" copyable />
      <p>
        Two properties make this safe rather than a footgun. First, you resume
        the stored envelope, not a fresh model output — so a flaky model on
        re-run cannot quietly swap the action out from under the approval.
        Second, the original <code>DEFER</code> and the eventual{" "}
        <code>EXECUTE</code> are both audited records linked by the intent&apos;s
        nonce, each with an <code>auditHash</code>. The pause and the resume are
        one tamper-evident story, not two disconnected log lines.
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">
        Timeouts and dead-ends
      </h2>
      <p>
        A parked intent is not parked forever. The <code>timeoutMs</code> on the
        decision is the deadline; if the signal never arrives, the runtime ages
        the intent out and re-adjudicates — which, with documents still missing,
        will not <code>EXECUTE</code>. That is the difference between
        &quot;waiting&quot; and &quot;stuck&quot;: the wait is bounded and
        recorded.
      </p>
      <p>
        For the human-facing side of this — queues, reviewer assignment, and the
        approval surface — see the{" "}
        <Link
          href="/capabilities/smart-approval-engine"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          smart approval engine capability
        </Link>
        .
      </p>
      <p>
        Install is real: <code>pnpm add @adjudicate/core @adjudicate/pack-identity-kyc</code>.
        The kernel is v1.x and API-frozen, so the <code>DEFER</code> contract —{" "}
        <code>signal</code>, <code>timeoutMs</code>, replayable resume — is
        stable to build a runtime against.
      </p>
    </article>
  );
}
