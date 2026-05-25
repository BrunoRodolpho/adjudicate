# `@adjudicate/core` 1.1.0 — release plan + rollback notes

Bundled minor release with three additions, surfaced by the IbateXas adopter
during the audit-2026-05-24 closeout sweep. Two additions are purely
additive; the `SupersessionReason` union extension is **technically
breaking for consumers that pattern-match exhaustively** (see the
"Backwards-compatibility caveat" section below). The release ships under a
minor bump rather than 2.0.0 because the additive-union argument holds for
*non-exhaustive* consumers and the framework itself never `switch`es
exhaustively on the union — but exhaustive consumers must update at
upgrade time. No runtime schema migration.

---

## Summary of additions

### 1. `BASIS_CODES.kernel.KERNEL_INTENT_DISPATCHED = "intent_dispatched"`

New basis code in the `kernel` category. Adopters can now emit an
explicit "the kernel dispatched this intent" basis on audit records,
distinct from `GUARD_PANIC` (which signals a guard threw). The value is
the bare name `"intent_dispatched"` (matching every other BASIS_CODES
leaf — `GUARD_PANIC: "guard_panic"`, `ACTIVE: "active"`, etc.). The
category prefix is added automatically by downstream lookup-key
construction (`${category}:${code}` → `"kernel:intent_dispatched"`).

The pre-1.1.0 IbateXas consumer was hand-coding the literal
`"kernel.intent_dispatched"`; that drift is now closed by promoting the
code into the vocabulary AND correcting it to the bare-name convention.

Files: `packages/core/src/basis-codes.ts`,
`packages/core/src/explain.ts` (DEFAULT_EXPLANATION_REGISTRY entry for
`kernel:intent_dispatched` AND the previously-missing `kernel:guard_panic`).

### 2. `"lgpd_scrub"` added to `SupersessionReason` union

Per-surface LGPD/GDPR anonymization records can now link back to the
originating customer-anonymize envelope via
`supersedes.predecessorIntentHash` with a precise reason
(`"lgpd_scrub"`). Audit readers reconstruct the full scrub fan-out
(`OrderProjection`, `ConversationMessage`, `LoyaltyAccount`, etc.)
from a single root record. Surfaced by IbateXas H3 Wave A1, which had
been using `"replay"` as the closest fit in the closed union — semantically
lossy.

Workspace-internal cascade landed alongside the union extension so the
workspace remains buildable:

- `packages/core/src/explain.ts` — `DEFAULT_EXPLANATION_REGISTRY` gains
  `"supersedes:lgpd_scrub"` narration.
- `packages/audit/src/supersession-chain.ts` — `REASON_KEYS` and
  `emptyReasonCounts()` extended; chain reports now count `lgpd_scrub`
  occurrences.
- `packages/admin-sdk/src/schemas/audit.ts` — Zod
  `SupersessionReasonSchema` extended; preserves the
  `_recordCoreToSchema` build-time drift guard.
- `apps/console/src/components/decision/{LineageGraph,SupersessionChain}.tsx` —
  operator-console `REASON_LABEL` records extended for the lineage
  visualization.

### 3. `MetricsSink.recordShadowDivergence` relaxed to optional

Downstream consumers running always-on kernels (no shadow path) can
omit the method without keeping a no-op stub. The framework's internal
call sites in `setMetricsSink` (three branches of the shadow-telemetry
wiring) and `MetricsSinkSlot.recordShadowDivergence` (the slot wrapper)
now use `?.()` to dispatch safely under any sink shape.

Surfaced by the IbateXas post-cutover stale-machinery cleanup, which had
to retain `recordShadowDivergence: () => {}` purely to satisfy the
interface.

Files: `packages/core/src/kernel/metrics.ts`,
`packages/core/src/kernel/runtime-context.ts`.

---

## Backwards-compatibility guarantees

| Addition | Compat surface | Guarantee |
|---|---|---|
| `KERNEL_INTENT_DISPATCHED` basis code | `BASIS_CODES.kernel.GUARD_PANIC` still present | Strictly additive enum extension. |
| `"lgpd_scrub"` reason | Non-exhaustive consumers still type-check | Additive union extension — **breaking** for exhaustive consumers (see caveat below). |
| Optional `recordShadowDivergence` | Existing implementations that DEFINE the method still work | Strict relaxation: required → optional. Note: omitted methods now silently no-op for shadow telemetry; `setMetricsSink` emits a one-time `console.warn` at install time when the method is absent so the silent-drop is operator-visible. |

Type-level guarantees:

- The narrowing direction (`AuditRecord` → schema in admin-sdk) is the
  one-directional drift guard. It continues to hold post-cascade.
- The slot interface (`MetricsSinkSlot`) keeps `recordShadowDivergence`
  required — only the underlying sink relaxes. Every framework caller
  goes through the slot, so call sites outside the framework see the
  same stable surface.

