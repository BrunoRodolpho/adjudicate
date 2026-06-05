# Final Reliability Audit — 2026-05-21

> **Historical record — point-in-time snapshot (2026-05-21).** This is an
> archived audit report, not a description of current repo state; counts,
> file paths, and findings reflect the repo as of that date. See `README.md`
> for current status.
>
> Maintenance and reliability pass on the post-v1 governance-frozen repo.
> All work is **additive** or **diagnostic-only**: no architectural changes, no
> public API changes, no wire-format changes, no kernel-determinism changes,
> no semver-relevant behavior changes. Mission: make the existing system
> stronger, leaner, safer, simpler — without violating frozen invariants.

## Baseline vs end-of-pass

| Metric | Before | After | Delta |
|---|---|---|---|
| Tests passing | 1110 | **1111** | +1 (high-value, see §Test Improvements) |
| Tests skipped | 1 (live DB) | 1 (live DB) | unchanged |
| Tests failing | 0 | 0 | unchanged |
| Workspace build (`pnpm -r build`) | **broken**: stale `admin-sdk/dist` dropped a deleted field (`forbiddenConcepts`), causing `audit-postgres` build to fail with `TS2322` | clean | resolved |
| Duplicated `normalizeAt` (TIMESTAMPTZ coercion) | 2 copies, drift-prone | 1 shared helper with diagnostics | -1 source of drift |
| Operator-blind `console.error` in `redis-emergency-store` | 1 | 0 | -1 (replaced with `recordSinkFailure`) |
| Generic error messages without field context | 4 (kill-switch + emergency-store + 2× audit-postgres TIMESTAMPTZ) | 0 | -4 |

---

## Correctness Improvements

### 1. Build-time correctness — stale-artifact land-mine

**Finding.** `pnpm -r build` from a state with stale `packages/admin-sdk/dist`
artifacts produced a hard `TS2322` failure inside `packages/audit-postgres`:
the SDK changelog records the removal of `AuditPlanSnapshotSchema.forbiddenConcepts`,
but downstream packages consumed cached `dist` `.d.ts` files that still declared
the field as REQUIRED. The source is correct; the cached artifact was lying.

**Resolution.** A clean `pnpm -r build` rebuilds the SDK first (topological
order) and the downstream package now compiles. No source change was needed
once the artifact was refreshed. Verified via repeated `pnpm -r build` —
fully green across all workspace projects.

**Why this matters.** A maintainer pulling the repo on a fresh laptop builds
cleanly. A maintainer with stale `dist` from before the field-removal commit
sees an apparent regression that is in fact build-output staleness. We surface
this in the audit so future maintainers recognize it; no scripted guard is
added because that would itself be a maintenance liability.

### 2. Distributed kill-switch — error specificity

`packages/audit/src/distributed-kill-switch.ts`

Before:
```ts
if (typeof obj.active !== "boolean" || typeof obj.reason !== "string") {
  throw new Error("malformed payload");
}
```

After: split into two field-specific errors that name the offending field and
its actual type. Operators triaging a corrupt Redis key now learn whether
`active` or `reason` was wrong, and what type was found.

### 3. Redis emergency-state store — error specificity + cause chain

`packages/audit/src/redis-emergency-store.ts`

Three improvements:

1. `"payload is not an object"` now reports the actual type (or `null`).
2. `"malformed payload (missing active/reason)"` split into two field-specific
   errors, each naming the type seen.
3. The JSON-parse wrap now preserves the original error via the ES2022
   `{ cause }` property — the stack chain back to `JSON.parse` survives.

### 4. Postgres TIMESTAMPTZ coercion — diagnostics + DRY

`packages/audit-postgres/src/audit-store.ts`,
`packages/audit-postgres/src/governance-events.ts`,
**new** `packages/audit-postgres/src/pg-types.ts`

Two identical 6-line `normalizeAt` functions were extracted into a single
`normalizeTimestamptz(value, column?)` helper. The new helper:

