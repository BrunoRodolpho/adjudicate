# adjudicate

> **Zero-trust runtime for LLM intent execution.**

The LLM is a semantic parser with **zero authority** to mutate state.
Every mutation crosses a deterministic kernel that decides — based on
typed policy, taint provenance, and current state — whether to execute,
refuse, defer, escalate, ask the user to confirm, or silently rewrite a
sanitized variant. Audit records are durable, replays are deterministic,
and webhooks are idempotent by construction.

This is the same architecture pattern recently named in academic
literature (CaMeL, FIDES, KAIJU) — implemented as a small set of
TypeScript packages adopters wire into their own apps.

## Lifecycle

```
                       ┌──────────────────────────────────────────────────────┐
                       │                  ADOPTER CODE                         │
                       │  (your app: HTTP route / WhatsApp webhook / CLI)     │
                       └───────────────────────┬──────────────────────────────┘
                                               │  user message + state
                                               ▼
   ╔══════════════════════════════════════════════════════════════════════════╗
   ║                       @adjudicate/* FRAMEWORK                             ║
   ║                                                                           ║
   ║   ┌─────────────────────┐    visible tools only    ┌──────────────────┐  ║
   ║   │ CapabilityPlanner   │ ───────────────────────▶ │       LLM        │  ║
   ║   │  @adjudicate/core   │   (MUTATING filtered)    │  (semantic only) │  ║
   ║   │       /llm          │                          │                  │  ║
   ║   └─────────────────────┘                          └────────┬─────────┘  ║
   ║                                                             │             ║
   ║                                          IntentEnvelope<k,p>│             ║
   ║                                          + intentHash + taint             ║
   ║                                                             ▼             ║
   ║   ┌────────────────────────────────────────────────────────────────────┐ ║
   ║   │           adjudicate(envelope, state, policy)                       │ ║
   ║   │             @adjudicate/core/kernel                                 │ ║
   ║   │     ordered guards: state → auth → taint → business                 │ ║
   ║   └────────────────────────────────────────────────────────────────────┘ ║
   ║                                  │                                        ║
   ║              ┌───────┬───────────┼───────────┬────────────┐               ║
   ║              ▼       ▼           ▼           ▼            ▼               ║
   ║         ┌────────┐┌────────┐┏━━━━━━━━━━┓┌──────────┐┏━━━━━━━━━━━┓        ║
   ║         │EXECUTE ││ REFUSE │┃  DEFER   ┃│ ESCALATE │┃  REWRITE  ┃        ║
   ║         └────────┘└────────┘┃ (park &  ┃└──────────┘┃ (sanitize ┃        ║
   ║                             ┃  resume) ┃            ┃  & retry) ┃        ║
   ║                             ┗━━━━━━━━━━┛            ┗━━━━━━━━━━━┛        ║
   ║                                  │                                        ║
   ║              ┌───────────────────┴─────────────────────┐                  ║
   ║              ▼                                          ▼                 ║
   ║   ┌────────────────────┐                  ┌─────────────────────────┐    ║
   ║   │  Ledger (hot-path) │                  │    AuditSink (cold)     │    ║
   ║   │  replay protection │                  │ Console/NATS/Postgres   │    ║
   ║   │  @adjudicate/audit │                  │  @adjudicate/audit*     │    ║
   ║   └────────────────────┘                  └─────────────────────────┘    ║
   ╚══════════════════════════════════════════════════════════════════════════╝
                                  │
                                  │  if EXECUTE
                                  ▼
                       ┌──────────────────────────┐
                       │   ADOPTER EXECUTOR       │
                       │   (real side-effect)     │
                       └──────────────────────────┘

  Boxes drawn with ━━━ are the differentiators: DEFER (suspend → resume on signal)
  and REWRITE (kernel-owned sanitization). Function-calling and most agent
  frameworks return EXECUTE/REFUSE only; adjudicate's 6-valued Decision is
  what makes adversarial flows tractable.
```

## Packages

