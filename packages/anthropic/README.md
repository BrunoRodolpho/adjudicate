# @adjudicate/anthropic

> Reference Anthropic Messages-API integration for [adjudicate](../../README.md).

A thin SDK shim that wires the Anthropic Messages API into the
provider-neutral agent loop in
[`@adjudicate/adapter-core`](../adapter-core/). This package builds a
`ProviderBridge<MessageParam[]>` against `@anthropic-ai/sdk` and forwards
it to `createAdjudicatedAgent` from adapter-core; everything load-bearing —
the tool-use loop, defer/confirm orchestration, REWRITE handling, audit +
ledger wiring, and confirmation-blob hash verification — lives in
adapter-core. The kernel still adjudicates every proposed mutation: the
loop sits *before* `adjudicate()` from `@adjudicate/core/kernel`, never
bypassing or short-circuiting it.

## Status

Published, `0.3.0`. See [CHANGELOG.md](./CHANGELOG.md). The public API is
preserved across provider adapters by re-exports from adapter-core, so
adopter imports stay stable.

## Install

```bash
pnpm add @adjudicate/anthropic @adjudicate/core @adjudicate/runtime @anthropic-ai/sdk
```

`@adjudicate/adapter-core` and `@adjudicate/audit` come in transitively as
dependencies of this package; import the ledger and persistence shims from
`@adjudicate/anthropic` (they are re-exported). The Anthropic SDK is a
`peerDependency` so adopters control the SDK version and auth.

## 30-second example

```ts
import Anthropic from "@anthropic-ai/sdk";
import { installPack } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createAnthropicPromptRenderer,
  createInMemoryDeferStore,
  createInMemoryConfirmationStore,
  createMemoryLedger,
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
  ledger: createMemoryLedger(), // REQUIRED — replay suppression
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

`createMemoryLedger()` (re-exported from `@adjudicate/audit`) gives replay
suppression within a single process lifetime only. Production wires
`createRedisLedger` (or any backing store with SET-NX, EX, INCR, DECR) from
`@adjudicate/audit`. Without a persistent ledger, two duplicate webhook
deliveries arriving at different processes would both EXECUTE.

A runnable end-to-end demo lives in
[`examples/quickstart-anthropic`](../../examples/quickstart-anthropic/)
— it exercises every kernel Decision against the PIX pack with real
Anthropic API calls.

## How decisions translate

The loop materializes each `tool_result` as a provider-neutral
`ToolResultBlock` (`{ toolUseId, content, isError? }`); the bridge re-encodes
it into Anthropic's `ToolResultBlockParam` only when building the next API
call.

| Decision | tool_result content | next loop action |
|---|---|---|
| `EXECUTE` | adopter executor result, JSON-serialized, `isError: false` | continue |
| `REFUSE` | `refusal.userFacing` text, `isError: true` | continue (LLM may rephrase) |
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

### Options (`AdjudicatedAgentOptions`)

Required: `pack`, `anthropicClient`, `model`, `maxTokens`, `renderer`,
`deferStore`, `confirmationStore`, `ledger`, `executor`. The rest are
optional seams:

- `auditSink` — emits one record per Decision through `adjudicateAndAudit`;
  defaults to `noopAuditSink()`.
- `verifyParkedHash: "strict" | "warn" | "off"` — hash-verification policy
  for parked envelope blobs at resume. The adapter parks full envelope
  fields (version/nonce/taint/actorPrincipal) at DEFER time so resume can
  re-derive the `intentHash` and detect tampering. `"strict"` fails closed
  on mismatch *or* missing verification fields; `"warn"` (default) fails
  closed on mismatch but allows legacy blobs without verification fields;
  `"off"` skips verification (not recommended for production). Flip to
  `"strict"` pre-v1.0.
- Provider-neutral agent-loop seams, declared here and forwarded so they
  are reachable through the Anthropic bridge: `onTokenUsage` (per-turn
  token-usage telemetry, ADR-120), `memoryStore` + `enrichContext` +
  `deriveMemoryWriteback` (cross-session memory, ADR-126), `configSeal`
  (config-integrity gate, ADR-121), and `traceSink`.
- `runtimeContext`, `maxIterations`, `rk`, `deriveNonce`, `log`.

### Escape hatches

Lower-level primitives are re-exported for adopters who need a custom loop
(streaming UI, partial-output gating, custom retry). Local to this package:

```ts
export {
  createAnthropicBridge,            // ProviderBridge<MessageParam[]>
  createAnthropicPromptRenderer,
  DEFAULT_ADJUDICATED_SYSTEM_PROMPT,
} from "@adjudicate/anthropic";
```

Re-exported from `@adjudicate/adapter-core` (import-path stability):

```ts
export {
  classifyIncomingToolUse,
  buildEnvelopeFromToolUse,
  intentKindToApiName,
  translateDecision,
  createMemoryLedger,
  createInMemoryDeferStore,
  createInMemoryConfirmationStore,
  AdapterError,
  AdapterErrorCode,
  // deprecated aliases (removed in v2.0), prefer AdapterError*:
  AnthropicAdapterError,
  AnthropicAdapterErrorCode,
} from "@adjudicate/anthropic";
```

## Conformance contract

The Pack you pass to `createAdjudicatedAgent` MUST already be
`safePlan`-wrapped + `withBasisAudit`-wrapped (Pack-author convention,
applied at Pack construction). The adapter does **not** double-wrap.
`installPack` from `@adjudicate/core` is the canonical wrapper; pass
its output directly.

The loop never:
- bypasses `adjudicate()` from `@adjudicate/core/kernel`
- raises taint upward (LLM-derived envelopes are always `UNTRUSTED`)
- alters the kernel's fixed guard ordering (state → taint → auth → business — ADR-104)

These are load-bearing soundness invariants — see
[`docs/concepts.md §9`](../../docs/concepts.md#9-architectural-direction-intended-evolution).

## Persistence

Three stores travel with each agent. All three interfaces, and their
in-memory implementations, are defined in `@adjudicate/adapter-core`; this
package only binds the history type to Anthropic-native `MessageParam[]`.

- **`deferStore`** — implements `DeferRedis & ParkRedis`.
  `createInMemoryDeferStore()` is provided for tests and the quickstart.
  Production wires real Redis (or any KV with NX, EX, INCR, DECR).

- **`confirmationStore`** — implements `ConfirmationStore`. Pending
  REQUEST_CONFIRMATION turns are persisted under a single-use token;
  `take(token)` is get-and-delete. `createInMemoryConfirmationStore()` is
  provided.

- **`ledger`** — the Execution Ledger for replay suppression.
  `createMemoryLedger()` is provided; see the example note above.

## Renderer note

`createAnthropicPromptRenderer({ toolSchemas })` accepts hand-supplied tool
schemas (renderer-anthropic.ts). The renderer filters them to the planner's
advertised tools (`Plan.visibleReadTools` ∪ `Plan.allowedIntents`) and
translates dotted intent-kind names (`pix.charge.create`) into the
Anthropic-API tool-name form (`pix_charge_create`); `classifyIncomingToolUse`
reverses the translation when the model echoes the name back. Deriving
schemas from `pack.intentSchemas` (so `toolSchemas` becomes an override) is
still pending. `DEFAULT_ADJUDICATED_SYSTEM_PROMPT` is exported so adopters
can append rather than replace when supplying a custom `basePrompt`.

## License

[MIT](../../LICENSE)
