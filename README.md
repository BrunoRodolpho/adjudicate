# adjudicate

> **Policy-as-code for AI agents.**

Modern AI agents call tools. Most agent frameworks ship the tool call straight to your database, payment provider, or email API the moment the model decides to invoke it. **adjudicate** inserts a deterministic policy kernel between the model and the side-effect: the LLM proposes a structured intent, the kernel adjudicates it against a typed `PolicyBundle` and current state, and only six outcomes are possible — execute, refuse, defer, escalate, ask for confirmation, or rewrite to a sanitized variant. Where OPA and Cedar return yes/no on a single proposed action, adjudicate returns six — including two (`DEFER` and `REWRITE`) that policy engines can't express. The result: every state mutation is policy-checked, replay-safe, and audit-grade. The model has zero authority to mutate state.

> **New here?** Start with [**Concepts**](./docs/concepts.md) — the plain-English
> tour of the kernel, rulebooks, and the six Decision outcomes. The rest of this
> README and the per-package READMEs are reference docs that read better once
> the mental model is in place.

## Packages

| Package | What it gives you |
|---|---|
| [`@adjudicate/core`](./packages/core) | Types (`IntentEnvelope`, `Decision`, `Refusal`, `AuditRecord`), the deterministic kernel (`adjudicate`, `PolicyBundle`, combinators) at the `/kernel` subpath, and the LLM-side surface (`CapabilityPlanner`, `ToolClassification`, `PromptRenderer`) at `/llm`. |
| [`@adjudicate/runtime`](./packages/runtime) | Replay-safe park + resume for deferred intents (`parkDeferredIntent`, `resumeDeferredIntent`, `deferResumeHash`) plus deadline helpers (`deadlinePromise`). |
| [`@adjudicate/audit`](./packages/audit) | Two-track persistence: hot-path replay `Ledger` (Memory/Redis) and cold-path durable `AuditSink` (Console/NATS); replay harness for offline determinism checks. |
| [`@adjudicate/audit-postgres`](./packages/audit-postgres) | Reference Postgres `AuditSink` + replay reader. Schema in `migrations/`. |
| [`@adjudicate/pack-payments-pix`](./packages/pack-payments-pix) | First domain Pack — Brazil's PIX payment lifecycle. Exercises every Decision outcome including the async DEFER → webhook → resume cycle. |
| [`@adjudicate/anthropic`](./packages/anthropic) | Reference Anthropic Messages-API integration. `createAdjudicatedAgent` wires the kernel into Claude's tool-use loop with all six Decisions translated to tool_result protocol. |

## Examples

| Example | What it shows |
|---|---|
| [`examples/quickstart-anthropic`](./examples/quickstart-anthropic) | Runnable end-to-end demo. Hits the real Anthropic API and exercises every kernel Decision against the PIX Pack in one script. The fastest way to see the framework in motion. |
| [`examples/vacation-approval`](./examples/vacation-approval) | Neutral hello-world. Three intent kinds, one PolicyBundle, six tests — one per Decision outcome. |
| [`examples/commerce-reference`](./examples/commerce-reference) | Cart → checkout → payment lifecycle with REWRITE-on-quantity-cap, DEFER-on-pending-payment, AUTH refusals, and state-aware capability planning. |

## 30-second example

```ts
import Anthropic from "@anthropic-ai/sdk";
import { installPack } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createAnthropicPromptRenderer,
  createInMemoryDeferStore,
  createInMemoryConfirmationStore,
} from "@adjudicate/anthropic";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

const { pack } = installPack(paymentsPixPack);

const agent = createAdjudicatedAgent({
  pack,
  anthropicClient: new Anthropic(),
  model: "claude-opus-4-7",
  maxTokens: 1024,
  renderer: createAnthropicPromptRenderer({
    packId: pack.id,
    toolSchemas: PIX_INTENT_TOOL_SCHEMAS, // see quickstart for the literal
  }),
  deferStore: createInMemoryDeferStore(),
  confirmationStore: createInMemoryConfirmationStore(),
  executor: myAdopterExecutor, // calls the real PIX provider on EXECUTE
});

const result = await agent.send({
  sessionId: "s-1",
  userMessage: "Refund the last R$ 200 charge.",
  state: currentPixState,
  context: { customerId: "c-1", merchantId: "m-1" },
});

// result.outcome ∈
//   { kind: "completed", assistantText: "..." }
//   { kind: "deferred", signal: "payment.confirmed", intentHash: "..." }
//   { kind: "awaiting_confirmation", prompt: "...", confirmationToken: "..." }
//   { kind: "escalated", to: "supervisor", reason: "..." }
//   { kind: "max_iterations_exceeded", lastDecision: ... }
```

