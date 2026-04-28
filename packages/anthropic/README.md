# @adjudicate/anthropic

> Reference Anthropic Messages-API integration for [adjudicate](../../README.md).

The agent owns the Anthropic message loop and bridges `tool_use` blocks
to typed `IntentEnvelope`s. The kernel still adjudicates every proposed
mutation — the adapter sits *before* `adjudicate()` from
`@adjudicate/core/kernel`, never bypassing or short-circuiting it.

## Status

`v0.1.0-experimental`. Code complete; npm publish pending `@adjudicate`
org claim. Surface area may shift before `v1.0.0` — see [L2 rework
callouts](#l2-rework-callouts).

## Install

```bash
pnpm add @adjudicate/anthropic @adjudicate/core @adjudicate/runtime @anthropic-ai/sdk
```

The Anthropic SDK is a `peerDependency` so adopters control the SDK
version and auth.

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
    toolSchemas: PIX_INTENT_TOOL_SCHEMAS, // see quickstart
  }),
  deferStore: createInMemoryDeferStore(),
  confirmationStore: createInMemoryConfirmationStore(),
  executor: myAdopterExecutor,
});

const result = await agent.send({
  sessionId: "s-1",
  userMessage: "Refund the last R$ 200 charge.",
  state: currentPixState,
  context: { customerId: "c-1", merchantId: "m-1" },
});
// result.outcome ∈
//   { kind: "completed", assistantText: string }
//   { kind: "deferred", signal, intentHash }
//   { kind: "awaiting_confirmation", prompt, confirmationToken }
//   { kind: "escalated", to, reason }
//   { kind: "max_iterations_exceeded", lastDecision }
```

A runnable end-to-end demo lives in
[`examples/quickstart-anthropic`](../../examples/quickstart-anthropic/)
— it exercises every kernel Decision against the PIX pack with real
Anthropic API calls.

## How decisions translate

| Decision | tool_result content | next loop action |
|---|---|---|
| `EXECUTE` | adopter executor result, JSON-serialized, `is_error: false` | continue |
| `REFUSE` | `refusal.userFacing` text, `is_error: true` | continue (LLM may rephrase) |
| `REWRITE` | executor runs **rewritten** envelope; result + note "kernel rewrote your proposal — \<reason\>" | continue |
| `REQUEST_CONFIRMATION` | tool_result with prompt; turn terminates with `outcome: awaiting_confirmation` | pause |
| `ESCALATE` | tool_result + turn terminates with `outcome: escalated` | terminate |
| `DEFER` | calls `parkDeferredIntent`; tool_result text "queued, waiting on signal X" | pause |

The **first non-continue Decision wins**: subsequent `tool_use` blocks
in the same assistant turn are surfaced back as
`not_processed_due_to_pause` tool_results so the LLM, on resume,
understands they were skipped.

## Public surface

```ts
createAdjudicatedAgent(options): AdjudicatedAgent

interface AdjudicatedAgent {
  send(input):    Promise<AgentTurnResult>;  // one user message per call
  resume(args):   Promise<AgentTurnResult>;  // adopter webhook handler calls this
  confirm(args):  Promise<AgentTurnResult>;  // user clicks yes/no on a paused turn
}
```

Lower-level primitives are re-exported as escape hatches for adopters
who need a custom loop (streaming UI, partial-output gating, custom
retry):

```ts
export {
  classifyIncomingToolUse,
  buildEnvelopeFromToolUse,
  translateDecision,
  createAnthropicPromptRenderer,
  DEFAULT_ADJUDICATED_SYSTEM_PROMPT,
} from "@adjudicate/anthropic";
```

## Conformance contract

The Pack you pass to `createAdjudicatedAgent` MUST already be
`safePlan`-wrapped + `withBasisAudit`-wrapped (Pack-author convention,
applied at Pack construction). The adapter does **not** double-wrap.
`installPack` from `@adjudicate/core` is the canonical wrapper; pass
its output directly.

The adapter never:
- bypasses `adjudicate()` from `@adjudicate/core/kernel`
- raises taint upward (LLM-derived envelopes are always `UNTRUSTED`)
- alters the kernel's fixed guard ordering (state → auth → taint → business)

These are load-bearing soundness invariants — see
[`docs/concepts.md §9`](../../docs/concepts.md#9-architectural-direction-intended-evolution).

## Persistence

Two stores travel with each agent:

- **`deferStore`** — implements `DeferRedis & ParkRedis` from `@adjudicate/runtime`.
  `createInMemoryDeferStore()` is provided for tests and the quickstart.
  Production wires real Redis (or any KV with NX, EX, INCR, DECR).

- **`confirmationStore`** — implements `ConfirmationStore` (defined in
  this package). Pending REQUEST_CONFIRMATION turns are persisted
  under a single-use token; `take(token)` is get-and-delete.
  `createInMemoryConfirmationStore()` is provided.

## L2 rework callouts

> **Read this if you're building on this adapter at v0.1.x.**
>
> The repo has an explicit roadmap in [`docs/concepts.md §9`](../../docs/concepts.md#9-architectural-direction-intended-evolution): a layer of *risk primitives* (`clampAmount`, `escalateAboveThreshold`, …) extracts after Pack #2 and Pack #3 land. When that lands, several surfaces in *this* adapter will shift. They are deliberately structured with mitigation seams so the rewrite is contained.

| Surface today | Likely shift post-L2 | Mitigation seam |
|---|---|---|
| `createAnthropicPromptRenderer({ toolSchemas })` accepts hand-supplied schemas | The renderer derives schemas from `pack.intentSchemas` | `toolSchemas` becomes an override; existing call sites unchanged |
| `AdjudicatedAgentOptions.deriveNonce` is adopter-defined | A `Pack.nonceStrategy` may surface | `deriveNonce` documented as overriding the Pack default |
| `ConfirmationStore` is local to this package | A `confirmAboveThreshold` primitive may move the resume contract into `@adjudicate/runtime` | Interface stays; implementation swaps |
| `AgentEvent.kind === "intent_proposed"` fires before adjudication | A new `intent_normalized` event may slot between proposed and decision | Current ordering documented; no rename |
| Tool name = intent kind for proposable intents | If kinds without dots are introduced, a sentinel prefix may be needed | Not yet implemented; default empty when added |
| Hard-coded English system-prompt copy | i18n + per-Pack overrides + supervisor modifiers | `basePrompt` already exposed; `DEFAULT_ADJUDICATED_SYSTEM_PROMPT` exported for append-not-replace |

This adapter ships **knowingly ahead of L2**. Adopters benefit from a
runnable Anthropic integration today; the cost is migrating across the
seams above when L2 lands. The 5 stable interfaces (`IntentEnvelope`,
`Decision`, `PolicyBundle`, `CapabilityPlanner`, `AuditSink`) do **not**
change.

## License

[MIT](../../LICENSE)
