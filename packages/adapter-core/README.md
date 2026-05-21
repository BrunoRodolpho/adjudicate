# @adjudicate/adapter-core

Provider-neutral orchestration for `adjudicate`-backed LLM agents.

The loop, bridge, decision translator, persistence shims, and error taxonomy live here. Provider adapters (`@adjudicate/anthropic`, `@adjudicate/openai`, …) each implement a `ProviderBridge<H>` against their SDK and re-export a thin `createAdjudicatedAgent` that wires it into this loop.

## Layout

```
src/
  loop.ts          ← runAdjudicatedLoop — send/resume/confirm orchestrator
  bridge.ts        ← classifyIncomingToolUse + buildEnvelopeFromToolUse
  decisions.ts     ← Decision → ToolResultBlock + LoopAction translator
  persistence.ts   ← DeferRedis, ParkRedis, ConfirmationStore (+ in-mem shims)
  errors.ts        ← AdapterError + AdapterErrorCode
  types.ts         ← ProviderBridge<H>, AssistantTurn, ToolResultBlock, …
  index.ts         ← barrel
```

## Invariants the loop preserves

These are the same load-bearing properties the kernel demands. Any provider adapter built on this loop inherits them:

1. **Every intent envelope crosses `adjudicateAndAudit()`.** No bypass, no taint elevation, no guard-ordering short-circuit.
2. **First non-continue Decision wins** per assistant turn. Subsequent `tool_use` blocks in the same turn are surfaced as `not_processed_due_to_pause`.
3. **REWRITE executes the rewritten envelope**, never the original.
4. **DEFER persists full envelope fields** (version/nonce/taint/actorPrincipal). The resume side re-derives `intentHash` and detects tampering.
5. **REQUEST_CONFIRMATION blobs are hash-verified** at `confirm()`. Tampered blobs refuse to resume.
6. **History `H` is opaque to the loop.** The bridge is the only thing that knows the SDK-specific conversation shape; the loop threads it.

## Provider adapters

Implement the `ProviderBridge<H>` contract:

```ts
interface ProviderBridge<H> {
  emptyHistory(): H;
  appendUserMessage(history: H, text: string): H;
  send(
    history: H,
    request: { systemPrompt: string; maxTokens: number; toolSchemas: ReadonlyArray<ToolSchema> },
  ): Promise<{ history: H; turn: AssistantTurn }>;
  appendToolResults(history: H, results: ReadonlyArray<ToolResultBlock>): H;
}
```

Reference implementations:
- `@adjudicate/anthropic` — `H = ReadonlyArray<MessageParam>`
- `@adjudicate/openai` — `H = ReadonlyArray<OpenAIMessage>`

Adding a new provider is a < 200-line PR: a bridge module plus a renderer.

## Status

Shipped at adapter-core v0.6. Contracts stable. `ProviderBridge<H>` may gain optional methods for streaming / cancellation in future minor versions; existing implementations continue to compile.