The runnable version with all six Decisions visible in console output:

```bash
cd examples/quickstart-anthropic
cp .env.example .env  # add your ANTHROPIC_API_KEY
pnpm install
pnpm --filter @example/quickstart-anthropic dev
```

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

## How adjudicate compares

|                                          | function-calling | agent frameworks (LangChain, Mastra) | policy engines (OPA, Cedar) | adjudicate |
|---                                       |---               |---                                   |---                          |---         |
| Yes/no decision                          | ✓                | ✓                                    | ✓                           | ✓          |
| LLM has zero mutation authority          | ✗                | ✗                                    | ✓                           | ✓          |
| Tool visibility filtered per state       | ✗                | partial                              | ✗                           | ✓          |
| **DEFER** — async as a first-class outcome | ✗              | ✗                                    | ✗                           | ✓          |
| **REWRITE** — kernel-owned sanitization  | ✗                | ✗                                    | ✗                           | ✓          |
| Taint provenance as a runtime gate       | ✗                | ✗                                    | ✗                           | ✓          |
| Replay-safe by `intentHash`              | ✗                | ✗                                    | ✗                           | ✓          |
| Audit record per decision                | ✗                | partial                              | ✓                           | ✓          |

Function-calling has two states: ran or threw. Agent frameworks add ergonomic glue but ship `LLM → tool → DB` directly. Policy engines (OPA, Cedar) gate yes/no on a single action but don't model async lifecycle, sanitization, or input provenance. adjudicate occupies the intersection: deterministic policy adjudication on every LLM-proposed mutation, with the three outcomes the others can't express.

## Status

> **`v0.1.0-experimental`** — kernel surface stable enough for experimentation; the policy-primitives layer is intentionally not yet extracted. npm publish pending `@adjudicate` org claim.

**Maturity ladder** (per [`docs/concepts.md §9`](./docs/concepts.md#9-architectural-direction-intended-evolution)):

| Layer | Status | What's there |
|---|---|---|
| **L1 — Kernel** | shipped | `adjudicate()`, `PolicyBundle`, taint lattice, audit emission, replay safety. The 5 headline interfaces (`IntentEnvelope`, `Decision`, `PolicyBundle`, `CapabilityPlanner`, `AuditSink`) are API-stable. |
| **L2 — Policy primitives** | emerging | `createPixPendingDeferGuard` is the first guard factory; the full library extracts after Pack #2 / Pack #3 land — Rule of Three. |
| **L3 — Domain Packs** | partial | `@adjudicate/pack-payments-pix` is the lighthouse; `vacation-approval` and `commerce-reference` are reference examples (handwritten guards, not yet Pack-shaped). |

**Heads-up on rework**: the user message of the framework will sharpen further when L2 lands. The 5 stable interfaces don't change; surface area that *will* shift is documented in [`@adjudicate/anthropic`'s README](./packages/anthropic/README.md#l2-rework-callouts) so adopters know what to expect.

**What's coming**: additional domain Packs (chosen to surface different shapes — HR approvals, sync-money, deploys), channel adapters, an observability dashboard, and a governance layer. Tracked in [issues](https://github.com/BrunoRodolpho/adjudicate/issues).

**Not for production yet.** The integration surface (subpath exports, peer deps, error shapes) may shift before `v1.0.0`.

**Prior art**: this is the same architecture pattern recently named in academic literature (CaMeL, FIDES, KAIJU) — implemented as a small set of TypeScript packages adopters wire into their own apps.

## Documentation

- **Concepts (start here)** — [`docs/concepts.md`](./docs/concepts.md): the
  mental model behind the framework — kernel as engine, Pack as rulebook,
  six Decision outcomes, anatomy of a `PolicyBundle`, and a side-by-side of
  the two reference examples.
- **Per-package READMEs** — reference docs once concepts click. Start in
  [`packages/core/README.md`](./packages/core/README.md) and
  [`packages/anthropic/README.md`](./packages/anthropic/README.md).
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

[MIT](./LICENSE)
