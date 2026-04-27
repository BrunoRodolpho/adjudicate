# @adjudicate/core

The framework's load-bearing primitives — types, lattice algebra, the
deterministic kernel, and the LLM-side capability/tool surface, all in one
package with subpath-export-based separation.

## Imports

```ts
// Headline surface — types you'll use everywhere
import {
  buildEnvelope,
  type IntentEnvelope,
  type Decision,
  type Refusal,
  type AuditRecord,
} from "@adjudicate/core";

// Kernel — the deterministic adjudicator + policy contracts
import {
  adjudicate,
  type PolicyBundle,
  type Guard,
  allOf,
  firstMatch,
} from "@adjudicate/core/kernel";

// LLM-side — what the model can see and how the prompt is rendered
import {
  type CapabilityPlanner,
  type ToolClassification,
  filterReadOnly,
} from "@adjudicate/core/llm";
```

## What lives here

**Top-level (`@adjudicate/core`)**
- `IntentEnvelope<K, P>` — the canonical mutation proposal with versioned
  schema, content-addressed `intentHash`, taint provenance.
- `Decision` — the 6-valued kernel output:
  `EXECUTE | REFUSE | ESCALATE | REQUEST_CONFIRMATION | DEFER | REWRITE`.
- `Refusal` — stratified user-facing message
  (`SECURITY | BUSINESS_RULE | AUTH | STATE`).
- `AuditRecord` — durable governance trail entry (v2 carries an optional
  `plan` snapshot of the planner's `(visibleReadTools, allowedIntents)` at
  decision time, plus a `planFingerprint` for cross-correlation).
- `BASIS_CODES` — vocabulary-controlled decision basis codes (with
  `kill.ACTIVE` and `deadline.EXCEEDED` for kill-switch and deadline paths).
- `Taint` lattice — `SYSTEM > TRUSTED > UNTRUSTED` with `mergeTaint` /
  `canPropose` / field-level `TaintedValue<T>`.
- `buildEnvelope`, `buildAuditRecord`, `replayEnvelopeFromAudit`,
  `sha256Canonical`, `canonicalJson`.
- `installPack(pack, options?)` — opinionated bootstrap: validates Pack
  conformance, wraps the policy with refusal-code drift detection, and
  installs default console sinks for metrics + learning if none are set.
- `assertPackConformance`, `withBasisAudit`, `KERNEL_REFUSAL_CODES` —
  Pack-shape validators and the runtime decorator that observes
  refusal-code drift via `recordSinkFailure({ errorClass: "basis_code_drift" })`.

**`@adjudicate/core/kernel`**
- `adjudicate(envelope, state, policy) → Decision` — pure deterministic.
  Use for replay, property tests, and unit tests. Production paths use
  the audit-emitting sibling below.
- `adjudicateAndAudit(envelope, state, policy, { sink, ledger?, ... })`
  → `Promise<{ decision, record, ledgerHit }>` — async wrapper that
  consults the optional Execution Ledger (short-circuits to a
  `ledger_replay_suppressed` REFUSE on hit), runs the pure kernel,
  records metrics + learning, builds the `AuditRecord`, and emits it.
  Recommended production entry point. Sink failures propagate; learning-
  sink failures are absorbed. See [ADR-101](../../docs/architecture/adr/ADR-101-kernel-audit-emission.md).
- `adjudicateWithDeadline(envelope, state, policy, { deadlineMs })` —
  wall-clock budget; returns `kernel_deadline_exceeded` SECURITY refusal
  when the timer fires first.
- `adjudicateAndLearn(envelope, state, policy)` — sibling wrapper that
  emits a `LearningEvent` after the Decision. `adjudicate()` stays pure.
- `PolicyBundle<K, P, S>`, `Guard<K, P, S>`, combinators (`allOf`,
  `firstMatch`, `constant`).
- Shadow-mode infrastructure (`adjudicateWithShadow`, divergence
  classification) for staged rollout from a legacy decision path.
- `MetricsSink` contract + recorders for ledger / decisions / refusals /
  sink failures / resource limits, plus `LearningSink` for analytics
  fan-out.
- `createRateLimitGuard` + `RateLimitStore` + `createInMemoryRateLimitStore`
  — synchronous Guard factory paired with an async I/O-friendly store.
- `setKillSwitch(active, reason)` / `isKilled()` — runtime authority
  revocation; engages BEFORE the schema-version gate.
