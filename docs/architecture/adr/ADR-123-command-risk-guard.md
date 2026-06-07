# ADR-123 — Command-Risk guard for CLI/terminal agents

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/primitives` (`createCommandRiskGuard` + `command-classify`), `@adjudicate/core` (`validation.COMMAND_*` basis codes), apps/web (playground), apps/console (CommandRiskBadge)
- **Related:** ADR-104 (REWRITE scope), ADR-108 (primitives), ADR-117 (validation basis codes)

## Context

CLI/terminal agents (Claude Code, Copilot-in-terminal) are a growing surface. A proposed shell command can be destructive (`rm -rf /`), network-exfiltrating (`curl … | sh`), or credential-exposing (`cat ~/.aws/credentials`). The kernel's REWRITE/REFUSE/REQUEST_CONFIRMATION outcomes map cleanly onto sanitize / block / gate.

## Decision

- **`command-classify.ts`** — pure `classifyCommand(command, rules?)` over a frozen `DEFAULT_COMMAND_RULES` table (category `destructive`/`network`/`credential` + per-rule severity), plus `stripDangerousFlags(command, rules?)` over `DEFAULT_FLAG_STRIP_RULES` (safety-disabling flags like `--no-preserve-root`, `-f` on `rm`).
- **`createCommandRiskGuard(...)`** — a multi-disposition guard: REFUSE for irrecoverable risk; **REWRITE** (taint preserved verbatim) when a dangerous flag strips and de-escalates the command; REQUEST_CONFIRMATION otherwise.
- **Basis codes** (additive, `validation`): `COMMAND_BLOCKED`, `COMMAND_FLAG_STRIPPED`, `COMMAND_SANITIZED`. Risk detail rides in `basis.detail`.
- **Surfaces:** apps/web Decision-Lab presets (safe→EXECUTE, network→CONFIRM, strippable→REWRITE, irrecoverable→REFUSE) over an inline terminal demo pack; apps/console `CommandRiskBadge` on the decision-detail page (no new endpoint — reads `basis.detail`).

## Why this shape

- **Pure rule table over LLM-as-judge.** Deterministic, replayable; ships `@experimental` and override-able. Framed as defense-in-depth, not a sandbox.
- **REWRITE never escalates.** It only strips curated safety-disabling flags; an adversarial test asserts the sanitized command's disposition is ≤ the original's, and taint is copied verbatim (no `rewrite_taint_regression`).
- **Opaque metadata.** The guard emits all three of REWRITE/REFUSE/CONFIRM depending on classification, so no single structured `GuardDescription` variant fits — `{ kind: "opaque" }` is the sanctioned escape hatch (no enum widening). Console reads `basis.detail`, so no new tRPC procedure.

## Invariants preserved

- Kernel determinism: pure classifier + guard; the REWRITE recomputes `intentHash` over the sanitized payload via `buildEnvelope`. A property test pins same-input→same-decision.
- Closed enums untouched; `validation.COMMAND_*` are additive constants.

## Alternatives considered

- **Widen `GuardDescription` with a `command_risk` variant.** Rejected — single-purpose widening of a closed interoperability enum for negligible analyzer gain.
- **LLM-classify the command.** Rejected — non-deterministic.

## Test coverage

`packages/primitives/tests/command-classify.test.ts`, `command-risk-guard.test.ts` (REFUSE/REWRITE/CONFIRM/safe + replay property + opaque metadata), `command-risk-guard.adversarial.test.ts` (whitespace/fork-bomb, sanitized-never-more-dangerous, non-string field). apps/console CommandRiskBadge test.

## Lifecycle

Rule tables are `@experimental` and override-able; residual evasion risk (quoting, env indirection, base64) documented — the guard is defense-in-depth.