- Names the offending column in the error message (`intent_audit.recorded_at`,
  `governance_events.at`), so a TIMESTAMPTZ drift narrows immediately.
- Includes a length-bounded sample of the bad value (with a fallback for
  unserializable inputs) — operators no longer have to attach a debugger to
  see what the pg driver returned.
- Lives in a single source so the next diagnostic improvement (or an
  observability hook, should we add one) lands once, not twice.

The old per-file helpers are deleted. Behavior is unchanged for valid inputs;
the error path is strictly richer.

### 5. Sink-failure routing for `historyLog` insert errors

`packages/audit/src/redis-emergency-store.ts`

Before: `console.error("[redis-emergency-store] failed to write...", err)`.
After: `recordSinkFailure({ subject: "redis-emergency-store", errorClass: "history_insert: <msg>", ... })`.

The behavior is the same — the kill-switch state still persists, `update()`
still returns successfully — but the failure signal now flows through the
adopter's `MetricsSink` to Sentry / PostHog / Datadog. `console.error` was
unroutable; structured `recordSinkFailure` is the established pattern (already
used by `distributed-kill-switch.ts`).

---

## Complexity Reduction

| File | Before | After | Notes |
|---|---|---|---|
| `audit-postgres/src/audit-store.ts` | 211 lines, includes inline `normalizeAt` | 203 lines, imports shared helper | -8 lines, single concept |
| `audit-postgres/src/governance-events.ts` | 70 lines, includes inline `normalizeAt` | 62 lines, imports shared helper | -8 lines, single concept |
| `audit-postgres/src/pg-types.ts` | did not exist | 43 lines (incl. JSDoc + bounded-sample helper) | new shared utility |
| Net change | — | — | One concept (`normalizeTimestamptz`) replaces two |

No abstractions were introduced beyond what duplicated code already implied.
No new layers, no new plugins, no new DSL.

The dead-code sub-audit (separate Explore agent) confirmed the codebase is
already lean: the agent found no removable public exports, no removable
internal helpers, no commented-out blocks. The few `@deprecated` aliases
(e.g. `AnthropicAdapterError` in `packages/anthropic/src/index.ts:82`) are
intentional v2.0-removal back-compat shims and were correctly left alone.

---

## Operational Improvements

### Diagnostics that survive an incident

The 5 enriched error / failure paths above mean an on-call operator can:

- Distinguish a malformed-`active` payload from a malformed-`reason` payload
  in the distributed kill switch within seconds, without re-running with extra
  logging.
- See which Postgres column produced an unexpected TIMESTAMPTZ value and a
  sample of what the driver returned.
- Catch `historyLog.insert` failures in the existing metrics pipeline rather
  than discovering them only when reconciling Postgres against Redis.

### Cause-preserving error chains

The JSON-parse wrap in `redis-emergency-store.ts` now uses `{ cause }`.
Sentry / structured loggers that walk the cause chain (most modern ones do)
now see the original `SyntaxError` location.

### Build-pipeline robustness

The `admin-sdk` stale-`dist` failure mode is now documented (this report).
A fresh `pnpm -r build` from any state produces a green workspace. The CI
release pipeline runs a full build, so this would have been caught at the gate
even without the audit — but a local-laptop maintainer can now self-diagnose.

---

## Maintenance Improvements

### Eliminated duplication
- 1 duplicated helper (`normalizeAt` in 2 files) → 1 shared helper.

### Documentation drift fixed (5 locations)

The repo had **5 separate stale test-count claims** in live, forward-looking
documentation (snapshot/audit docs were correctly left frozen):

| File | Before | After | Why it matters |
|---|---|---|---|
| `README.md:173` | "1022 tests passing" | "1110 tests passing (1 skipped)" | First impression for adopters |
| `AI_CONTEXT.md:231` | "1022 passing, 1 skipped" | "1111 passing, 1 skipped" | AI-context brief for future Claude / collaborator sessions |
| `PROJECT_STATUS_AND_NEXT_STEPS.md:16,200` | "1084 passing" | "1111 passing" | The status doc the project's stakeholders read first |
| `docs/ops/MAINTAINER_GUIDE.md:30,51,148` | "1084+ tests", "≥1084 passing" | "1110+ tests", "≥1110 passing" | Operational triage instruction |
| `docs/perf/v1-rc-baselines.md:108` | "existing 1022-test suite" | "existing 1110-test suite" | Performance baseline documentation |

