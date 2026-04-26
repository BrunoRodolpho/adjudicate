# Contributing to adjudicate

Thanks for your interest. This is a small framework with a deliberately
narrow surface — contributions that **strengthen the invariants**,
**improve the docs**, or **broaden the example coverage** are most
welcome.

## What we're looking for

- **New examples**: a domain-specific `PolicyBundle` + `CapabilityPlanner`
  pair under `examples/<your-domain>/`. Healthcare scheduling, banking
  approvals, support-ticket triage — anything that exercises a Decision
  outcome the existing examples don't.
- **Adapter packages**: `@adjudicate-community/audit-clickhouse`,
  `@adjudicate-community/runtime-temporal` — implementations of the
  framework's contracts against your favorite tool. Live in your own repo;
  link in the README's adapter directory.
- **Property tests** that strengthen the kernel's load-bearing invariants
  in [packages/core/tests/kernel/invariants/](./packages/core/tests/kernel/invariants/).
- **Documentation** — the README, the per-package READMEs, and the
  runbooks in [docs/ops/runbooks/](./docs/ops/runbooks/) all benefit
  from drive-by improvements.

## What we're NOT looking for

- **Domain-specific code in framework packages.** If your guard mentions
  payment, appointment, ticket, balance, or any other business word, it
  belongs in an example or a community adapter, not in `@adjudicate/core`.
- **Convenience APIs that bypass the kernel.** The whole point is that
  every state mutation goes through `adjudicate()`. Helpers that "just
  execute the side effect" defeat the architecture.
- **Type erosion.** No `any`, no `as unknown`, no widening of
  `Decision`/`Refusal` shapes. Strict TypeScript is load-bearing.

## Setup

```bash
git clone https://github.com/<TBD>/adjudicate.git
cd adjudicate
pnpm install
pnpm test
```

Requires Node ≥ 20 and pnpm ≥ 10.

## Workflow

```bash
# Run a single package's tests in watch mode while you work
pnpm --filter @adjudicate/core test --watch

# Lint
pnpm --filter @adjudicate/core lint

# Build all framework packages
pnpm build
```

## PR guidelines

- One concern per PR. Refactors and feature changes don't mix well in
  review.
- New code paths land with new tests. The kernel's property tests are
  the framework's safety harness — extend them when you extend the
  Decision algebra.
- Keep commits single-purpose. The repo's history is readable and we'd
  like to keep it that way.

## Architecture conversations

Open a draft PR with the design first; an empty README in the new
package is fine. Discuss the shape there before writing the code. This
saves both sides time when an architectural concern surfaces — easier
to redirect a 1-file PR than a 12-file one.

## Code of Conduct

Be the kind of contributor you'd want to work with. Disagree about
ideas, not people. Maintainers reserve the right to remove comments or
contributions that violate this in spirit.