- Per-intent enforcement config (`IBX_KERNEL_SHADOW`, `IBX_KERNEL_ENFORCE`,
  `IBX_KILL_SWITCH`) for the 4-stage runbook.

**`@adjudicate/core/llm`**
- `CapabilityPlanner<S, C>` — security-sensitive surface that decides
  which tools the LLM may see this turn. The planner makes the
  capability decision; the renderer is cosmetic.
- `PromptRenderer<S, C>` — consumes a `Plan` and produces text + tool
  schemas + max-tokens. No capability decisions.
- `ToolClassification` + `filterReadOnly` — type-level READ vs MUTATING
  separation that structurally hides mutating tools from the LLM.
- `safePlan(planner, classification)` + `assertPlanReadOnly` — runtime
  guard that throws `PlanConformanceError` if a Plan exposes a MUTATING
  tool. Wrap every Pack's planner in `safePlan(...)` to fail loud
  before the LLM sees a leaked tool.

## Load-bearing invariants

Verified by property tests in [`tests/kernel/invariants/`](./tests/kernel/invariants/):

- **Taint monotonicity** — `mergeTaint` never raises trust.
- **Hash determinism** — same envelope produces the same `intentHash`
  regardless of payload key order.
- **Schema version gate** — envelopes with unknown `version` are never
  executable (refused with a structured `SECURITY` refusal).
- **Basis vocabulary purity** — every `basis.code` is in
  `BASIS_CODES[category]`. No free-form strings.
- **UNTRUSTED never executes when policy demands TRUSTED+** — the kernel
  contract that makes the rest of the framework safe.

## REWRITE scope — bounded by design

`REWRITE { rewritten, reason, basis }` is the kernel's way of saying
"the proposed envelope was unsafe as-is but I substituted a safe
equivalent." It is **restricted** to three categories — never business
transformation:

| Allowed | Forbidden |
|---|---|
| **Sanitization** — redact UNTRUSTED content from a TRUSTED-required field | "user asked for card, default to PIX" |
| **Normalization** — unicode NFC, whitespace collapse, homoglyph mapping | "quantity 5 is unusual, make it 1" |
| **Safe mechanical capping** — `quantity > catalog_max → clamp` | anything the user could not anticipate |

Anything that changes the user's intended outcome must be `REFUSE` or
`REQUEST_CONFIRMATION`.

## Retries and idempotency (T8 — envelope v2)

`intentHash` is content-addressed over `(version, kind, payload, nonce,
actor, taint)`. The Execution Ledger uses it as the dedup key — duplicate
webhook deliveries that produce byte-identical envelopes fold into a
single execution.

**`nonce` is the load-bearing idempotency key.** First attempts pass
`crypto.randomUUID()`. Retries pass the SAME `nonce` as the original
attempt. `createdAt` is descriptive metadata only — varying it across
retries does NOT change the hash. This separation is the v2 fix for
the pre-T8 foot-gun where adopters retrying without preserving
`createdAt` silently broke dedup.

```ts
// First attempt
const original = buildEnvelope({
  kind, payload, actor, taint,
  nonce: crypto.randomUUID(),
});
await durableStore.saveNonce(original.nonce); // persist the nonce

// Retry — fetch the persisted nonce
const nonce = await durableStore.getNonce();
const replayed = buildEnvelope({
  kind, payload, actor, taint,
  nonce, // <-- the load-bearing line
});
// replayed.intentHash === original.intentHash regardless of createdAt
```

Or replay from a stored AuditRecord — `replayEnvelopeFromAudit` preserves
the nonce automatically:

```ts
import { replayEnvelopeFromAudit } from "@adjudicate/core";
const env = replayEnvelopeFromAudit(storedRecord);
// env.intentHash matches storedRecord.intentHash exactly.
```

**v1 envelopes are REFUSEd** at the schema-version gate with code
`schema_version_unsupported`. Pre-T8 audit rows in Postgres replay via
`legacyV1ToV2(row)` from `@adjudicate/audit-postgres`, which synthesizes
a v2 envelope from the historical `createdAt`.

## Further reading

- [`docs/taint.md`](./docs/taint.md) — payload-level + field-level taint
- [`docs/basis-codes.md`](./docs/basis-codes.md) — vocabulary governance + module augmentation
- [`examples/decision-algebra.ts`](./examples/decision-algebra.ts) — all 6 Decision kinds with real payloads
