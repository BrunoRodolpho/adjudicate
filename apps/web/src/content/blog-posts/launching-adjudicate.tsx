import { Code } from "@/components/blog/Code";
import { Prose } from "@/components/blog/Prose";
import { Lead } from "@/components/blog/PullQuote";

const SAMPLE = `// Six structured outcomes — every adjudication returns one.
type Decision =
  | { kind: "EXECUTE";              basis: DecisionBasis[] }
  | { kind: "REFUSE";               refusal: Refusal; basis: DecisionBasis[] }
  | { kind: "REWRITE";              rewritten: IntentEnvelope; reason: string; basis: DecisionBasis[] }
  | { kind: "DEFER";                signal: string; timeoutMs: number; basis: DecisionBasis[] }
  | { kind: "ESCALATE";             to: "human" | "supervisor"; reason: string; basis: DecisionBasis[] }
  | { kind: "REQUEST_CONFIRMATION"; prompt: string; basis: DecisionBasis[] };`;

export function LaunchingAdjudicate() {
  return (
    <Prose>
      <Lead>
        Adjudicate is a decision kernel for AI actions. It decides whether
        AI actions should execute, change, wait, escalate, or stop.
      </Lead>
      <p>
        Modern AI agents call tools. Most agent frameworks ship the tool call
        straight to your database, payment provider, or email API the moment
        the model decides to invoke it. We think that&apos;s the wrong default. The
        LLM is a probabilistic prompt-to-tool-call layer; the system on the
        other end is deterministic, transactional, and accountable. Putting
        them in direct contact gives you the worst of both: the model&apos;s
        confidence with the system&apos;s blast radius.
      </p>
      <p>
        Adjudicate is the policy-and-audit kernel between the two. It accepts
        an IntentEnvelope from anything that can serialise one (LLM bridge,
        workflow runner, internal API) and returns one of six structured
        outcomes:
      </p>
      <Code code={SAMPLE} lang="ts" />
      <p>
        Two of those — DEFER and REWRITE — are the answers OPA and Cedar
        can&apos;t express. DEFER models async-as-first-class: the kernel parks
        an intent on an external signal (a payment webhook, a vendor
        callback, a CI green) and re-adjudicates when the signal arrives.
        REWRITE lets the kernel return a sanitised replacement envelope —
        clamp a refund to the original charge, normalise Unicode in user
        input, cap a deployment ramp. That&apos;s a kernel-owned modification,
        not the model proposing a different action.
      </p>
      <h2>What ships in v0.1</h2>
      <ul>
        <li>
          The seven kernel primitives — IntentEnvelope, Decision, Guard,
          PolicyBundle, Ledger, AuditRecord (v3 with supersession links),
          RuntimeContext.
        </li>
        <li>
          Three real Packs — Payments · PIX, Identity · KYC, Deployments ·
          Approval. Each exercises a different corner of the Decision
          algebra.
        </li>
        <li>
          GuardMetadata for analyser tooling, describePolicyBundle for
          policy introspection, explainRecord for human-readable audit
          translations.
        </li>
        <li>
          An operator console with Audit Explorer, kill switch,
          outcome-distribution dashboard, and governance visualiser.
        </li>
        <li>
          Property tests (fast-check) for determinism, replay-safety, and
          fail-closed defaults.
        </li>
      </ul>
      <h2>What we deliberately did not ship</h2>
      <p>
        No agent framework, no prompt library, no orchestration runtime.
        Adjudicate is the layer the model and the side-effect both rely on
        — a small, named, deterministic surface that&apos;s the same whether
        you&apos;re behind ChatGPT, an internal LLM, or a hand-built workflow.
      </p>
      <p>
        v0.2 lands real KernelIdentity signing, persistent guard-stats with
        compaction, an L2 primitives extraction across the three Packs, and
        a <code>derivePack</code> composition primitive. The roadmap is open in
        the repo.
      </p>
    </Prose>
  );
}
