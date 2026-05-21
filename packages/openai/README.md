# @adjudicate/openai

Reference OpenAI Chat Completions integration for the `adjudicate` decision kernel. A thin shim over `@adjudicate/adapter-core` — every load-bearing concern (tool-use loop, defer/confirm orchestration, audit + ledger wiring, REWRITE handling, confirmation-blob hash verification) lives upstream in adapter-core. This package owns one thing: mapping the OpenAI SDK's wire shapes to the provider-neutral contracts.

## Layout

| File | Role |
|---|---|
| `src/bridge-openai.ts` | `ProviderBridge<OpenAIMessage[]>` against the OpenAI Chat Completions API |
| `src/renderer-openai.ts` | System-prompt + tool-name translation tuned for OpenAI |
| `src/adapter.ts` | `createAdjudicatedAgent` — wires bridge + renderer into adapter-core |
| `src/openai-types.ts` | Structural types mirroring the OpenAI SDK shape (no hard dep) |
| `src/types.ts` | Public surface — `OpenAIHistory`, options, agent type |
| `src/index.ts` | Barrel — re-exports adapter-core ergonomics |

## Quickstart

```ts
import OpenAI from "openai";
import { installPack } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createOpenAIPromptRenderer,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
} from "@adjudicate/openai";
import { paymentsPixPack, PIX_TOOL_SCHEMAS } from "@adjudicate/pack-payments-pix";

const { pack } = installPack(paymentsPixPack);

const agent = createAdjudicatedAgent({
  pack,
  openaiClient: new OpenAI(),
  model: "gpt-4o",
  maxTokens: 1024,
  renderer: createOpenAIPromptRenderer({
    packId: pack.id,
    toolSchemas: PIX_TOOL_SCHEMAS,
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

`createAdjudicatedAgent` returns the same `{ send, resume, confirm }` surface as the Anthropic adapter. The kernel sees identical `IntentEnvelope`s either way; the choice of provider doesn't change which `Decision` outcomes are reachable.

## Why no `openai` dependency?

The package accepts any object satisfying `OpenAIChatLikeClient` — a minimal structural interface. The official `openai` SDK (`>=4`) satisfies it; mocks for tests do too; Azure OpenAI wrappers do too. Three reasons:

1. No major-version pin on a fast-moving SDK.
2. Mocks remain trivial.
3. Adopters who already vendor a specific OpenAI client don't get a duplicate copy.

If you want the SDK, install it directly: `pnpm add openai`.

## Determinism + replay

Every intent envelope crosses `adjudicateAndAudit()` from `@adjudicate/core/kernel`. The OpenAI adapter cannot bypass it; the kernel still owns:

- The closed 6-valued `Decision` algebra.
- Replay suppression via the supplied `Ledger`.
- Canonical-JSON `intentHash` (excludes `createdAt`, includes `nonce`).
- Fail-closed semantics on throwing guards.
- Confirmation-blob tamper detection at resume.

Cross-provider parity is verified by `tests/integration-pix.test.ts` — the same canned conversation against the same PIX Pack reaches the same six `Decision` kinds, with the same audit-record counts and no `withBasisAudit` drift events.

## Status

Shipped against adapter-core v0.6. Surface stable; the structural `OpenAIChatLikeClient` may expand if OpenAI ships new request-side fields the adapter needs to pass through.
