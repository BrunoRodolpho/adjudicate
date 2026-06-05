# Maintenance Sweep Report V2 — 2026-05-21

> **Historical record — point-in-time snapshot (2026-05-21).** This is an
> archived audit report, not a description of current repo state; counts,
> file paths, and findings reflect the repo as of that date. See `README.md`
> for current status.
>
> Second engineering-quality pass on the post-v1 governance-frozen repo.
> Builds on [`FINAL_RELIABILITY_AUDIT.md`](./FINAL_RELIABILITY_AUDIT.md).
> All work is **additive** or **diagnostic-only** — no architectural,
> public-API, wire-format, or replay-semantic changes.

## Baseline vs end-of-sweep

| Metric | Pass-1 end | Pass-2 end | Delta |
|---|---|---|---|
| Tests passing | 1111 | **1121** | +10 (direct unit tests for `normalizeTimestamptz`) |
| Tests skipped | 1 (live DB) | 1 (live DB) | unchanged |
| Tests failing | 0 | 0 | unchanged |
| `pnpm audit --prod --audit-level high` | **15 vulns** (7 high, 6 moderate, 2 low) | **2 moderate** (no high) | 13 vulns cleared, 7 high cleared |
| Duplicated `asMessage()` helpers in CLI | 5 functions + 4 inline copies | 1 shared `errorMessage` import | -8 sites |
| Workspace builds (`pnpm -r build`) | clean | clean | unchanged |
| Maintainer-guide build instruction | omitted `pnpm build` step | explicit `pnpm install && pnpm build && pnpm test` | corrected |

---

## Correctness Hardening

This sweep did NOT find new behavioral bugs. The earlier pass had already
caught the visible incorrect-behavior surfaces (silent error swallowing,
field-ambiguous error messages, stale build artifacts). The remaining
issues surfaced by the static-analysis sub-agent fell into two buckets:

1. **Documented-tradeoff non-issues** — e.g. `_shadow!.wildcard` /
   `_enforce!.wildcard` non-null assertions in `enforce-config.ts`. These
   are guarded by `ensureLoaded()` immediately above each assertion. The
   asserted post-condition is provably correct given `parseList()`'s total
   return contract. Replacing with a defensive runtime check would
   contradict the repo's "trust internal guarantees" principle.

2. **Intentional fail-silent paths** — `.catch(() => {})` on best-effort
   cleanup in `defer-park.ts`, `defer-resume.ts`, `rate-limit.ts`. These
   are documented in those files with the "best-effort" comment and the
   rationale that telemetry must not block the hot path. The previous
   pass already added a similar telemetry hook to `redis-emergency-store`
   where the trade-off favored observability; the defer-quota and
   rate-limit paths have different semantics (rollback is fire-and-forget
   by design) and were left alone.

These are now recorded in §Intentional Non-Changes below so future
audits don't re-litigate them.

---

## Diagnostic Improvements

### New direct test coverage for `normalizeTimestamptz`

`packages/audit-postgres/tests/pg-types.test.ts` (new — 10 tests)

The pass-1 helper now has direct contract tests:

- Happy paths: ISO-8601 string passthrough, `Date` coercion, tolerance
  for Postgres wire-format strings (space separator).
- Diagnostic-error paths: `undefined`, `null`, `number` (epoch-ms drift
  trap), object-shaped pg-driver output.
- The `column` parameter surfaces in the error message verbatim.
- The bounded-sample heuristic (≤ 80 chars) is exercised for both
  oversized strings inside objects AND `JSON.stringify` failures from
  circular references — the helper's `<unserializable>` fallback works.

The earlier indirect coverage (through `audit-store.test.ts` and
`governance-log.test.ts`) only exercised happy paths. The new tests lock
in the diagnostic surface so a future "simplification" of the helper
can't quietly weaken the operator-facing error contract.

### Maintainer-guide local-vs-CI alignment

`docs/ops/MAINTAINER_GUIDE.md` §2 step 3 — the local install instruction
now explicitly says `pnpm install --frozen-lockfile && pnpm build &&
pnpm test`, with a one-paragraph explanation of why `pnpm build` is
required (per-package `tsc --noEmit` consumes upstream `dist` `.d.ts`
files). This is the stale-artifact land-mine documented in
`FINAL_RELIABILITY_AUDIT.md` §Correctness Improvement 1 — the V1 report
called for "documentation over scripted ceremony" and this is that
documentation.