The historical audit reports (`docs/release/POST_V1_AUDIT_REPORT.md`,
`docs/architecture/V0.7-AUDIT-REPORT.md`, `MAINTENANCE_COST_AUDIT.md`,
`OVERNIGHT-RUN-SUMMARY.md`) intentionally retain their as-of counts — they
are dated snapshots and rewriting them would be revisionism.

`docs/architecture/LONG_TERM_STEWARDSHIP_REPORT.md:30` already had the
correct 1110 count and was the source-of-truth that the live docs are now
realigned with.

### Cognitive-load reductions

- The kernel's `adjudicate.ts` triple-loop for state/auth/business guards is
  intentionally not refactored — it is fail-closed safety code with a strict
  evaluation order and the duplication is explicit-for-a-reason. The
  refactor cost (subtle determinism risk during the move) outweighs the
  3×40-line readability cost. This is a deliberate non-change.

### Dependency-risk reduction
No dependency churn. `pnpm audit --prod --audit-level high` continues to pass
(via `pnpm rc:audit`).

---

## Test Improvements

### Added
1. `packages/audit/tests/redis-emergency-store.test.ts`
   - **New test**: `"throws specific error when 'reason' is missing or wrong type"`.
     Covers the `reason`-field-specific error branch added in this pass.
   - **Updated test**: `"throws specific error when 'active' is missing or wrong type"`
     (rename + tighter regex matching the new error message).
   - **Updated test**: `"update succeeds even when historyLog.insert throws"` now
     asserts `recordSinkFailure({ subject: "redis-emergency-store", … })` instead
     of `console.error` spy. Validates the new structured-telemetry path.

### Determinism / coverage guarantees
- All pre-existing property tests still pass (kernel replay-determinism,
  basis-vocabulary-purity, untrusted-never-executes, audit-emission).
- All pre-existing chaos suites still pass (`chaos-kill-switch`, `chaos-replay`).
- Cross-runtime golden vectors still pass.
- `audit-postgres` integration test remains correctly skipped pending live DB.

### Removed
None. No flaky or redundant tests were identified in this pass.

---

## Findings investigated and DELIBERATELY not changed

Recorded so future maintainers don't re-litigate them:

1. **Kernel `_adjudicateImpl` triple-loop (state/auth/business)** —
   `packages/core/src/kernel/adjudicate.ts:221–306`. Three nearly-identical
   evaluation loops differing only in `policy.{stateGuards|authGuards|business}[]`
   and the phase label. Refactoring carries a real determinism risk
   (silent reorder, subtle short-circuit change) for a small cognitive-load
   reduction. The duplication is explicit-for-a-reason; the file's own JSDoc
   pins the evaluation order as load-bearing.

2. **`redis-emergency-store.ts` non-atomic `GET → decide → SET`** — file
   already documents this with an explicit `# Concurrency` heading
   (lines 37–44): "Last writer wins on the Redis state; both governance
   events are recorded (which is correct — both operators DID act).
   Acceptable for kill-switch semantics." Not a regression target.

3. **Module-level kill-switch state** —
   `packages/core/src/kernel/enforce-config.ts`. Read by the deterministic
   `adjudicate()` path. By design: a single in-process kill switch
   short-circuits all adjudication. Per-tenant overrides ride on
   `RuntimeContext.killSwitch`. The 0.5 ms window between operator-flip and
   in-flight adjudication seeing the new value is documented and acceptable.

4. **In-memory ledger "race"** — `packages/audit/src/ledger-memory.ts:14–35`.
   An earlier audit flagged the `has()` + `set()` pair as racy. It is not:
   no `await` separates them, so under Node.js's single-threaded event loop
   they execute atomically. The function is `async` only because the
   `Ledger` interface requires it (for Redis). No change.

