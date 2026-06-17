# @adjudicate/vercel-ai

## 0.3.2

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0
  - @adjudicate/adapter-core@0.3.2
  - @adjudicate/audit@3.0.0
  - @adjudicate/runtime@0.2.2

## 0.3.1

### Minor Changes

- Initial release: reference Vercel AI SDK (v5+) integration. Thin SDK shim over
  adapter-core, cloned 1:1 from `@adjudicate/openai` and adapted to the AI SDK's
  `generateText` free-function surface. Accepts any callable satisfying
  `VercelGenerateTextFn` plus an opaque `LanguageModel` handle — the official
  `generateText` from `ai` satisfies it structurally, mocks satisfy it. No hard
  `ai` / `@ai-sdk/*` dependency.

  Cross-provider parity verified by `tests/integration-pix.test.ts` — the same
  canned PIX-Pack conversation reaches the same six Decision kinds with the same
  audit-record counts and no `withBasisAudit` drift events.

### Patch Changes

- @adjudicate/audit@3.0.0
- @adjudicate/adapter-core@0.3.1