### Backwards-compatibility caveat — `SupersessionReason` union extension

Adding a literal to a TypeScript string-literal union is technically
breaking for consumers that pattern-match exhaustively. Concrete
breakages observed in this very PR's own console package
(`apps/console/src/components/decision/{LineageGraph,SupersessionChain}.tsx`)
pre-extension, which had to be updated:

```ts
// BEFORE — compiles against 1.0.x, fails to compile against 1.1.0:
const REASON_LABEL: Record<Supersession["reason"], string> = {
  confirmation_resolved: "Confirmed",
  defer_resumed:         "Resumed",
  rewrite_executed:      "Rewritten",
  replay:                "Replayed",
};

// AFTER — compiles against 1.1.0:
const REASON_LABEL: Record<Supersession["reason"], string> = {
  confirmation_resolved: "Confirmed",
  defer_resumed:         "Resumed",
  rewrite_executed:      "Rewritten",
  replay:                "Replayed",
  lgpd_scrub:            "LGPD scrubbed",
};
```

Similar breakage shape for `switch (r.reason) { ...; default: assertNever(r.reason); }`
exhaustive switches — adding a `case "lgpd_scrub":` is required.

**Codemod for consumers** (paste into a fresh PR):

```bash
# Find every Record<SupersessionReason, X> and exhaustive switch in your codebase:
rg -l 'Record<SupersessionReason' your-repo/src
rg -l 'assertNever.*\.reason' your-repo/src

# For each match, add an `lgpd_scrub` branch carrying the locale-appropriate label
# or handler. For the Zod side (admin-sdk consumers), the SupersessionReasonSchema
# enum in `@adjudicate/admin-sdk@1.1.0` already includes `"lgpd_scrub"` — upgrade
# both packages in lockstep.
```

The framework itself does NOT pattern-match exhaustively on
`SupersessionReason` (verified across `@adjudicate/core`,
`@adjudicate/audit`, `@adjudicate/admin-sdk`) — exhaustiveness is a
consumer concern only. We chose minor-bump over major-bump because the
additive-union argument holds for the (much more common) non-exhaustive
case; the breakage is *purely* in exhaustive type-level pattern-matching
with no runtime impact. Consumers who prefer major-bump semantics can
treat this entry as the migration note and version-gate their upgrade
accordingly.

---

## Downstream impact