5. **Best-effort `.catch(() => {})` cleanups in `defer-park.ts` /
   `defer-resume.ts`** — these are documented "best-effort housekeeping"
   paths. Wiring them to `recordSinkFailure` would add behavior that
   downstream tests and metrics consumers don't expect; the current
   silence is intentional. Logged here so future audits don't re-flag.

6. **Stale changesets** — `.changeset/v0.5-…`, `v0.6-…`, `v0.7-…` reference
   already-shipped versions. Removing them is destructive (could disrupt the
   next `changeset version` run) and they cost nothing to keep. Left alone.

7. **Loaded `loop.ts` in `adapter-core` (569 lines)** — the file is large but
   each section is single-purpose, well-commented, and exercised by the
   adapter-core + provider-adapter test suites. Splitting it would create
   import sprawl with no clarity gain.

---

## Remaining Risks

These are evidence-backed concerns the pass did NOT resolve. Each is sized to
the risk and to the cost of fixing.

### Low — `defer-resume.ts` cycle-counter TTL ordering

`packages/runtime/src/defer-resume.ts:240–245`. The `redis.incr(cycleKey)`
fires before `redis.expire(cycleKey, ...)`. If the process crashes between
INCR and EXPIRE, the counter has no TTL and grows until the surrounding
resume-token TTL covers it on next reach. Empirically harmless (the counter
is per-`intentHash`, bounded, and the rest of the resume flow stays correct),
but a future "atomic INCR+EXPIRE via Lua script" hardening would close the
window. **Not fixed**: requires careful Lua-script + tests + back-compat
for stores that don't support EVAL.

### Low — `persistent-buffered-sink.ts` storage-append silence

`packages/audit/src/persistent-buffered-sink.ts:124–150`. When the storage
adapter's `append` throws, the record is queued in memory and `onOverflow`
fires, but no `onSpill` signal communicates the durability degradation.
Adopters must instrument `onOverflow` carefully. Documented in the file's
own JSDoc; **not fixed** because changing the failure-signal shape is an
adopter-visible behavior change.

### Low — `admin-sdk` build-artifact freshness

Documented above (§Correctness Improvement 1). The fix is to always run
`pnpm -r build` before per-package `tsc --noEmit`. A `prebuild`
hook script that runs the cross-package build first could be added in a
later pass, but the added complexity vs the once-per-clone surface area is
unfavorable. **Not fixed**: prefer documentation over scripted ceremony.

---

## Verification

```bash
pnpm install --frozen-lockfile
pnpm -r build      # all workspace projects, all green
pnpm test          # 1111 passing, 1 skipped (audit-postgres live-DB), 0 failing
pnpm rc:audit      # pnpm audit --prod --audit-level high — clean
```

CI workflows (`.github/workflows/ci.yml`, `release-candidate.yml`,
`security-codescan.yml`, `smoke-test.yml`) are unchanged — no
configuration deltas required for this pass.

---

## Files Changed

```
 AI_CONTEXT.md                                      |  2 +-
 FINAL_RELIABILITY_AUDIT.md                         | (new)
 PROJECT_STATUS_AND_NEXT_STEPS.md                   |  5 ++-
 README.md                                          |  2 +-
 docs/ops/MAINTAINER_GUIDE.md                       |  6 +--
 docs/perf/v1-rc-baselines.md                       |  2 +-
 packages/audit-postgres/src/audit-store.ts         | 14 ++-----
 packages/audit-postgres/src/governance-events.ts   | 12 +-----
 packages/audit-postgres/src/pg-types.ts            | (new)
 packages/audit/src/distributed-kill-switch.ts      | 14 ++++---
 packages/audit/src/redis-emergency-store.ts        | 30 ++++++++++----
 packages/audit/tests/redis-emergency-store.test.ts | 47 +++++++++++++++++++---
```

No public API changes. No wire-format changes. No kernel-determinism changes.
No `@adjudicate/*` package exports added or removed. No new dependencies.
