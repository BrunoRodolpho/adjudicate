# ADR-113 — Adapter-core extraction

- **Status:** Accepted
- **Date:** 2026-05-20
- **Scope:** Provider integration surface (`@adjudicate/adapter-core`, `@adjudicate/anthropic`, `@adjudicate/openai`)
- **Related:** ADR-101 (kernel audit emission), ADR-103 (RuntimeContext), ADR-106 (guard exception isolation)

## Context

Through v0.5 the only first-party provider integration was `@adjudicate/anthropic`, and that package owned everything load-bearing for the LLM loop:

1. The tool-use orchestration loop (`runLoop`).
2. The bridge that maps `tool_use` blocks to `IntentEnvelope`s (`classifyIncomingToolUse`, `buildEnvelopeFromToolUse`).
3. The Decision → tool-result translator (`translateDecision`).
4. Persistence shims for DEFER + REQUEST_CONFIRMATION (`createInMemoryDeferStore`, `createInMemoryConfirmationStore`).
5. The audit + ledger wiring (the `adjudicateAndAudit` call site).
6. The confirmation-blob hash-verification on `confirm()` resume.

The bulk of that surface is provider-neutral. The pieces that are *actually* Anthropic-specific are small: the SDK message-shape mapping (the `Tool[]` / `MessageParam[]` / `ToolUseBlock` types) and a tuned system prompt.

Adopters who wanted OpenAI had three options, all bad: (a) re-implement the loop, repeating every load-bearing invariant (replay safety, fail-closed semantics, supersession links); (b) wrap Anthropic in a translation layer (slow, unmaintainable, breaks streaming); (c) abandon adjudicate for OpenAI. OpenAI is ~70% of adopter LLM volume; (c) was the realistic default.

The v0.5 status doc flagged this as **Priority 1 — adoption-blocking**.

## Decision

Extract a provider-neutral `@adjudicate/adapter-core` package containing:

- `createAdjudicatedAgent` — the orchestration loop, parameterised by `ProviderBridge<H>`. Returns an agent with `send` / `resume` / `confirm`.
- `classifyIncomingToolUse` + `buildEnvelopeFromToolUse` — the bridge primitives.
- `translateDecision` — Decision → provider-neutral `ToolResultBlock` + `LoopAction`.
- `ConfirmationStore<H>` + `DeferRedis` + `ParkRedis` + in-memory shims (`createInMemoryConfirmationStore`, `createInMemoryDeferStore`).
- `AdapterError` + `AdapterErrorCode` taxonomy.

Provider adapters become **thin SDK shims**: each builds a `ProviderBridge<H>` against its SDK and re-exports a `createAdjudicatedAgent` that wires the bridge into `createAdjudicatedAgent` from adapter-core (imported as `createAdjudicatedAgentCore`). History `H` is opaque to the loop — the bridge is the only thing in the codebase that knows the SDK-specific conversation-history shape.

### `ProviderBridge<H>` contract

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

Where `AssistantTurn = { textBlocks: ReadonlyArray<string>; toolUses: ReadonlyArray<ToolUseRequest>; usage?: TokenUsage }` and `ToolResultBlock = { toolUseId, content, isError? }` are both provider-neutral. The `usage?` field is additive (ADR-120): bridges that cannot report token usage omit it, and the loop treats absence as "no usage to report".

## Invariants preserved

All v0.5 invariants flow through unchanged because the loop is the same code, just relocated:

- Every intent envelope crosses `adjudicateAndAudit()`. No bypass.
- First non-continue Decision wins per assistant turn.
- REWRITE executes the *rewritten* envelope, never the original.
- DEFER persists full envelope fields; resume re-derives `intentHash` and detects tampering.
- REQUEST_CONFIRMATION blobs are hash-verified at `confirm()`.
- Replay determinism: same envelope + same state + same policy → same Decision.

The Anthropic and OpenAI integration tests both exercise the same canned PIX-Pack conversation and verify identical Decision sequences, audit-record counts, and event-log fingerprints. Cross-provider parity is structural.

## Consequences

**Pros:**

- Adding a new provider is a < 200-line PR — a bridge module plus a renderer.
- Provider adapters cannot regress invariants. The loop is owned by `@adjudicate/adapter-core` and changes to the load-bearing logic land in one place.
- Public adopter import paths stay stable. `@adjudicate/anthropic` re-exports the persistence shims, the error taxonomy, the bridge functions. Adopter code does not change. A minor v0.5 → v0.6 type difference exists for `AgentEvent.tool_result.payload` (now provider-neutral `ToolResultBlock` instead of Anthropic-specific `ToolResultBlockParam`); documented in the changeset.
- The OpenAI adapter ships without a hard `openai` SDK dependency. It accepts any object matching the structural `OpenAIChatLikeClient` interface — the official SDK satisfies it, mocks satisfy it, Azure OpenAI wrappers satisfy it.

**Cons:**

- One additional package in the dependency graph. `@adjudicate/anthropic` and `@adjudicate/openai` both depend on `@adjudicate/adapter-core`. Trade-off accepted: the duplication that would otherwise live in every adapter is more expensive than one shared package.
- Adopter type signatures gain a fifth generic parameter (`H` for history) in the underlying core types. Provider packages erase it at the public surface, so adopters consuming `@adjudicate/anthropic` or `@adjudicate/openai` directly see the same `<K, P, S, C>` shape as before.

## Alternatives considered

1. **Keep the loop in `@adjudicate/anthropic`; have `@adjudicate/openai` re-implement.** Rejected — duplication of load-bearing security logic across two packages is the worst possible outcome for invariant preservation.
2. **Build a generic "AI framework" abstraction layer that wraps Anthropic and OpenAI uniformly.** Rejected — adapter-core stays focused on adjudicate's specific needs (tool-use loop, defer/confirm, audit wiring), not generic LLM portability.
3. **Wait until a third adopter requested OpenAI.** Rejected — adoption volume said OpenAI is the gating constraint, not a speculative one.

## Migration

- Existing Anthropic adopters: no source change needed. The `@adjudicate/anthropic` package re-exports the same names with the same shapes. The one type change (`AgentEvent.tool_result.payload`) is documented in the changeset.
- New OpenAI adopters: install `@adjudicate/openai`; call `createAdjudicatedAgent({ openaiClient, model, … })`. Quickstart in `packages/openai/README.md`.
- Authors of a third provider: implement `ProviderBridge<YourHistoryShape>` against the SDK + a tuned renderer. The loop, the audit wiring, the defer/confirm orchestration are inherited.

## Forward-compatibility

- `ProviderBridge<H>` may gain *optional* methods for streaming and cancellation in future minor versions; existing implementations stay compilable.
- `OpenAIChatLikeClient` may expand its structural surface if OpenAI ships new request-side fields the adapter needs to thread through. The structural shape stays a subset of the SDK so adopters can always pass `new OpenAI({...})`.
- `AdapterError` codes are additive (closed-vocabulary discipline applies, same as basis codes).