| Package | What it gives you |
|---|---|
| [`@adjudicate/core`](./packages/core) | Types (`IntentEnvelope`, `Decision`, `Refusal`, `AuditRecord`), the deterministic kernel (`adjudicate`, `PolicyBundle`, combinators) at the `/kernel` subpath, and the LLM-side surface (`CapabilityPlanner`, `ToolClassification`, `PromptRenderer`) at `/llm`. |
| [`@adjudicate/runtime`](./packages/runtime) | Replay-safe resume for deferred intents (`resumeDeferredIntent`, `deferResumeHash`) plus deadline helpers (`deadlinePromise`) for orchestrators that race async generators against wall-clock timeouts. |
| [`@adjudicate/audit`](./packages/audit) | The two-track persistence model: hot-path replay `Ledger` (Memory/Redis) and cold-path durable `AuditSink` (Console/NATS); replay harness for offline determinism checks. |
| [`@adjudicate/audit-postgres`](./packages/audit-postgres) | Reference Postgres `AuditSink` + replay reader. Schema in `migrations/`. |

## Examples

| Example | What it shows |
|---|---|
| [`examples/vacation-approval`](./examples/vacation-approval) | Neutral hello-world. Three intent kinds, one PolicyBundle, six tests — one per Decision outcome (`EXECUTE` / `REFUSE` / `ESCALATE` / `REQUEST_CONFIRMATION` / `DEFER` / `REWRITE`). |
| [`examples/commerce-reference`](./examples/commerce-reference) | Cart → checkout → payment lifecycle with REWRITE-on-quantity-cap, DEFER-on-pending-payment, AUTH refusals, and state-aware capability planning. Derived from a production WhatsApp commerce bot. |

## 30-second example

```ts
import { buildEnvelope, decisionExecute, decisionRefuse, refuse, basis, BASIS_CODES } from "@adjudicate/core";
import { adjudicate, type PolicyBundle } from "@adjudicate/core/kernel";

const policy: PolicyBundle<"vacation.request", { days: number }, { ptoBalance: number }> = {
  stateGuards: [],
  authGuards: [],
  taint: { minimumFor: () => "UNTRUSTED" },
  business: [
    (env, state) => env.payload.days <= state.ptoBalance ? null : decisionRefuse(
      refuse("BUSINESS_RULE", "pto.insufficient_balance", "Not enough balance."),
      [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
    ),
  ],
  default: "EXECUTE",
};

const envelope = buildEnvelope({
  kind: "vacation.request",
  payload: { days: 5 },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
});

const decision = adjudicate(envelope, { ptoBalance: 10 }, policy);
//    ^? Decision (kind: "EXECUTE", basis: [...])
```

## Why adjudicate vs. raw function-calling, LangChain, Mastra

1. **The LLM has zero mutation authority.** Function-calling and most
   agent frameworks ship `LLM → tool → DB` directly. adjudicate inserts a
   deterministic kernel: the LLM proposes; the kernel disposes. Tools the
   policy doesn't allow at this turn aren't visible to the model.
2. **`DEFER` is a first-class outcome.** Real flows have valid-but-pending
   intents (awaiting payment confirmation, manager approval, inventory).
   Function-calling has two states: ran or threw. adjudicate has six.
3. **Replay safety is architectural.** Content-addressed `intentHash` +
   `Ledger` SET-NX dedup means duplicate webhook deliveries fold into a
   single execution — every adopter, not every per-tool implementation.
4. **Auditability for regulated domains.** You can replay the full
   decision: envelope, taint, which guards fired, basis codes, decision.
   Function-calling gives you `(call, result)` pairs.

## Status

`v0.1.0` — pre-stable. The 5 headline interfaces (`IntentEnvelope`,
`Decision`, `PolicyBundle`, `CapabilityPlanner`, `AuditSink`) are
considered stable. The integration surface (subpath exports, peer deps,
error shapes) may shift before `v1.0.0`.

## Documentation

- **Per-package READMEs** — start in [`packages/core/README.md`](./packages/core/README.md).
- **ADR #9** — [`docs/architecture/decisions.md`](./docs/architecture/decisions.md)
  documents the 8-layer defense and the load-bearing invariants.
- **Staged rollout playbook** — [`docs/ops/runbooks/`](./docs/ops/runbooks/) —
  4-stage shadow → enforce ramp for adopters migrating from a legacy
  decision path.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The framework is small and
deliberately so; PRs that strengthen the invariants, broaden the example
coverage, or improve the docs are especially welcome.

## License

[Apache-2.0](./LICENSE) — patent grant matters for an adversarial-security
framework, and it matches LangChain / Mastra / Microsoft Agent Governance
Toolkit.
