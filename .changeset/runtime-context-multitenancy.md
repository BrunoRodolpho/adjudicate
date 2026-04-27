---
"@adjudicate/core": minor
---

`RuntimeContext` — per-tenant container for kill switch + sinks + enforce config. Resolves multi-tenancy gap (#8) and kill-switch env-seed one-shot (#16).

The kernel ships with module-level singletons for several mutable slots (kill switch, MetricsSink, LearningSink, ShadowTelemetrySink, IBX_KERNEL_SHADOW/ENFORCE parses). Single-process multi-tenant deployments could not give two tenants independent kill switches or telemetry routing. Operators who flipped `IBX_KILL_SWITCH=1` after a manual `setKillSwitch()` call had no path to re-seed the env.

- **NEW: `createRuntimeContext(options?)`** — mints a fresh container with isolated kill switch, metrics/learning/shadow sink slots, and an `EnforceConfig`. Each tenant holds the handle and routes reads/writes through it. Custom env-var names (`killSwitchEnvVar`, `shadowEnvVar`, `enforceEnvVar`) let tenants seed from per-tenant env vars (e.g., `IBX_KILL_SWITCH_TENANT_FOO`).
- **NEW: `getDefaultRuntimeContext()`** — process-wide singleton context. Existing module-level functions (`isKilled`, `recordDecision`, etc.) operate on it; back-compat is total.
- **NEW: `KillSwitchControl.reseedFromEnv(env?)`** — re-reads the kill-switch env var even after a manual `set()`. Operator escalation pathway during incidents.
- **CHANGED: `adjudicateAndAudit` accepts optional `context: RuntimeContext`** — when supplied, metrics + learning events route through the tenant context's slots. The tenant kill switch is consulted ahead of the kernel kill-switch (both gates apply). Without `context`, behaviour is identical to T1.
- **NEW: tenant kill-switch refusal** carries the tenant id in `basis.detail.tenant` so audit can distinguish process-wide vs per-tenant authority revocation.
- **NEW: 14 unit tests** (`tests/kernel/runtime-context.test.ts`) covering kill-switch isolation, env-var override, reseed, sink-slot isolation, enforce-config isolation, adjudicate-and-audit routing, and back-compat.
- ADR-103 documents the abstraction.

**Migration:** existing module-level callers continue unchanged. New tenant-aware code calls `createRuntimeContext()` and passes `{ context }` to `adjudicateAndAudit`.
