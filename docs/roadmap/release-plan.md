# WS4 Combined Release Plan — "Parity First, Ship Together"

> Status: Plan / design-only. No code changes are part of this document.
> Owner: Release Engineering. Audience: maintainers cutting the next
> publish wave, plus reviewers of the Version PR.
> Branch under plan: `feat/enhancement-roadmap` → `main`.
> Date: 2026-06-07.

This is the single combined release plan for the next publish wave under
the locked **parity-first, ship-together** decision: WS3's new backend
surfaces are built now, and their changesets + ADRs + freeze-matrix rows
join the **15 already-staged changesets** in **one combined post-v1 MINOR
release wave** — no MAJOR. The two new domain Packs go **stable at
`0.2.0`** in the same wave.

It covers both apps explicitly:

- **`apps/console`** (port 5180) — the full reference operator console.
- **`apps/web`** (port 5181) — the public-facing, read-only demo with
  aggregates-only dashboards.

Neither app is published, so neither app needs a changeset (see
[§7](#7-app-changes-vs-published-surface-the-changeset-boundary)).

---

## 1. Versioning reality (read this first)

This wave is **NOT "the v1.0 cut."** The v1 line is already shipped and
**frozen**. This is a disciplined **post-v1 MINOR wave** under
[`EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md) and
[`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md).

Confirmed facts:

| Fact | Confirmed value | Source |
|---|---|---|
| Root `package.json` version | `0.1.0`, `private: false`, name `adjudicate` — **vestigial**; nothing publishes from it. | repo root `package.json` |
| Packages version | **independently**. `.changeset/config.json` has `"fixed": []` and `"linked": []` (both empty) → no lockstep. | `.changeset/config.json` |
| Changeset access | `"access": "public"`, baseBranch `main`, `"commit": false`. | `.changeset/config.json` |
| Latest git tag | `v1.1.0`. | `git tag --sort=-v:refname` |
| Already past v1 | `core 1.2.0`; `admin-sdk`/`audit`/`audit-postgres 2.0.0`; `conformance`/`observability 1.0.0`. | `packages/*/package.json` |
| Still 0.x | `adapter-core`/`analyze`/`anthropic`/`openai`/`primitives`/`cli`/`pack-*` at `0.2.x`; `approval-engine`/`drift`/`red-team` at `0.1.0`; two packs at `0.1.0-experimental`. | `packages/*/package.json` |

**Implication:** "minor wave" means each package takes the highest bump
its aggregated changesets demand; the wave does not pin all packages to a
single version. `@adjudicate/audit` is **not** touched by any staged
changeset and will not republish.

The freeze matrix's §24 "align everything to `1.0.0`" advisory is
**stale** — it predates the independent-versioning reality above and the
post-v1 reps that already shipped (`core 1.2.0`, `audit-postgres 2.0.0`).
Do **not** act on §24 in this wave.

---

## 2. The 15 already-staged changesets

The `.changeset/` directory holds 17 `.md` files. Two are not release
changesets: `README.md` (the changesets template) and `config.json`. The
remaining **15** are this wave's staged changesets:

| # | Changeset file | Packages → bump | Summary (one line) |
|---|---|---|---|
| 1 | `agent-memory-store.md` | adapter-core:minor, admin-sdk:minor | `MemoryStore` (in-memory + redis) + `memoryStore`/`enrichContext`/`deriveMemoryWriteback` upstream-of-envelope seams; `memory.bySession` (ADR-126). |
| 2 | `ai-bom.md` | conformance:minor, cli:minor, admin-sdk:minor | `generateAiBom` (EU AI Act / NIST RMF); `adjudicate pack bom`; `pack.aiBom` (ADR-127). |
| 3 | `approval-engine.md` | approval-engine:minor, admin-sdk:minor | New `@adjudicate/approval-engine` (human-approval orchestration, replay-safe resume); `approval.list`/`approval.resolve` (ADR-122). |
| 4 | `audit-remediation-2026-06-07.md` | audit-postgres:patch, core:patch, primitives:patch, conformance:patch, anthropic:minor, openai:minor, pack-deployments-approval:patch | Adversarial-audit remediation: migration `010` (record_version `IN (1..5)` + `metadata_jsonb`); fail-closed token budget; total-order BOM comparators; provider adapters forward the agent-loop seams. |
| 5 | `behavioral-drift.md` | drift:minor, admin-sdk:minor | New `@adjudicate/drift` (TVD / new-category / proportion-spike over the AuditEventBus); `governance.behavioralDrift` (ADR-119). |
| 6 | `command-risk-guard.md` | primitives:minor, core:patch | `createCommandRiskGuard` + `command-classify`; `validation.COMMAND_BLOCKED/_FLAG_STRIPPED/_SANITIZED` basis codes (ADR-123). |
| 7 | `config-integrity-seal.md` | conformance:minor, core:patch, adapter-core:minor, admin-sdk:minor | `sealPackConfig`/`verifyConfigSeal`; config-seal loop gate + `refused` outcome; `kill.SEAL_MISMATCH`; `governance.configSealStatus` (ADR-121). |
| 8 | `hallucination-scoring.md` | core:minor, observability:minor, admin-sdk:patch, audit-postgres:patch | AuditRecord **v5** optional `metadata` (excluded from hash) + `attachAuditMetadata` + `metadataProvider` seam; `createHallucinationMetadataProvider`; v5 read acceptance (ADR-124). |
| 9 | `incident-and-access-packs.md` | pack-incident-response:minor, pack-access-governance:minor | New domain Packs exercising all six Decision outcomes via L2 primitives (Items 9/10). |
| 10 | `maturity-wave-2026-06-07.md` | primitives:patch, pack-deployments-approval:patch, red-team:minor, observability:minor, pack-access-governance:minor | Maturity wave: harden command-risk REFUSE tier; residency-bounded carbon clamp; `taintEscalationCausality`; `createLexicalGroundednessScorer`; pack-access-governance uses `createDataClassificationGuard`. |
| 11 | `pii-data-classification-guard.md` | core:minor, primitives:minor, analyze:minor, admin-sdk:minor | `createDataClassificationGuard` (PII/PHI redaction); `data_classification` `GuardDescription` variant + `validation.PII_*` codes; AJD-104 extension; `governance.piiClassificationStats` (ADR-117). |
| 12 | `policy-coherence-analyzer.md` | analyze:minor, admin-sdk:minor | Tier-3 `PolicyCoherenceAnalyzer` (AJD-301) + `plannerProbes`/`tier3Analyzers` options; `governance.policyCoherence` (ADR-125). |
| 13 | `red-team.md` | red-team:minor, cli:minor, admin-sdk:minor | New `@adjudicate/red-team` (deterministic adversarial generation); `adjudicate red-team`; `governance.redTeam` (ADR-118). |
| 14 | `release-gating.md` | pack-deployments-approval:minor | Release-gating extensions (Item 14): regression-aware ESCALATE, carbon-budget REWRITE, model/prompt CONFIRM. |
| 15 | `token-budget-guard.md` | primitives:minor, adapter-core:minor, anthropic:minor, openai:minor, admin-sdk:minor | `createTokenBudgetGuard`; `AssistantTurn.usage` + `onTokenUsage`; provider usage mapping; `governance.tokenBudget` (ADR-120). |

### 2.1 Aggregated net bump per package (computed from the 15 changesets)

Changesets takes the **highest** bump declared for a package across all
files. Computed result (this is the ground truth — see the discrepancy
note below):

| Package | Current | Aggregated bump | Resulting version |
|---|---|---|---|
| `@adjudicate/core` | 1.2.0 | minor | **1.3.0** |
| `@adjudicate/admin-sdk` | 2.0.0 | minor | **2.1.0** |
| `@adjudicate/audit-postgres` | 2.0.0 | **patch** | **2.0.1** |
| `@adjudicate/conformance` | 1.0.0 | minor | **1.1.0** |
| `@adjudicate/observability` | 1.0.0 | minor | **1.1.0** |
| `@adjudicate/primitives` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/cli` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/analyze` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/anthropic` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/openai` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/adapter-core` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/pack-deployments-approval` | 0.2.0 | minor | **0.3.0** |
| `@adjudicate/approval-engine` | 0.1.0 | minor | **0.2.0** |
| `@adjudicate/drift` | 0.1.0 | minor | **0.2.0** |
| `@adjudicate/red-team` | 0.1.0 | minor | **0.2.0** |
| `@adjudicate/pack-incident-response` | 0.1.0-experimental | minor | **0.2.0** (stable; -experimental dropped) |
| `@adjudicate/pack-access-governance` | 0.1.0-experimental | minor | **0.2.0** (stable; -experimental dropped) |

**Count (computed): 16 minor + 1 patch, 0 major.** The single patch is
`audit-postgres` (its only changesets — #4 and #8 — declare patch).

> **Discrepancy note (must reconcile before the Version PR).** Roadmap
> notes elsewhere cite "14 minor + 3 patch." The staged changesets as
> they exist on disk today compute to **16 minor + 1 patch**. The
> aggregate is correct by construction (changesets max-rule); the prose
> count is stale. Reconcile when reviewing the Version PR's computed
> diff — do not hand-edit versions to force the older count. Either way,
> the invariant holds: **no MAJOR**, so the freeze is respected.

`@adjudicate/audit`, `@adjudicate/runtime`, `@adjudicate/migrate`,
`@adjudicate/canonical`, `@adjudicate/locales-pt-br`,
`@adjudicate/pack-payments-pix`, `@adjudicate/pack-identity-kyc`, and
`@adjudicate/core/llm`-only consumers are **untouched** by staged
changesets and will not republish (unless WS3's new changesets add them —
see §3).

### 2.2 Experimental → stable (INFO, confirmed)

Both `pack-incident-response` and `pack-access-governance` are currently
`0.1.0-experimental` (verified in their `package.json`; both
`publishConfig.access: "public"`). The decision is **go stable**: a
stable `minor` changeset bump drops the `-experimental` prerelease tag,
producing `0.2.0`. The tag drop is **intended** — confirm the resulting
clean `0.2.0` in the Version PR diff before merge.

---

## 3. The new WS3 changesets this wave will also include

Under parity-first, WS3's backend surfaces are built **now** and their
changesets join this same wave. Each **new published symbol** requires,
in the **same PR** that introduces it: a **changeset**, an **ADR**, and
**`V1_FREEZE_MATRIX.md` rows** (governance contract — see §6).

The existing router already ships single-shot/snapshot procedures
(`governance.behavioralDrift`, `governance.redTeam`, `pack.aiBom`,
`governance.tokenBudget`, confirmed in
`packages/admin-sdk/src/trpc/index.ts`). The WS3 increment adds the
**history / timeline / list / new-guard** procedures that do **not** yet
exist (confirmed absent in `packages/admin-sdk/src/`):

| WS3 surface | Package(s) → bump | Changeset? | ADR + matrix rows? |
|---|---|---|---|
| **command-risk admin-sdk procedure + schemas** (e.g. `governance.commandRisk` + `CommandRiskResultSchema`) | admin-sdk:minor | **Yes** | Yes — new procedure + Zod schemas are published surface. |
| **`governance.killSwitchTimeline`** procedure (consumes `analyzeKillSwitchTimeline` already in `@adjudicate/audit` §29.3) | admin-sdk:minor | **Yes** | Yes — new procedure + result schema. ADR may reference existing ADR-114 lineage. |
| **drift history** (`governance.driftHistory` + a drift **store** in `@adjudicate/drift`) | drift:minor, admin-sdk:minor | **Yes** | Yes — new store seam (drift) + new procedure (admin-sdk). |
| **red-team history** (`governance.redTeamHistory` + a red-team **store**) | red-team:minor, admin-sdk:minor | **Yes** | Yes — new store seam (red-team) + new procedure. |
| **token-usage store** (in `@adjudicate/adapter-core`) + **per-tenant token schema** | adapter-core:minor, admin-sdk:minor | **Yes** | Yes — new persistence seam + new schema. |
| **approval-engine real-resolve wiring** (turn the console's display-only projection into a real `approval.resolve` path) | approval-engine:minor, admin-sdk:patch-or-minor | **Yes** | Yes if it adds/changes published symbols; matrix row per new symbol. If purely internal wiring with no new export, CHANGELOG-only is insufficient — still needs a changeset for the version bump. |
| **ai-bom list procedure** (`pack.aiBomList` — multi-pack, distinct from existing single-pack `pack.aiBom`) | admin-sdk:minor | **Yes** | Yes — new procedure + list result schema. |
| **console wiring** of all of the above (panels, tRPC client calls) | — | **No (app-only)** | N/A — `apps/console` is unpublished. |
| **web** read-only/aggregate views of any WS3 surface | — | **No (app-only)** | N/A — `apps/web` is unpublished. |

> **New-package note:** if any WS3 store lands as a brand-new package
> rather than an export on `drift`/`red-team`/`adapter-core`, that
> triggers EXTENSION_POLICY §2.3 (new public package ⇒ ADR **required**)
> and a full freeze-matrix section, not just rows. The plan above assumes
> the stores are **additive exports on existing packages** (MINOR, ADR
> per §2.3 only if they add a new reusable seam — drift/red-team stores
> are new persistence seams, so **ADR required**).

**Net effect on the aggregate:** WS3 raises `admin-sdk` (already minor),
`drift`, `red-team`, `adapter-core`, `approval-engine` (all already
minor in §2.1) — so the per-package **resulting versions in §2.1 do not
change** because those packages are already at minor. WS3 **adds new
freeze-matrix rows and ADRs**, not new version bumps beyond what's staged.

---

## 4. Feature UI design — console (full) and web (sanitized subset)

Per the locked dual-app decision: **console = full operator tool**;
**`apps/web` = read-only, public-facing demo, aggregates only.** `apps/web`
must **never** render raw PII, raw commands, prompt contents, tokens, or
any privileged action. `apps/web` has no auth/tenant model, no charting
lib, and node-only vitest today — so any web surface added here is a
**new, deliberately minimal, public-safe transparency view**.

Data path for every panel: new UI data ⇒ **new Zod schema + new
procedure in `@adjudicate/admin-sdk`** (a NEW PUBLISHED SURFACE; see §6).
The SDK carries **no** dependency on feature packages — it re-declares
result shapes as Zod schemas, and the **adopter** computes reports from
the real packages and threads them into `AdminContext`.

| Surface | Console (full) | `apps/web` (read-only, aggregates only) |
|---|---|---|
| **Command risk** (`createCommandRiskGuard`) | Per-event disposition (REFUSE/REWRITE/CONFIRM), the **raw command string**, stripped flags, basis codes. | Aggregate counts by disposition only. **Never the raw command string.** Render `{REFUSE: n, REWRITE: n, CONFIRM: n}` over a window. |
| **Token budget / token-usage** (`createTokenBudgetGuard`, `onTokenUsage`) | Per-session/per-tenant token meters, over-budget DEFER/REFUSE events, tenant-scoped breakdown. | Coarse aggregate (e.g. total turns gated by budget) with **no tenant identifiers and no raw token counts** tied to a principal. Bucketed only. |
| **PII / data classification** (`createDataClassificationGuard`, `governance.piiClassificationStats`) | Dispositions by `(sensitivityLevel × disposition)`; redacted-field names in `DecisionBasis.detail`. | (sensitivityLevel × disposition) **counts** only. **Never the matched payload or the redacted values.** |
| **Behavioral drift** (`@adjudicate/drift`, `governance.behavioralDrift` + WS3 `driftHistory`) | Live snapshot + history timeline; TVD / new-category / proportion-spike series; `onDrift` events. | Public drift **trend** (the snapshot's scalar drift score over time). No per-category raw distributions if they could leak Pack-internal kinds beyond what the public demo Pack already exposes. |
| **Red-team** (`@adjudicate/red-team`, `governance.redTeam` + WS3 `redTeamHistory`) | Full `RedTeamReport`: per-vector escapes, the adversarial scenarios, taint-escalation causality. | Pass/fail **headline** + escape count per vector. **Never the generated attack payloads** (they read as how-to). |
| **Policy coherence** (Tier-3 AJD-301, `governance.policyCoherence`) | Full diagnostic list (phantom/unreachable intent, taint contradiction, threshold conflict, planner-probe errors). | A green/amber/red coherence badge + diagnostic **count**. No source locations or Pack internals. |
| **Config integrity seal** (`sealPackConfig`/`verifyConfigSeal`, `governance.configSealStatus`) | Seal status, mismatch detail, `kill.SEAL_MISMATCH` engagements, `refused` turns. | Sealed/unsealed **status badge** only. No seal contents, no signature. |
| **Hallucination scoring** (`createHallucinationMetadataProvider`, `bucketHallucinationScore`) | Per-record score + bucket; the `adjudicate.hallucination.score`/`.bucket` semconv series. | Bucket **distribution** (low/med/high counts). **Never claim/evidence text.** |
| **AI-BOM** (`generateAiBom`, `pack.aiBom` + WS3 `pack.aiBomList`) | Full BOM per Pack: fingerprint, conformance, health, manifest, model/prompt hashes. | Public BOM **summary** (Pack id, kernel version, conformance pass/fail). **Never `promptHashes` or tool/rag internals** if they reveal non-public config. |
| **Approvals** (`@adjudicate/approval-engine`, `approval.list`/`.resolve` + WS3 real-resolve) | Full Approvals view: pending REQUEST_CONFIRMATION flows, **resolve action** (operator-only privileged action). | **Operator-only — NOT exposed on web.** Resolving an approval is a privileged action; the public demo shows, at most, a non-actionable aggregate count of pending approvals. |
| **Session memory** (`MemoryStore`, `memory.bySession`) | Per-session memory enrichment view. | **Operator-only — NOT exposed on web.** Session memory can carry conversation content; do not expose. |
| **Kill-switch timeline** (WS3 `governance.killSwitchTimeline`) | Full timeline: events by source (`pubsub/poll/boot/external`), stability class, latency. | Kill-switch **state** (`active`/`normal`) + a coarse public uptime/transition count. No operator transition controls. |
| **Emergency / kill-switch toggles** (`emergency.*`) | Full operator controls (privileged). | **Operator-only — NOT exposed on web.** |

**Operator-only (never on web):** approvals resolve, session memory,
emergency/kill-switch toggles, replay drill-down with raw envelopes, and
any procedure that returns raw payloads, commands, prompts, or tokens.

**`apps/web` engineering pre-reqs** (plan, not in scope to build here):
`apps/web` currently has only a 100%-mock `ConsolePreview` card, an
unused React Query provider, no charting lib, node-only vitest, and no
auth. Lighting up real (read-only) aggregates requires: wiring the React
Query provider to a **read-only, unauthenticated, aggregates-only**
subset of the admin-sdk router (a separate public caller that exposes
**only** the sanitized procedures), and a minimal chart primitive. None
of this adds published surface — it's app-only.

---

## 5. RC pipeline (`scripts/rc-checks.ts`) — the 7 steps

`pnpm rc:check` runs these in order; it **exits non-zero on the first
failure** (breaks the loop). Confirmed against the script:

| # | Step (script name) | What it validates |
|---|---|---|
| 1 | **lint (typecheck + eslint)** — `pnpm lint` | Workspace-wide `tsc --noEmit` typecheck + ESLint. |
| 2 | **test suite (every workspace)** — `pnpm test` | All package tests, **including** the in-tree `cross-runtime-hash-vectors.test.ts` and the console's jsdom/RTL tests. |
| 3 | **version consistency** — `tsx scripts/check-versions.ts` | Every `@adjudicate/*` has clean semver; in-repo cross-package deps use `workspace:*`; **CLI `bin.ts` `.version("…")` literal === `cli/package.json`**. ← **Blocker 1 lives here.** |
| 4 | **freeze-matrix consistency** — `tsx scripts/check-freeze-matrix.ts` | Compares each package's `src/index.ts` exports to backticked symbols in `V1_FREEZE_MATRIX.md`. **Exits 0 by default (advisory)**; only `--strict` gates, and even RC runs `--strict` with `continue-on-error`. ← **Blocker 2 is "soft" because of this.** |
| 5 | **kernel dep allowlist (`@adjudicate/core`)** | `core`'s `dependencies` ⊆ `{@adjudicate/canonical, @noble/hashes, zod}`. Any other dep fails — the determinism-boundary guard. |
| 6 | **cross-runtime hash vectors spec presence** | `docs/specs/canonical-hash-vectors.json` exists, parses, and has a non-empty `vectors` array. (The vectors are *executed* in step 2; this asserts the spec file itself.) |
| 7 | **scale harness smoke** — `pnpm -F @adjudicate/bench test` | The CI-light scale tests under `bench/src/scale/`. |

> Note: the rc-checks header comment lists "typecheck" as a separate step
> but it is folded into step 1 (`lint` runs `tsc --noEmit`). The
> executable `steps[]` array has exactly the 7 above.

The tag-driven `release-candidate.yml` runs a superset (build, lint,
test, check:versions, **check:freeze-matrix --strict with
`continue-on-error: true`**, cross-runtime vectors, pack-trust round-trip,
replay-with-integrity, `rc:scale`, dependency audit, and artifact
uploads). It does **not** run on this wave's normal `main` merge — it
fires on `v*` / `v*-rc*` tag push or manual dispatch.

---

## 6. Governance contract — every new symbol needs a row + ADR + changeset (same PR)

This is the rule that the whole "parity-first" sequencing must satisfy.
Confirmed in the docs:

- **`SEMVER_GOVERNANCE.md` §5:** "A PR that adds a new public symbol
  *must* also add a matrix row in the same PR. The CI check is
  mechanical, not advisory."
- **`SEMVER_GOVERNANCE.md` §9 / §"merge gate":** freeze-matrix row
  added/updated for **every** public-surface change; the gate is
  "mechanical."
- **`EXTENSION_POLICY.md` §2.2:** MINOR additive surface requires a
  CHANGELOG entry, a test, and **a row in the freeze matrix**.
- **`EXTENSION_POLICY.md` §2.3:** a **new public package**, a **new
  sink/ledger/bridge seam**, or a **new reusable persistence layer**
  requires a **numbered ADR**, a freeze-matrix entry, and a CHANGELOG
  reference.

**Tension to manage:** the documented contract says the matrix check is
"mechanical, not advisory," but the **actual tooling is advisory today** —
`check-freeze-matrix.ts` defaults to exit 0 (only `--strict` gates), and
even `release-candidate.yml`'s `--strict` invocation is
`continue-on-error: true`; `ci.yml` runs the plain (non-strict) form.
**So the matrix gap will not mechanically block the merge — but shipping
without the rows violates the written governance contract.** Treat the
rows + ADRs as **release-blocking by policy**, not by CI.

### 6.1 Freeze-matrix debt to close in this wave

The matrix is **missing rows** for surface that has already shipped in
`0.1.0`/`0.2.0` reps **and** for everything new in this wave. The
parity-first PR(s) must add rows for, at minimum:

**New packages (need a freeze-matrix *section* each + an ADR each):**
`@adjudicate/approval-engine` (ADR-122), `@adjudicate/drift` (ADR-119),
`@adjudicate/red-team` (ADR-118), `@adjudicate/pack-incident-response` &
`@adjudicate/pack-access-governance` (Items 9/10).

**New exported symbols on existing packages (need a row each):**
`createCommandRiskGuard` + `command-classify` (ADR-123),
`createTokenBudgetGuard` (ADR-120), `createDataClassificationGuard` +
`data_classification` `GuardDescription` variant (ADR-117),
`generateAiBom` (ADR-127), `sealPackConfig`/`verifyConfigSeal` (ADR-121),
`createHallucinationMetadataProvider`/`bucketHallucinationScore` +
`createLexicalGroundednessScorer` (ADR-124), `MemoryStore` +
`memoryStore`/`enrichContext`/`deriveMemoryWriteback` (ADR-126), the
Tier-3 `PolicyCoherenceAnalyzer` / **AJD-301** (ADR-125), the new
`validation.*` and `kill.SEAL_MISMATCH` basis codes, AuditRecord **v5** /
`attachAuditMetadata` and the widened `AuditRecordVersion` (the matrix
still lists the union as `1 | 2 | 3 | 4` in §1.1 — widening to `5` is
the documented MINOR but the row is not updated), and the new admin-sdk
procedures/Zod schemas.

**New WS3 symbols (need a row each):** `governance.commandRisk`,
`governance.killSwitchTimeline`, `governance.driftHistory` + drift store,
`governance.redTeamHistory` + red-team store, the adapter-core
token-usage store + per-tenant token schema, the approval real-resolve
surface, and `pack.aiBomList`.

> These ADRs (116–127) **already exist** on disk (confirmed in
> `docs/architecture/adr/`). The debt is the **freeze-matrix rows**, not
> the ADRs — the ADRs landed with the feature changesets but the matrix
> was not kept in lockstep. WS3's *new* symbols are the only ones that
> may need *new* ADR numbers (≥ ADR-128); each must land in the same PR.

---

## 7. App changes vs published surface — the changeset boundary

| Change kind | Published? | Changeset? | ADR / matrix row? |
|---|---|---|---|
| New export / procedure / Zod schema on any `@adjudicate/*` package | **Yes** | **Yes** | Yes (per §6). |
| New `@adjudicate/*` package | **Yes** | **Yes** | ADR + matrix **section** (§2.3). |
| `apps/console` panel / tRPC client / page | **No** (unpublished reference UI) | **No** | No. |
| `apps/web` aggregate dashboard / public caller / chart | **No** (unpublished marketing+demo) | **No** | No. |
| `bin.ts` version literal (Blocker 1) | (part of `cli` publish) | covered by the existing `cli` changeset bump | No new row. |

Both apps are **excluded** from the changesets workspace? — verify:
`.changeset/config.json` `ignore` lists `@example/*` and
`@adjudicate/eslint-config`, **not** the apps. The apps don't appear in
changesets because **they have no changeset files**, not because they're
ignored. The safe rule: **do not author changesets for app-only work.**

---

## 8. Blockers (in order)

### Blocker 1 — HARD: CLI version literal mismatch

`packages/cli/src/bin.ts` line 27 hardcodes `.version("0.2.0")`, but the
`cli` package bumps to **`0.3.0`** in this wave (changesets #2, #13). The
version-consistency check (`scripts/check-versions.ts`, run as **rc-checks
step 3** *and* as `ci.yml`'s "Version consistency" step) asserts the
`bin.ts` literal **equals** `cli/package.json`. After the Version PR
sets `cli` to `0.3.0`, the literal `"0.2.0"` ≠ `"0.3.0"` ⇒ **CI fails**.

**The check's matcher (verified):** `check-versions.ts` extracts the
literal with `/\.version\("([^"]+)"\)/`. The comparison runs **only if
that regex matches**; on no match the surrounding `try/catch` swallows it
and the check becomes **advisory** for the CLI (the comment says so:
"If the CLI bin moves, the check becomes advisory rather than
load-bearing").

**Recommended fix (durable):** make `bin.ts` read its version from
`package.json` at runtime instead of a literal (e.g. import the package
JSON and pass `pkg.version` to `.version(...)`). **Caveat — verified:**
a dynamic read means the `/\.version\("…"\)/` regex **no longer matches**,
so `check-versions.ts` **stops validating** the CLI version (it falls
into the advisory catch). That's acceptable (the literal can no longer
drift), but it does **remove** a check rather than satisfy it.

**Fallback (keeps the check load-bearing):** simply bump the literal to
`"0.3.0"` **in the Version PR**, in the same commit that bumps
`cli/package.json`. This keeps the static cross-check alive.

**Decision for this wave:** prefer the **fallback (bump the literal)** so
the cross-check stays load-bearing, and file a follow-up to make the read
dynamic *and* update `check-versions.ts` to validate a dynamic read
(e.g. resolve `pkg.version` the same way) so durability and the check
coexist. Whichever path: **the literal must be `0.3.0` before merge.**

### Blocker 2 — GOVERNANCE-MANDATORY (CI-soft today): freeze-matrix rows

The matrix is missing rows for the 5 new packages and all new exported
symbols (existing + WS3) — full list in §6.1. Per
`SEMVER_GOVERNANCE.md §5/§9` and `EXTENSION_POLICY.md §2.2/§2.3`, each
needs a row in the same PR. **CI will not mechanically catch this** (§6:
the check is advisory / `continue-on-error`), so it is a **policy
blocker**: a reviewer must confirm every new public symbol has a matrix
row and an ADR before approving the Version PR. **Skipping it violates
the documented contract even though the build stays green.**

### Blocker 3 — INFO: experimental → stable

`pack-incident-response` and `pack-access-governance` go from
`0.1.0-experimental` to **stable `0.2.0`**. The `-experimental`
prerelease-tag drop is **intended**. Just verify the clean `0.2.0` in the
Version PR diff (no stray `-experimental`).

### Blocker 4 — INFO: not a blocker for this wave

The two **adopter-evidence** items — kill-switch v2 latency profile and
`AuditEventBus` WebSocket fan-out at scale — gate the **formal v1.0-line
alignment** per `V1_FREEZE_MATRIX.md §24/§26/§28`, **not** this additive
MINOR wave. Both stay `evidence-gated` (tier G) and ship unchanged
defaults. Do not let them block this wave.

---

## 9. Release flow (`release.yml` via changesets/action)

Confirmed against `.github/workflows/release.yml`:

```
feat/enhancement-roadmap  ──PR──▶  main
                                    │  (ci.yml gates: build, lint, test,
                                    │   check:versions, check:freeze-matrix [advisory])
                                    ▼
              changesets/action opens the Version PR
              "chore(release): version packages"
              (runs `pnpm changeset version` → bumps + CHANGELOGs)
                                    │
                ┌───────────────────┴───────────────────┐
                │  REVIEW the Version PR:                 │
                │   - computed versions match §2.1        │
                │   - CHANGELOGs read correctly           │
                │   - bin.ts literal == 0.3.0 (Blocker 1) │
                │   - freeze-matrix rows present (Blkr 2) │
                │   - packs are clean 0.2.0 (Blocker 3)   │
                │   - ci.yml is GREEN on the Version PR    │  ← gating happens here
                └───────────────────┬───────────────────┘
                                    ▼ merge Version PR
              changesets/action (re-run on main) publishes:
                `pnpm publish -r --access public --provenance`
                  + Syft/SPDX SBOM (anchore/sbom-action, gated published==true)
                  + Sigstore attestation (actions/attest-sbom, gated published==true)
                                    │
                                    ▼
              smoke-test.yml verifies installability
              (pnpm-pack tarballs OR npm-registry install of
               core/runtime/audit/audit-postgres + import smoke)
```

Key points:

- **`release.yml` does NOT run tests.** It only does
  `install → build → changesets/action`. **All gating is `ci.yml`** on
  the Version PR (and on every PR). If `ci.yml` is red on the Version PR,
  do not merge.
- SBOM + attestation steps are `if: steps.changesets.outputs.published ==
  'true'` — they run only when packages actually hit npm, not when the
  action merely opens the Version PR.
- `smoke-test.yml` runs on PR/push (pnpm-pack mode) and on
  `release: published` / dispatch (registry mode). It only smoke-imports
  `core/runtime/audit/audit-postgres` — the new packages are **not**
  smoke-tested by it. Consider adding the new packs/packages to the smoke
  matrix as a follow-up (app-only-equivalent: not blocking).

---

## 10. Final sequenced release checklist (WS3 lands first)

Ordered. Assumes parity-first: **WS3 backend surfaces are built and
merged into the wave before the Version PR is cut.**

**A. Build WS3 surfaces (parity).**
- [ ] Implement WS3 backend surfaces (command-risk procedure;
      `governance.killSwitchTimeline`; `governance.driftHistory` + drift
      store; `governance.redTeamHistory` + red-team store; adapter-core
      token-usage store + per-tenant token schema; approval-engine
      real-resolve wiring; `pack.aiBomList`).
- [ ] For **each** new published symbol: add a **changeset**, the
      **ADR** (new numbers ≥ ADR-128 where no ADR exists yet), and the
      **`V1_FREEZE_MATRIX.md` rows** — all in the **same PR** (§6).
- [ ] Wire `apps/console` panels to the new procedures (**no changeset**).
- [ ] Wire `apps/web` **read-only aggregate** views (sanitized subset
      only; **no changeset**); confirm no raw PII/commands/prompts/
      tokens/privileged actions leak (§4).

**B. Close governance debt (Blocker 2).**
- [ ] Add freeze-matrix rows for the 5 new packages (sections) and **all**
      new exported symbols on existing packages — the §6.1 list.
- [ ] Update the §1.1 `AuditRecordVersion` row to include `5`
      (`1 | 2 | 3 | 4 | 5`) and add the AuditRecord-v5 / `attachAuditMetadata`
      rows (ADR-124).
- [ ] Run `pnpm check:freeze-matrix --strict` locally and review the
      "undeclared exports" list until it's empty for the new surface
      (advisory, but use it as the checklist).

**C. Fix Blocker 1.**
- [ ] In the Version PR, set `packages/cli/src/bin.ts` `.version(...)` to
      **`0.3.0`** (matches the bumped `cli/package.json`). [Fallback path
      — keeps `check-versions.ts` load-bearing.]
- [ ] File follow-up: dynamic read in `bin.ts` **+** matching update to
      `check-versions.ts` so the check still validates.

**D. Pre-flight (local RC).**
- [ ] `pnpm rc:check` green (the 7 steps in §5).
- [ ] `pnpm check:versions` green (after Blocker 1 fix).
- [ ] Confirm `@adjudicate/audit` and other untouched packages have **no**
      stray changeset.

**E. Open the wave PR → main.**
- [ ] PR `feat/enhancement-roadmap` (with WS3 merged in) → `main`.
- [ ] `ci.yml` green (build, lint, test, check:versions,
      check:freeze-matrix advisory).
- [ ] `smoke-test.yml` (pnpm-pack mode) green.

**F. Version PR (changesets/action).**
- [ ] Merge to `main` triggers the **"chore(release): version packages"**
      Version PR.
- [ ] Review computed versions against **§2.1** (and reconcile the
      "16 minor + 1 patch" vs prose "14+3" discrepancy on the computed
      diff — **§2.1 note**).
- [ ] Confirm the two packs resolve to clean **`0.2.0`** (no
      `-experimental`) — **Blocker 3**.
- [ ] Re-confirm `bin.ts` literal is `0.3.0` in the versioned tree —
      **Blocker 1**.
- [ ] Re-confirm freeze-matrix rows present — **Blocker 2** (policy).
- [ ] Read every generated CHANGELOG.
- [ ] **`ci.yml` green on the Version PR** (this is the real gate;
      `release.yml` runs no tests).

**G. Publish.**
- [ ] Merge the Version PR. changesets/action runs
      `pnpm publish -r --access public --provenance`.
- [ ] Confirm SBOM (`sbom.spdx.json`) + Sigstore attestation produced
      (only fire on `published == true`).
- [ ] `smoke-test.yml` (registry mode) green on the published versions.

**H. Post-publish.**
- [ ] Tag the wave consistently with the independent-versioning reality
      (the repo tags a line marker, e.g. `v1.x`; latest is `v1.1.0`).
- [ ] Verify the two evidence-gated items (kill-switch v2, AuditEventBus)
      remain **unchanged / tier G** — they are out of scope (**Blocker 4**).
- [ ] Follow-up tickets: dynamic `bin.ts` + `check-versions.ts` update;
      add new packages to `smoke-test.yml`; reconcile/update
      `V1_FREEZE_MATRIX.md §24` stale "align-to-1.0.0" advisory.
