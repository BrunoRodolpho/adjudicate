# ADR-103 — RuntimeContext for per-tenant isolation

**Status:** Accepted, 2026-04-27.
**Phase:** Phase 1 — assurance hardening.

## Context

Several kernel-side primitives are stored as module-level singletons:

- the kill switch state (`enforce-config.ts`)
- the MetricsSink slot (`metrics.ts`)
- the LearningSink slot (`learning.ts`)
- the ShadowTelemetrySink slot (`shadow.ts`)
- the IBX_KERNEL_SHADOW / IBX_KERNEL_ENFORCE parse memos (`enforce-config.ts`)

For single-tenant deployments this is fine. The architectural assurance
audit flagged two specific failure modes once the framework hosts more
than one tenant per process:

1. **Cross-tenant authority revocation.** Flipping the kill switch to halt
   tenant A's traffic also halts tenant B's. There is no way to scope the
   override.
2. **Cross-tenant telemetry leak.** Tenant A's metrics sink receives
   tenant B's `recordDecision` events because both call paths share the
   same module slot.

A subtler third failure surfaced under operator review: the kill-switch
env-seed (`IBX_KILL_SWITCH`) is read on first call. After any manual
`setKillSwitch()`, env changes are ignored until process restart — the
operator's incident-response toolkit depends on env vars, but the
"manual takes precedence" rule blocks that path.

## Decision

Introduce **`RuntimeContext`** as a per-tenant container holding the five
mutable slots. The `createRuntimeContext(options?)` factory mints a fresh
container; `getDefaultRuntimeContext()` returns a process-wide singleton
that the existing module-level functions operate on. Back-compat is total.

```ts
const tenantA = createRuntimeContext({ id: "tenant-a", killSwitchEnvVar: "KILL_A" });
const tenantB = createRuntimeContext({ id: "tenant-b", killSwitchEnvVar: "KILL_B" });
tenantA.killSwitch.set(true, "incident");
// tenantB.killSwitch.isKilled() === false
```

`adjudicateAndAudit` accepts an optional `context` parameter; when
supplied, metrics + learning + ledger-op events route through the
context's slots, and the tenant kill switch is consulted ahead of the
kernel kill-switch. When omitted, behaviour is identical to before T6.

### Why not refactor the module-level functions to delegate

The plan's preferred shape was: module-level functions delegate to
`getDefaultRuntimeContext()`. Doing this requires touching every internal
state initialisation in metrics.ts / learning.ts / shadow.ts /
enforce-config.ts. The refactor is purely cosmetic — the user-facing
behaviour is identical — but it widens the diff and the test surface.

We took the smaller route: keep module-level state where it lives, expose
a parallel context API. The default context wraps a fresh set of slots
(it is _not_ a view over the module state). This means a default-context
write does not affect the module-level slot, which is the right semantic
for tenants — but adopters who want their existing module-level wiring
to populate the default context need to know the two surfaces are
parallel, not coupled.

The trade-off is documented in the README and changeset. A follow-up can
unify the surfaces if adopters express preference; the user-facing API is
stable either way.

### Why kill-switch env-var name is overridable

The default `IBX_KILL_SWITCH` env var is shared. Multi-tenant deployments
need separate env vars per tenant — `IBX_KILL_SWITCH_TENANT_A`,
`IBX_KILL_SWITCH_TENANT_B` — so an operator can flip just one. The
`killSwitchEnvVar` option satisfies this without forcing a tenant-id
convention into the framework.

### Why tenant kill switch is a separate gate

The kernel's existing kill-switch check (inside `adjudicate()`) reads the
process-wide default context. The tenant kill switch is checked _ahead_
of that, inside `adjudicateAndAudit`. Both gates apply: a tenant flip
blocks just that tenant's traffic; a default flip blocks all traffic.
The tenant-side basis includes `detail.tenant` so audit reports
distinguish the two refusal sources.

### Why `reseedFromEnv()` exists

The "manual takes precedence over env" rule is correct for normal
operation but blocks an operator who wants to re-read the env after a
manual toggle. Adding `reseedFromEnv(env?)` resets the one-shot memo and
re-seeds. Default behaviour (one-shot) is preserved unless this method
is called.

## Consequences

### Positive

- Multi-tenant deployments can now host independent kill switches,
  metrics, learning, shadow telemetry, and enforce configs in one
  process.
- Operators have an env-reseed pathway during incidents.
- `adjudicateAndAudit` accepts a tenant context optionally, so existing
  call sites need not migrate.
- Existing module-level API (`isKilled`, `setKillSwitch`,
  `setMetricsSink`, etc.) is unchanged.

### Negative

- Two parallel surfaces (module-level and context-level). Adopters who
  install a `MetricsSink` via `setMetricsSink(sink)` (default context)
  and create a tenant context expecting that sink to also fire on the
  tenant's adjudications will be confused. README + changeset call this
  out.
- The default context's slots are independent of the module-level slots.
  A future refactor can unify them; for now, callers should pick one
  surface per process.
- Migrating an existing single-tenant adopter to multi-tenancy requires
  threading the context through their executor.

### Neutral

- `_resetDefaultRuntimeContext()` joins the family of `_resetX` helpers.
  Tests that mutate the default context use it to clean up.

## Implementation notes

- New module: `packages/core/src/kernel/runtime-context.ts`.
- `adjudicateAndAudit` accepts optional `deps.context: RuntimeContext`.
  When supplied, metrics/learning route through `context.metrics` /
  `context.learning`; tenant kill switch consulted before the kernel.
- 14 unit tests cover isolation, env override, reseed, sink slots, and
  adjudicateAndAudit routing.

## Follow-ups

- T7 (distributed kill switch) consumes a `RuntimeContext` so the polled
  remote state populates the right tenant.
- A future PR can refactor the module-level singletons to back-fill the
  default context, eliminating the parallel-surface confusion.
