# @adjudicate/vercel-ai

Reference Vercel AI SDK (v5+) integration for the `adjudicate` decision kernel. A thin shim over `@adjudicate/adapter-core` — every load-bearing concern (tool-use loop, defer/confirm orchestration, audit + ledger wiring, REWRITE handling, confirmation-blob hash verification) lives upstream in adapter-core. This package owns one thing: mapping the AI SDK's wire shapes to the provider-neutral contracts.

## Layout

| File | Role |
|---|---|
| `src/bridge-vercel.ts` | `ProviderBridge<VercelMessage[]>` against the AI SDK `generateText` surface |
| `src/renderer-vercel.ts` | System-prompt + tool-name translation tuned for the AI SDK |
| `src/adapter.ts` | `createAdjudicatedAgent` — wires bridge + renderer into adapter-core |
| `src/vercel-types.ts` | Structural types mirroring the AI SDK shape (no hard dep) |
| `src/types.ts` | Public surface — `VercelHistory`, options, agent type |
| `src/index.ts` | Barrel — re-exports adapter-core ergonomics |

## Quickstart

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { installPack } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createVercelPromptRenderer,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
} from "@adjudicate/vercel-ai";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

const { pack } = installPack(paymentsPixPack);

const agent = createAdjudicatedAgent({
  pack,
  generateText,
  model: openai("gpt-4o"),
  maxTokens: 1024,
  renderer: createVercelPromptRenderer({
    packId: pack.id,
    toolSchemas: [], // the ToolSchema[] the model sees for this pack's intents
  }),
  deferStore: createInMemoryDeferStore(),
  confirmationStore: createInMemoryConfirmationStore(),
  ledger: createMemoryLedger(),
  executor: {
    invokeRead: async (name, input, state) => /* read tool */,
    invokeIntent: async (envelope, state) => /* side-effect */,
  },
});

const turn = await agent.send({
  sessionId: "s-1",
  userMessage: "Refund the iced-coffee charge.",
  state: { /* … */ },
  context: { /* … */ },
});
```

`createAdjudicatedAgent` returns the same `{ send, resume, confirm }` surface as the OpenAI and Anthropic adapters. The kernel sees identical `IntentEnvelope`s either way; the choice of provider doesn't change which `Decision` outcomes are reachable.

## Why no `ai` / `@ai-sdk/*` dependency?

The package accepts any callable satisfying `VercelGenerateTextFn` plus an opaque `LanguageModel` handle — a minimal structural interface. The official `generateText` from `ai` (`>=5`) satisfies it; mocks for tests do too. Three reasons:

1. No major-version pin on a fast-moving SDK.
2. Mocks remain trivial.
3. Adopters who already vendor a specific AI SDK version don't get a duplicate copy.

If you want the SDK, install it directly: `pnpm add ai @ai-sdk/openai`.

Unlike a Chat Completions client, the AI SDK exposes a FREE FUNCTION `generateText(...)` plus a `LanguageModel` instance rather than a stateful client object. The bridge injects the callable plus a model handle accordingly.

## Determinism + replay

Every intent envelope crosses `adjudicateAndAudit()` from `@adjudicate/core/kernel`. The Vercel AI adapter cannot bypass it; the kernel still owns:

- The closed 6-valued `Decision` algebra.
- Replay suppression via the supplied `Ledger`.
- Canonical-JSON `intentHash` (excludes `createdAt`, includes `nonce`).
- Fail-closed semantics on throwing guards.
- Confirmation-blob tamper detection at resume.

Cross-provider parity is verified by `tests/integration-pix.test.ts` — the same canned conversation against the same PIX Pack reaches the same six `Decision` kinds, with the same audit-record counts and no `withBasisAudit` drift events.

## Notable deltas vs the OpenAI adapter

- Tool-call `input` arrives ALREADY PARSED as a structured object — no JSON.parse / `__raw` fallback.
- Token usage maps 1:1 (`{ inputTokens, outputTokens }`) — no `prompt_tokens` / `completion_tokens` rename.
- The output cap field is `maxOutputTokens` (the v5 name).
- The SDK surface is the free function `generateText(...)` plus a `LanguageModel` handle, not a stateful client.
- Tool results use `role: "tool"` messages whose `content` is an array of `tool-result` parts.

## Status

Shipped against adapter-core v0.6 and AI SDK v5. Surface stable; the structural `VercelGenerateTextFn` may expand if the AI SDK ships new request-side fields the adapter needs to pass through.
