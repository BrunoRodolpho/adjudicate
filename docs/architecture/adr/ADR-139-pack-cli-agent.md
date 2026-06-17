# ADR-139 — `@adjudicate/pack-cli-agent` — default-deny terminal composition

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** new package `@adjudicate/pack-cli-agent`
- **Related:** ADR-123 (command-risk guard), ADR-134 (command-risk aggregation), ADR-115 (pack-trust primitives), ADR-122 (approval engine)

## Context

`createCommandRiskGuard` (ADR-123) shipped as a primitive but its only consumer was an inline demo Pack in `apps/web` whose trailing `decisionExecute` made the *composition* fail-open ("EXECUTE anything that falls through"). There was no shippable CLI/terminal Pack bundling typed intents with a fail-closed sink.

## Decision

New Pack `@adjudicate/pack-cli-agent` for the `terminal.run` intent. Business chain (first-match-wins): `escalateCredentialCommands → createCommandRiskGuard (verbatim) → deferDuringMaintenance → executeAllowlistedSafe → terminalDefaultDeny`, with `validateTerminalPayload` (state) and `policy.default: "REFUSE"`. All six Decision outcomes are reachable:

- REFUSE — malformed payload / disallowed cwd / irrecoverable command (`rm -rf /`) / default-deny.
- ESCALATE — credential-touching commands (`~/.ssh`, aws credentials, secrets).
- REWRITE — strippable dangerous flag (`rm -r --force` → `rm -r`).
- REQUEST_CONFIRMATION — recoverable network/destructive command.
- DEFER — safe command during a maintenance window, on the **pack-id-prefixed** signal `pack-cli-agent:maintenance_window`.
- EXECUTE — only a classifier-`safe` AND explicitly-allowlisted program.

## Why this shape

- **`escalateCredentialCommands` runs before `createCommandRiskGuard`** (decision D6): the shipped classifier dispositions `credential` as `confirm`, so first-match-wins would otherwise return REQUEST_CONFIRMATION and pre-empt the distinct ESCALATE the six-outcome parity requires.
- **Default-deny sink** converts the demo's fail-open into "EXECUTE only what is provably safe and allowlisted" — the fail-closed direction.
- **Pack-id-prefixed DEFER signal** so the composition analyzer (ADR-140 / AJD-108) does not false-positive on a signal collision.
- **UNTRUSTED taint floor** — terminal commands are LLM-proposed and must reach the guards; the real gating is the classifier + default-deny, not the taint floor.

## Invariants preserved

- Pure pack; no new Decision kind; canonical namespaced basis codes (`validation.COMMAND_*`, `business.RULE_*`, `schema.PAYLOAD_INVALID`). Replay-deterministic. Becomes a complete six-outcome fixture for ADR-140.

## Alternatives considered

- **Promote the demo Pack.** Rejected — it is fail-open and app-local.
- **Sandbox enforcement.** Out of scope — this is defense-in-depth classification, not a sandbox (per ADR-123).

## Test coverage

`packages/pack-cli-agent/tests/six-outcomes.test.ts` (all six + adversarial fall-through→REFUSE + dangerous-never-EXECUTE + replay determinism); `conformance.test.ts` (`assertPackConformance`, default REFUSE, UNTRUSTED floor, pack-id-prefixed signal, `rehydrateCliState`).