**Known consumer:** IbateXas (the platform's primary adopter). Verified
against the IbateXas codebase post-`@adjudicate/core` 1.1.0 install:

1. **`@adjudicate/core` peer-dep pin.** IbateXas pins
   `@adjudicate/core ^1.0.0` across 11 workspace packages. The caret
   range auto-picks `1.1.0` on the next `pnpm install` — no
   `package.json` edit required pre-publish.

2. **`SupersessionReason` swap site** —
   `packages/domain/src/services/customer.service.ts`
   `emitScrubAuditRecords()` currently emits `reason: "replay"` as the
   closest semantic fit in the previous closed union. Post-1.1.0 the
   consumer can swap to `reason: "lgpd_scrub"`. Single one-line edit;
   companion update in
   `packages/domain/src/services/__tests__/anonymize-customer.test.ts`
   (one `expect(...).toBe("replay")` → `"lgpd_scrub"`).

3. **`KERNEL_INTENT_DISPATCHED` adopters** — zero source-side literal
   `"kernel.intent_dispatched"` references in IbateXas today (the
   pre-cutover hand-coding was already removed). The consumer opts in
   to the new basis code at its convenience by importing
   `BASIS_CODES.kernel.KERNEL_INTENT_DISPATCHED`; no forced migration,
   no string-literal coupling.

4. **MetricsSink stub removal** — IbateXas's audit-postgres metrics
   sink at `apps/api/src/plugins/kernel-metrics-sink.ts` retains
   `recordShadowDivergence: () => {}` purely to satisfy the interface.
   Post-1.1.0 the stub can be dropped.

No other downstream repos are known to consume `@adjudicate/core` at
this writing.

---

## Manual release steps (USER-GATED — do NOT execute from this branch)

**Pre-publish gate:** review this PR's commits and merge to `main`.

`@adjudicate/audit` and `@adjudicate/admin-sdk` ALSO ship 1.1.0 in this
release — their source changed to add `lgpd_scrub` (audit: `REASON_KEYS`,
`emptyReasonCounts()`; admin-sdk: `SupersessionReasonSchema` enum), and
the version bumps are required so consumers pinning `^1.0.0` actually
receive the new behavior. Publishing only `@adjudicate/core@1.1.0` (without
bumping the siblings) would leave pinned consumers with audit@1.0.1 that
yields `NaN` in `reasonCounts` and admin-sdk@1.0.0 that rejects the new
enum value with a Zod validation error — the review explicitly flagged
this hazard.

1. **`pnpm -F @adjudicate/core publish`** — publishes
   `@adjudicate/core@1.1.0` to npm. One-way; cannot be unpublished after 24h.
2. **`pnpm -F @adjudicate/audit publish`** — publishes
   `@adjudicate/audit@1.1.0` to npm. Required for `lgpd_scrub`
   reason-count support.
3. **`pnpm -F @adjudicate/admin-sdk publish`** — publishes
   `@adjudicate/admin-sdk@1.1.0` to npm. Required for `lgpd_scrub`
   Zod-schema acceptance.
4. **`git tag v1.1.0 && git push --tags`** — first published-version git
   tag for the `@adjudicate/*` 1.1.0 line. Establishes the convention
   going forward.
5. **(In IbateXas) `pnpm install` at workspace root** — picks up `1.1.0`
   across `@adjudicate/core`, `@adjudicate/audit`, and
   `@adjudicate/admin-sdk` via the existing `^1.0.0` caret pins.
6. **(In IbateXas) one-line swap** — change `reason: "replay"` to
   `reason: "lgpd_scrub"` in
   `packages/domain/src/services/customer.service.ts`
   `emitScrubAuditRecords()`, plus the companion assertion in
   `anonymize-customer.test.ts`. Tracked as ibatexas commit I12 per the
   fix plan.

---

## Rollback notes

- **`pnpm publish` is one-way.** Once `1.1.0` is on npm, downstream
  consumers can install it via their existing caret ranges. Rolling back
  the publish itself requires `npm deprecate` (does not remove the
  package from the registry; signals adopters to pin lower) or — within
  the 24h unpublish window — `npm unpublish`. After 24h, neither is
  available; the only path is publishing a `1.1.1` patch that reverts
  the additions, which is a clumsy maneuver given they're additive.
- **No code rollback needed in the sibling repo.** All three additions
  are additive at the type level; reverting the source-side commits is
  trivial (`git revert`) and produces no semantic conflict with any
  shipped consumer.
- **Adopters who upgraded.** Users who installed `1.1.0` and adopted the
  new symbols would need to manually downgrade their pin
  (`pnpm add @adjudicate/core@1.0.0`) and revert any code that
  references `lgpd_scrub` / `KERNEL_INTENT_DISPATCHED` /
  optional-shaped MetricsSink. In practice none of these are required;
  the additions are opt-in.
- **No data-shape concerns.** No audit-record schema migration, no
  database column change, no envelope-version bump. Replay across the
  1.0.0 → 1.1.0 boundary is safe by construction.

---

## Verification (sibling-side, this branch)

`pnpm test` across the workspace: 1122 / 1122 tests pass (plus 1
testcontainer-gated skip in `@adjudicate/audit-postgres`). Per-package
totals:

| Package | Tests |
|---|---|
| `@adjudicate/core` | 377 / 377 |
| `@adjudicate/audit` | 181 / 181 |
| `@adjudicate/admin-sdk` | 70 / 70 |
| `@adjudicate/conformance` | 57 / 57 |
| `@adjudicate/observability` | 20 / 20 |
| `@adjudicate/audit-postgres` | 65 / 65 (+1 testcontainer-gated skip) |
| `@adjudicate/cli` | 100 / 100 |
| `@adjudicate/anthropic` | 19 / 19 |
| `@adjudicate/openai` | 12 / 12 |
| `@adjudicate/runtime` | 44 / 44 |
| `@adjudicate/pack-payments-pix` | 29 / 29 |
| `@adjudicate/pack-identity-kyc` | 15 / 15 |
| `@adjudicate/pack-deployments-approval` | 12 / 12 |
| `@adjudicate/primitives` | 28 / 28 |
| `@adjudicate/analyze` | 24 / 24 |
| `@adjudicate/adapter-core` | 36 / 36 |
| `@adjudicate/locales-pt-BR` | 4 / 4 |
| `@adjudicate/migrate` | 10 / 10 |
| `bench` | 4 / 4 |
| `examples/commerce-reference` | 9 / 9 |
| `examples/vacation-approval` | 6 / 6 |

`pnpm -r build`: clean across all workspace packages (`@adjudicate/*`
plus `apps/web` + `apps/console` Next.js builds).

Conformance suites of interest:

- **`@adjudicate/core` `basis-vocabulary-purity`** property test
  (3 cases, 2606ms) — auto-iterates `BASIS_CODES` so the new
  `kernel.intent_dispatched` entry is included; passes.
- **`@adjudicate/audit` `supersession-chain`** — exercises
  `aggregateReasonCounts` and `REASON_KEYS`; passes against the
  extended union.
- **`@adjudicate/admin-sdk` `schemas-roundtrip`** + the
  `_recordCoreToSchema` build-time drift guard — passes; admin-sdk's
  Zod wire shape stays in lockstep with `@adjudicate/core`.
