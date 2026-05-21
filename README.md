# adjudicate

> **A decision kernel for AI actions — a control layer between AI intent and system execution.**
>
> *LLMs generate possibilities. Production systems require decisions.*
> It decides whether AI actions should execute, change, wait, escalate, or stop.

Modern AI agents call tools. Most agent frameworks ship the tool call straight to your database, payment provider, or email API the moment the model decides to invoke it. **adjudicate** inserts a deterministic decision kernel between the model and the side-effect: the LLM proposes a structured intent, the kernel adjudicates it against a typed `PolicyBundle` and current state, and only six outcomes are possible — execute, refuse, defer, escalate, ask for confirmation, or rewrite to a sanitized variant. Where OPA and Cedar return yes/no on a single proposed action, adjudicate returns six — including two (`DEFER` and `REWRITE`) that policy engines can't express. The result: every state mutation is policy-checked, replay-safe, and audit-grade. The model has zero authority to mutate state.

> **New here?** Start with [**Concepts**](./docs/concepts.md) — the plain-English
> tour of the kernel, rulebooks, and the six Decision outcomes. The rest of this
> README and the per-package READMEs are reference docs that read better once
> the mental model is in place.

## Packages

| Package | What it gives you |
|---|---|
| [`@adjudicate/core`](./packages/core) | Types (`IntentEnvelope`, `Decision`, `Refusal`, `AuditRecord`), the deterministic kernel (`adjudicate`, `adjudicateWithTrace`, `PolicyBundle`, combinators) at the `/kernel` subpath, and the LLM-side surface (`CapabilityPlanner`, `ToolClassification`, `PromptRenderer`) at `/llm`. |
| [`@adjudicate/primitives`](./packages/primitives) | Layer-2 risk primitives — `createThresholdGuard`, `createStateDeferGuard`, `createSystemTaintPolicy`. Reusable guard factories the domain Packs compose. |
| [`@adjudicate/runtime`](./packages/runtime) | Replay-safe park + resume for deferred intents (`parkDeferredIntent`, `resumeDeferredIntent`, `deferResumeHash`) plus deadline helpers (`deadlinePromise`). |
| [`@adjudicate/audit`](./packages/audit) | Two-track persistence: hot-path replay `Ledger` (Memory/Redis) and cold-path durable `AuditSink` (Console/NATS); replay harness for offline determinism checks. |
| [`@adjudicate/audit-postgres`](./packages/audit-postgres) | Reference Postgres `AuditSink` + replay reader. Schema in `migrations/`. |
| [`@adjudicate/admin-sdk`](./packages/admin-sdk) | Zod-validated read-only AQI + tRPC router for the Operator Console — audit query, emergency kill switch, replay verification. |
| [`@adjudicate/cli`](./packages/cli) | Pack lifecycle CLI — `pack init` to scaffold, `pack lint` against kernel conformance, `simulate` to run scenarios and gate on decision regressions. |
| [`@adjudicate/pack-payments-pix`](./packages/pack-payments-pix) | First domain Pack — Brazil's PIX payment lifecycle. Exercises every Decision outcome including the async DEFER → webhook → resume cycle. |
| [`@adjudicate/pack-identity-kyc`](./packages/pack-identity-kyc) | Second domain Pack — KYC identity verification. Multi-stage async lifecycle (start → upload → vendor callback), AML escalation, system-only-kind taint defense. |
| [`@adjudicate/pack-deployments-approval`](./packages/pack-deployments-approval) | Third domain Pack — software deployment gates. ESCALATE on production deploys without prior approval, REQUEST_CONFIRMATION before destructive rollback, REWRITE clamp on production ramp%. |
| [`@adjudicate/anthropic`](./packages/anthropic) | Reference Anthropic Messages-API integration. `createAdjudicatedAgent` wires the kernel into Claude's tool-use loop with all six Decisions translated to tool_result protocol. |

## Apps

| App | What it gives you |
|---|---|
| [`apps/console`](./apps/console) | Operator Console (port 5180). Audit Explorer, decision detail with supersession + why-not panels, /dashboard (outcome distribution), /governance (policy structure + guard-fire stats), and /control (kill switch). |
| [`apps/web`](./apps/web) | Marketing homepage + live playground (port 5181). Adjudicate any intent through the real kernel via `/api/playground/adjudicate`; flow simulators for PIX, KYC, and Deployments; GuardMetadata force-graph; embedded operator-console preview. |

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
   ║   │     ordered guards: state → taint → auth → business                 │ ║
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

> **`v1.0-rc`** — release-candidate posture. Kernel API frozen, 1022 tests passing, 19 workspace packages, scale-harness operational evidence captured ([`docs/perf/scale-baselines.json`](./docs/perf/scale-baselines.json)). v1.0 cut gates on the two adopter-evidence items in [`PROJECT_STATUS_AND_NEXT_STEPS.md`](./PROJECT_STATUS_AND_NEXT_STEPS.md) §Priority 1.