---

## Duplication Reduction

### CLI `asMessage` consolidation

Five separate `asMessage(e: unknown): string` helpers — each with the
identical body `e instanceof Error ? e.message : String(e)` — had grown
across `packages/cli/src/commands/`. Plus four inline copies of the same
expression. The next CLI author would have made it six.

| Before | After |
|---|---|
| 5 named functions across 5 files | 1 `errorMessage` import |
| 4 inline copies across 2 files | (same import) |
| Total: 9 duplicates | 1 source |

**Files affected:**
- New: `packages/cli/src/lib/error-message.ts` (24 lines incl. JSDoc)
- Modified: `commands/export.ts`, `commands/repl.ts`, `commands/replay.ts`,
  `commands/visualize.ts`, `commands/scenarios-generate.ts`, `commands/reap.ts`

**Why this matters:** Future CLI commands will import the helper instead
of pasting a sixth copy. The helper is CLI-internal (not exported from the
package) so it does NOT widen the public API.

**Scope discipline:** The same `instanceof Error ? .message : String(...)`
pattern occurs sporadically in `packages/audit/src/distributed-kill-switch.ts`
and `redis-emergency-store.ts`. Those packages have different conventions
(structured `recordSinkFailure` emissions) and only 1–2 occurrences each.
Adding an `errorMessage` helper there would be over-abstraction. Left
alone.

---

## Operational Improvements

### Dependency security: Next.js 15.5.15 → 15.5.18 (apps/console, apps/web)

The locked version of Next.js was one patch short of the security-patched
range for **seven HIGH-severity advisories** affecting both reference
apps (`apps/console` operator UI, `apps/web` marketing playground):

1. **DoS** in Server Components (fixed `>=15.5.16`)
2. **Middleware/Proxy bypass** via segment-prefetch routes — App Router
3. **DoS** via Cache Components connection exhaustion
4. **SSRF** in WebSocket upgrades
5. **Middleware bypass** via dynamic route parameter injection
6. **Middleware/Proxy bypass** in App Router segment-prefetch (follow-up)
7. **Middleware bypass** in Pages Router applications using i18n

These were resolved by a targeted `pnpm update --recursive next` that
shifted both `apps/console/package.json` and `apps/web/package.json`
declarations from `^15.0.3` to `^15.5.18` (tighter floor) and the
lockfile entry from `next@15.5.15` to `next@15.5.18`. No other transitive
dependencies needed to update.

The two **moderate** vulnerabilities that remain are accepted:

| Package | Path | Reason left alone |
|---|---|---|
| `postcss` (XSS via unescaped `</style>`) | `apps__console>next>postcss` | Transitive of Next.js. Pinning would require a `pnpm.overrides` block, and the next Next.js patch will bump it cleanly. |
| `brace-expansion` (large numeric range DoS) | `packages__eslint-config>eslint-plugin-…` | Dev-only — not in the `--prod` audit gate. CI tolerates moderate without `continue-on-error`. |

The CI gate (`pnpm audit --prod --audit-level high` with
`continue-on-error: true` in `.github/workflows/ci.yml:48–49`) now passes
cleanly without relying on the soft-fail.

### Test verification

After the lockfile update, the full test suite still passes (1121
passing, 1 skipped). No Next.js-specific behavior change affected the
adjudicate framework itself — the apps are reference UIs and the test
suite covers framework packages.

---

## Test Improvements

### New tests added (10)

`packages/audit-postgres/tests/pg-types.test.ts`:

1. ISO-8601 string passthrough
2. `Date` → ISO-8601 string coercion
3. Postgres wire-format string tolerance (space separator)
4. `undefined` rejection with typed diagnostic
5. `number` rejection with sample value (catches epoch-ms misuse)
6. `null` rejection with literal `"null"` (catches null-handling bug
   where `typeof null === "object"` would have masked it)
7. Column name surfaces in error message
8. Oversized-sample truncation to 80 chars
9. Object samples serialized via `JSON.stringify` with column name
10. Circular-reference object → `<unserializable>` fallback (verifies
    no secondary crash inside the diagnostic path)

