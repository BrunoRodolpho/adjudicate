# @adjudicate/vercel-ai

## 0.3.6

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0
  - @adjudicate/adapter-core@0.4.3
  - @adjudicate/audit@7.0.0
  - @adjudicate/runtime@0.3.3

## 0.3.5

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0
  - @adjudicate/adapter-core@0.4.2
  - @adjudicate/audit@6.0.0
  - @adjudicate/runtime@0.3.2

## 0.3.4

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0
  - @adjudicate/adapter-core@0.4.1
  - @adjudicate/audit@5.0.0
  - @adjudicate/runtime@0.3.1

## 0.3.3

### Patch Changes

- Updated dependencies [58cad7a]
- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [a9be0ad]
- Updated dependencies [e8698b1]
- Updated dependencies [6121a7a]
- Updated dependencies [c0d1b93]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [cb8d608]
- Updated dependencies [41a295e]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [f7fa8d5]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
  - @adjudicate/audit@4.0.0
  - @adjudicate/core@1.5.0
  - @adjudicate/runtime@0.3.0
  - @adjudicate/adapter-core@0.4.0

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