**Maturity ladder** (per [`docs/concepts.md §9`](./docs/concepts.md#9-architectural-direction-intended-evolution)):

| Layer | Status | What's there |
|---|---|---|
| **L1 — Kernel** | shipped, frozen | `adjudicate()`, `adjudicateAndAudit()`, `PolicyBundle`, taint lattice, replay safety, `verifyAuditRecord`. The 5 headline interfaces (`IntentEnvelope`, `Decision`, `PolicyBundle`, `CapabilityPlanner`, `AuditSink`) are API-stable and tracked in [`docs/release/V1_FREEZE_MATRIX.md`](./docs/release/V1_FREEZE_MATRIX.md). |
| **L2 — Risk primitives** | 3 frozen, 4 experimental | `createThresholdGuard`, `createStateDeferGuard`, `createSystemTaintPolicy` frozen. `createRewriteGuard`, `createConfirmGuard`, `createEscalateGuard`, `createIdempotencyGuard` ship as `@experimental` per [ADR-108](./docs/architecture/adr/) pending Pack #4–#6 feedback. All carry `GuardMetadata`. |
| **L3 — Domain Packs** | partial | Three published: `@adjudicate/pack-payments-pix` (lighthouse), `@adjudicate/pack-identity-kyc` (async + AML + taint defense), `@adjudicate/pack-deployments-approval` (deploy gates). `vacation-approval` and `commerce-reference` examples remain handwritten as onboarding surfaces. |
| **L4 — Adapter core** | shipped | [`@adjudicate/adapter-core`](./packages/adapter-core) — provider-neutral loop + bridge + decision translator + persistence shims + error taxonomy ([ADR-113](./docs/architecture/adr/)). Anthropic + OpenAI adapters are thin SDK shims over it. |
| **L4 — Observability / governance** | partial | `@adjudicate/observability` ships OTLP sinks + `SEMCONV` (16 stable attributes); `@adjudicate/admin-sdk` ships read-only AQI + tRPC router. Console real-time tail migration pending (primitives shipped). |

**What's open** — see [`PROJECT_STATUS_AND_NEXT_STEPS.md`](./PROJECT_STATUS_AND_NEXT_STEPS.md) for the priority-ordered list. v1.0-RC reports live at [`docs/release/V1_FREEZE_MATRIX.md`](./docs/release/V1_FREEZE_MATRIX.md), [`docs/release/V1_CERTIFICATION_REPORT.md`](./docs/release/V1_CERTIFICATION_REPORT.md), and [`docs/security/V1-SECURITY-AUDIT.md`](./docs/security/V1-SECURITY-AUDIT.md).

**Production posture.** Foundation is v1.0-ready for adopters who treat the framework as a per-decision substrate (the intended use). The closing gate for the `v1.0` tag itself is two adopter-evidence items: real-world kill-switch v2 propagation latency, and `AuditEventBus` throughput under a real WebSocket fan-out at scale.

**Prior art**: this is the same architecture pattern recently named in academic literature (CaMeL, FIDES, KAIJU) — implemented as a small set of TypeScript packages adopters wire into their own apps.

## Documentation

- **Concepts (start here)** — [`docs/concepts.md`](./docs/concepts.md): the mental model — kernel as engine, Pack as rulebook, six Decision outcomes, anatomy of a `PolicyBundle`.
- **AI agents** — [`AI_CONTEXT.md`](./AI_CONTEXT.md): dense brief on architecture, invariants, and how to modify safely.
- **Status & next steps** — [`PROJECT_STATUS_AND_NEXT_STEPS.md`](./PROJECT_STATUS_AND_NEXT_STEPS.md): authoritative open-work list.
- **Per-package READMEs** — reference docs. Start in [`packages/core/README.md`](./packages/core/README.md) and [`packages/anthropic/README.md`](./packages/anthropic/README.md).
- **Test your policy** — [`docs/guides/testing-your-policy.md`](./docs/guides/testing-your-policy.md): scenario fixtures + `adjudicate simulate` as a decision-regression gate.
- **Load-bearing decisions** — [`docs/architecture/decisions.md`](./docs/architecture/decisions.md) (8-layer defense + invariants) and the ADR series at [`docs/architecture/adr/`](./docs/architecture/adr/).
- **Wire format & hash spec** — [`docs/specs/intent-envelope-v2.schema.json`](./docs/specs/intent-envelope-v2.schema.json) (JSON Schema 2020-12) and [`docs/specs/canonical-json-hash.md`](./docs/specs/canonical-json-hash.md) (RFC 8785 JCS, golden vectors, Python cross-runtime check).
- **Staged rollout playbook** — [`docs/ops/runbooks/`](./docs/ops/runbooks/) — 4-stage shadow → enforce ramp.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The framework is small and
deliberately so; PRs that strengthen the invariants, broaden the example
coverage, or improve the docs are especially welcome.

## License

[MIT](./LICENSE)