### Signal-density audit (no removals)

A test-suite audit was performed for:
- Duplicated tests (e.g., same property exercised twice)
- Implementation-detail assertions (snapshot of internal field that
  isn't part of the contract)
- Brittle timing assumptions (`setTimeout`-anchored expectations)
- Over-mocked behavior (testing the mock, not the code)

**Result:** No removals warranted. The test suite is already
high-signal:
- The chaos suites (`chaos-kill-switch.test.ts`, `chaos-replay.test.ts`)
  use long timeouts (200–500ms) but the assertions are state-based, not
  time-based.
- Property tests use stable seeds and run 5,000+ iterations — the
  flakiness risk is mathematical, not timer-based.
- Mocks (e.g., `fakeRedis`, `createMockHistoryLog`) are minimal — they
  hold state, they don't impersonate behavior.

---

## Maintenance Cost Reduction

| Win | Mechanism | Future-maintainer impact |
|---|---|---|
| Stop adding new `asMessage` helpers | One CLI-internal import | Sixth CLI command author writes `import { errorMessage }` instead of pasting |
| Catch a Next.js downgrade attempt | Version floor bumped to `^15.5.18` | A maintainer who edits the floor down sees the audit gate fail |
| Don't repeat the stale-artifact diagnosis | Maintainer-guide §2 step 3 spells out the build step + why | New maintainers don't waste hours on phantom `TS2322` errors |
| Lock in the `normalizeTimestamptz` contract | 10 direct unit tests | A future "simplification" can't silently weaken operator diagnostics |

Net source-file change: -8 CLI duplicate sites, +1 new helper file (24
lines), +1 new test file (74 lines), -2 inline patterns. Net code reduced
in terms of behavior surface; net coverage increased.

---

## Intentional Non-Changes

Recorded so the third audit doesn't re-investigate these:

1. **`policy.ts` `as unknown as Record<symbol, unknown>` casts** — two
   occurrences (lines 184, 226) for symbol-keyed metadata slot access on
   functions. TypeScript fundamentally requires the cast through
   `unknown` for symbol-property access on `Function`-typed values. A
   helper would localize the cast in one place but at the cost of two
   extra lines + a function call boundary for hot-path code. Two
   occurrences in the same file is not strong duplication signal — left
   alone.

2. **`_shadow!` / `_enforce!` non-null assertions in
   `enforce-config.ts:53,59`** — guarded by the immediately-preceding
   `ensureLoaded()`, whose total contract guarantees both globals are
   non-null. Replacing with `if (_shadow === null) throw new Error(...)`
   would be defensive programming for an impossible case.

3. **`.catch(() => {})` in `defer-park.ts`, `defer-resume.ts`,
   `rate-limit.ts`, `guard-stats.ts`** — these are documented best-effort
   housekeeping operations:
   - Cycle-counter TTL extension after INCR — counter still bounded by
     surrounding token TTL.
   - Parked-envelope `del` after resume — re-entry detection still works
     via the explicit "duplicate_resume_suppressed" branch.
   - Rate-limit decrement rollback — failing rollback leaves a slightly
     elevated counter for the rest of the window; not a correctness
     issue, just slight rate-limit drift.
   - Guard-stats writes — pure observability, not a load-bearing path.

   Surfacing these through `recordSinkFailure` would add behavior that
   downstream telemetry consumers don't expect. Different from the
   `redis-emergency-store.update()` case (pass 1) which had a real
   adopter-visible failure mode hidden inside `console.error`.

4. **PostCSS XSS via unescaped `</style>` in CSS Stringify** —
   transitive of Next.js. The next Next.js patch will bring this in. A
   `pnpm.overrides` block could pin it now but creates a long-term
   override drift risk. Wait for upstream.

5. **`brace-expansion` moderate vuln in eslint plugin** — dev-only,
   not in `--prod` audit gate, not a runtime exposure.

6. **`@xstate/react 4.1.3` peer-dep warning** (`expects React 16-18,
   got 19`) — apps/console only. xstate/react v5 is the next major and
   pulls in API changes; updating belongs in a planned app refresh, not a
   maintenance sweep.

7. **`cyclic workspace dependencies`** warning surfaced by `pnpm` for
   `packages/analyze ↔ packages/pack-payments-pix ↔ packages/cli` —
   pre-existing, documented behavior (analyze's test-fixture imports cycle
   through the Pack, which the CLI also loads). Pnpm handles it via
   `topological-deps` resolution. No cycle-breaking refactor warranted.

8. **Stale changesets** (`.changeset/v0.5-…`, `v0.6-…`, `v0.7-…`) — see
   `FINAL_RELIABILITY_AUDIT.md` §Findings investigated 6. Removing them
   risks breaking the next `changeset version` run; the cost of keeping
   them is zero.

---

## Remaining Risks

These are evidence-backed concerns this sweep did NOT resolve. Each is
sized.

### LOW — `defer-resume.ts:240–245` cycle-counter TTL ordering

(Carried over from `FINAL_RELIABILITY_AUDIT.md`.) `incr` fires before
`expire`; if the process crashes between them, the counter has no TTL
until next resume covers it. Empirically harmless — counter is per-
`intentHash`, bounded by the surrounding token TTL. Atomic-via-Lua fix
deferred — the back-compat surface for stores without `EVAL` is the
blocker.

### LOW — `persistent-buffered-sink.ts:124–150` storage-append silence

(Carried over.) Storage append errors fire `onOverflow` but no
`onSpill`. Adopters must instrument `onOverflow` carefully. Changing the
signal shape would be adopter-visible.

### LOW — PostCSS transitive vuln pending next Next.js patch

`apps__console>next>postcss` — XSS via unescaped `</style>` in `Stringify
Output` (moderate). Patched at `postcss >= 8.5.10`, currently resolved at
older version via Next.js's own `postcss` dependency. Will clear on the
next Next.js minor/patch that bumps its own postcss pin. Not in `--prod
--audit-level high`; tolerable.

### LOW — `@xstate/react` peer-dependency mismatch in `apps/console`

`@xstate/react@4.1.3` declares React 16/17/18 as peer; the workspace
uses React 19. No runtime breakage observed (the API surface used by the
console is stable across React versions). Tracks an upstream
`@xstate/react` v5 release.

---

## Verification

```bash
pnpm install --frozen-lockfile
pnpm -r build      # all 23 workspace projects clean
pnpm test          # 1121 passing, 1 skipped, 0 failing
pnpm rc:audit      # 0 high, 2 moderate (postcss transitive, brace-expansion dev-only)
```

CI workflows (`.github/workflows/ci.yml`, `release-candidate.yml`,
`security-codescan.yml`) are unchanged. The audit-level high gate is
now genuinely clean instead of silently relying on `continue-on-error`.

---

## Files Changed (this sweep)

```
 AI_CONTEXT.md                                      |  2 +-
 MAINTENANCE_SWEEP_REPORT_V2.md                     | (new)
 PROJECT_STATUS_AND_NEXT_STEPS.md                   |  7 +-
 README.md                                          |  2 +-
 apps/console/package.json                          |  2 +-
 apps/web/package.json                              |  2 +-
 docs/ops/MAINTAINER_GUIDE.md                       | 13 ++++-
 docs/perf/v1-rc-baselines.md                       |  2 +-
 packages/audit-postgres/tests/pg-types.test.ts     | (new — 10 tests)
 packages/cli/src/commands/export.ts                | 11 +---
 packages/cli/src/commands/reap.ts                  |  7 +--
 packages/cli/src/commands/repl.ts                  | 13 +++--
 packages/cli/src/commands/replay.ts                | 14 +++---
 packages/cli/src/commands/scenarios-generate.ts    |  6 +--
 packages/cli/src/commands/visualize.ts             |  6 +--
 packages/cli/src/lib/error-message.ts              | (new — 17 lines)
 pnpm-lock.yaml                                     | 86 +++++++++++-----------
```

No public API additions. No wire-format changes. No kernel-determinism
changes. No `@adjudicate/*` package exports added or removed.

The only `package.json` declaration changes are `next` floor bumps on
`apps/console` and `apps/web` — both reference apps, not framework
packages. The `pnpm-lock.yaml` diff is entirely version-string updates
for `next` and its narrow transitive set (43 lines in, 43 lines out, no
package additions).
