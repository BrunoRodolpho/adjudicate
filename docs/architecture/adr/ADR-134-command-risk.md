# ADR-134 — Command-risk aggregation surface

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** `@adjudicate/admin-sdk` (`governance.commandRisk` + `governance.commandRiskEvents` + `CommandRisk*` schemas + `createCommandRiskStatsHandler` / `createCommandRiskEventsHandler`), apps/console (Command Risk page + `CommandRiskBadge` redaction fix), apps/web (public command-risk transparency view).
- **Related:** ADR-123 (command-risk guard — produces the basis codes and the raw-command detail this surface must NOT leak), ADR-128 (web-parity platform / dual-app contract).

## Context

ADR-123 ships the command-risk guard in the kernel layer: `createCommandRiskGuard` REFUSEs irrecoverable commands (`rm -rf /`, fork bombs, `dd of=/dev/…`, `mkfs`), REWRITEs strippable-flag cases (taint preserved), and routes recoverable risk (network exfil, credential reads) to REQUEST_CONFIRMATION. Those effects are already audited as `validation.command_blocked` / `validation.command_flag_stripped` basis codes plus a `business.rule_satisfied` (`rule: "command_risk_confirm"`) on the confirm path. But there was **no aggregation surface**: an operator could only see command-risk one record at a time via `CommandRiskBadge`. The roadmap requires a console dashboard (risk distribution, blocked-commands list, confirm-queue cross-link to the Approval Center) at parity with the PII panel, plus a public, aggregates-only web transparency view.

The acute hazard is that the guard threads the **raw command string** into `DecisionBasis.detail.command` for all three paths, and the credential-category rules fire on exactly the commands most likely to embed live secrets (`echo $AWS_SECRET_…`, `cat ~/.aws/credentials`). Any aggregation or public exposure of that field would leak secrets and reconnaissance (the matched rule ids telegraph which dangerous patterns fired).

## Decision

- **`governance.commandRisk`** (new tRPC query) + `createCommandRiskStatsHandler` over the existing `AuditStore`. A pure fold bucketing dispositions by `(category × disposition)` — max 3×3 = 9 bounded buckets. It reads the disposition over both guard channels (`validation.command_*` and `business.rule_satisfied`/`command_risk_confirm`), mapping `blocked → refuse`, `flag_stripped`/`sanitized → rewrite`, `command_risk_confirm → confirm`. The aggregate is unauthenticated-friendly (counts only, like `piiClassificationStats`).
- **`governance.commandRiskEvents`** (new tRPC query) + `createCommandRiskEventsHandler` — an event-level drill-down: one row per `(record × command-risk basis)` occurrence — `{ intentHash, at, intentKind, decisionKind, category, disposition }` — newest-first, optional category/disposition filters, `limit` (default 200, hard max 500) + `truncated`. **Requires an authenticated actor** (record-level governance data, consistent with `audit.query` / `piiEvents`).
- **Console:** a dedicated `/command-risk` page — risk distribution by category (`BarDistribution`), disposition totals with a confirm-queue cross-link to the Approval Center (`/approvals`), and a blocked-commands list (`DataTable`, the `refuse`-disposition drill-down) whose rows link to the Decision Detail. The legacy `CommandRiskBadge` is fixed to run `detail.command` through a display-time `redactCommand` masker before render (masks secret env expansions + credential file paths).
- **Web:** a public, aggregates-only `/transparency/command-risk` view fed by a committed *illustrative* fixture projected through the cohort-floor contract (`public-projection`). It shows a **category distribution only** (destructive / network / credential / safe) — no disposition split, no command text, no rule ids, no timestamps.

## Why this shape — redaction by construction (the load-bearing security property)

- **No schema field can carry command text.** Neither `CommandRiskResult` (buckets of `category × disposition × count`) nor `CommandRiskEvent` (`intentHash`/`at`/`intentKind`/`decisionKind`/`category`/`disposition`) has a `command`, `sanitized`, `stripped`, or `matchedRuleIds` field. The handlers read **only** the closed-enum `category` discriminator from `detail` and never read `detail.command`. Because every procedure gates output through `.output(<schema>)`, even a buggy handler **physically cannot** serialize command text past the Zod gate. This is redaction by construction, not redaction by discipline.
- **Public view drops the disposition split too.** The web projection carries only `{ category, count }`. Dropping the disposition split prevents an outsider from inferring "credential-blocked spiked → an exfil attempt is in progress", and the small-cohort floor (`<5`) prevents fingerprinting a single incident.
- **Poisoned categories are dropped, not bucketed.** A prompt-injected plan can't change classification (a pure rule table) or suppress the basis (emitted by the guard, not by model output). If it poisons `detail.category` with a bogus value, the handler validates against the closed `CommandRiskCategory` set and **drops** unknown values — counted as nothing rather than corrupting a bucket. Counts never feed back to the kernel, so a poisoned dashboard can't influence future decisions.
- **The confirm path reads `business.rule_satisfied`, not a `validation` code.** REQUEST_CONFIRMATION emits `business.rule_satisfied` with `rule: "command_risk_confirm"`; the fold reads both channels deliberately.

## Invariants preserved

- Determinism/replay untouched — read-only telemetry outside the determinism boundary; the fold is order-insensitive (commutative integer increments) with a deterministic output sort (category rank desc, disposition rank asc) so two runs over the same window are byte-identical. The only clock use is the handler's **injected** `clock` resolving an omitted `until`. No kernel change. No closed-enum widening — `CommandRiskCategorySchema` mirrors the kernel `CommandRiskCategory` (the public fixture includes `safe`; the aggregation enum excludes it since safe produces no basis). Additive MINOR on `@adjudicate/admin-sdk`; apps are app-only.

## Test coverage

`packages/admin-sdk/tests/command-risk-handler.test.ts` (both-channel bucketing, deterministic sort, poisoned/unknown category dropped, window + non-command-basis exclusion, injected-clock window, empty window, and a no-leak assertion that the serialized output contains no command/secret/rule-id; events: newest-first, field allowlist, category+disposition filters, limit/truncated). Console: `/command-risk` page component test (distribution renders, blocked list renders WITHOUT any command text, Approval Center cross-link, filter, loading/empty/error states), `CommandRiskBadge` redaction tests, and `redactCommand` unit test. Web: `command-risk-transparency` projection test (cohort floor, no command/rule/disposition key leak, severity order).

## Lifecycle

New `@adjudicate/admin-sdk` symbols (`governance.commandRisk`, `governance.commandRiskEvents`, `CommandRiskQuery`/`Result`/`Bucket`/`Category`/`Disposition`/`Event*` schemas + inferred types, `createCommandRiskStatsHandler` / `createCommandRiskEventsHandler`) ship in the combined WS3 MINOR wave with `.changeset/command-risk.md` and V1_FREEZE_MATRIX rows (added in the Phase-E backfill). Console/web are app-only.
