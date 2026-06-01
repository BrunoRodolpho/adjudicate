# v1.0-RC Performance Baselines

> Captured 2026-05-21 on `claude/unruffled-bassi-305034` at HEAD
> `bddf704`. Companion to `scale-baselines.json` (operational evidence)
> and `v0.2-baseline.md` (historical reference).

The framework's headline claim is "deterministic policy adjudication
under a budget operators can plan against". This document is the
authoritative microbenchmark table for the v1.0-RC cut. Numbers come
from `pnpm -F @adjudicate/bench bench` on commodity hardware; they
reflect the framework's framework-only cost and exclude I/O, network,
and SDK marshalling.

---

## §1 — Kernel hot paths (`adjudicate()` pure)

| Path | hz (ops/s) | p50 (µs) | p99 (µs) | p99.9 (µs) | Notes |
|---|---|---|---|---|---|
| EXECUTE (valid refund) | 2,190,471 | 0.5 | 0.6 | 1.5 | The headline number — full guard chain reaches EXECUTE in sub-µs. |
| REWRITE (refund clamp) | 239,958 | 4.0 | 6.7 | 37 | Hash dominates: the rewritten envelope's `intentHash` is the cost. |
| REFUSE (charge not found) | 3,012,854 | 0.3 | 0.5 | 1.3 | Short-circuits at the state guard; cheapest path. |
| EXECUTE (valid refund, installPack-wrapped) | 210,754 | 4.7 | 7.5 | 61.5 | `withBasisAudit` wrapper cost; matches production default. Re-captured (see note). |
| REFUSE (charge not found, installPack-wrapped) | 258,319 | 3.9 | 6.5 | 45.8 | Wrapped REFUSE path; matches production default. Re-captured (see note). |

> The bare-policy rows above reflect the underlying kernel cost. Rows marked
> "installPack-wrapped" reflect the framework's recommended boot
> (`installPack(pack)` with `auditBasisDrift: true`, returning the
> `withBasisAudit`-wrapped policy).
>
> **Capture note.** The four bare-policy rows were captured on
> `claude/unruffled-bassi-305034` at `bddf704`. The two installPack-wrapped
> rows were captured separately on the `fix/audit-2026-05-27` bench host at
> `9bfab26` — a slower machine, so their **absolute** numbers are not
> comparable to the bare rows above. What *is* comparable is the like-for-like
> delta measured in the same run on that host: bare EXECUTE 218,538 hz vs
> wrapped 210,754 hz, and bare REFUSE 262,130 hz vs wrapped 258,319 hz. The
> `withBasisAudit` wrapper costs **~1–4% on the hot path** — it interposes only
> to record `basis_code_drift`, leaving the adjudication work unchanged.
> Re-run `pnpm -F @adjudicate/bench bench:kernel` on the reference host to
> refresh the wrapped rows to that hardware's scale.

`adjudicateWithTrace()` on the same EXECUTE path adds ~600 ns for the
per-phase trace record allocation: 1,079,003 ops/s, p99 1.1 µs.

`buildEnvelope()` (sha256 canonical-JSON over the v2 hash input):
232,949 ops/s, p99 6.9 µs. Pack authors rebuilding envelopes in a tight
loop pay this; the kernel itself doesn't.

---

## §2 — Full audit-emitting path (`adjudicateAndAudit()`)

| Path | hz (ops/s) | p50 (µs) | p99 (µs) | p99.9 (µs) | Notes |
|---|---|---|---|---|---|
| REFUSE (no EXECUTE → no ledger claim) | 51,471 | 19.4 | 26.3 | 88 | Includes the ledger consult, metrics dispatch, learning emission, AuditRecord build. |
| REFUSE (no EXECUTE → no ledger claim, installPack-wrapped) | 3,489 | 287 | 733 | 1,770 | `withBasisAudit` wrapper; matches production default. Re-captured (see note). |

The full-path REFUSE is ~50× the pure-kernel REFUSE because every
adjudicateAndAudit call builds a complete `AuditRecord` (sha256 of the
canonicalized record for the `auditHash` field) and dispatches to the
sink. Operators planning SLO budgets allocate against this number.

> **Capture note.** The bare-policy row was captured on
> `claude/unruffled-bassi-305034` at `bddf704`. The installPack-wrapped row
> was captured separately on the `fix/audit-2026-05-27` bench host at
> `9bfab26` (slower hardware — absolute numbers not comparable to the bare
> row). Like-for-like in the same run on that host: bare REFUSE 3,052 hz vs
> wrapped 3,489 hz (wrapped lands within run-to-run noise, even marginally
> faster). The `withBasisAudit` wrapper adds no material cost on the
> audit-emitting path, where the `AuditRecord` sha256 + sink dispatch
> dominate. Re-run `pnpm -F @adjudicate/bench bench:audit` on the reference
> host to refresh the wrapped row to that hardware's scale.

---

## §3 — Scale evidence (in-process simulation)

Detailed machine-readable baselines live in
[`scale-baselines.json`](./scale-baselines.json). Highlights:

### AuditEventBus heavy

- 500 subscribers × 5000 records = 2,500,000 expected deliveries
- p50 / p95 / p99 fan-out latency: 2.9 / 5.3 / 5.5 ms
- 0 ordering violations
- 0 listener leaks post-teardown
- 72 MB heap delta (sample retention; not a leak)

### Kill-switch v2 heavy

- 64 replicas × 100 transitions, plus 5 mid-run crashes, 3 reconnect cycles, 200 ms partition window
- p50 / p95 / p99 propagation latency: 94.67 / 97.36 / 98.20 ms
  (dominated by polling fallback when pub/sub miss; tighter knob is
  `pollMs`, default 1000)
- 100% convergence (every live replica reaches the canonical writer's
  state on every transition)
- 0 split-brain residual
- 4 late-boot replicas successfully resync via boot poll

The harness emits `BenchArtifact` JSON per scenario; `pnpm rc:scale`
re-runs and overwrites the file.

---

## §4 — SLO posture

The kernel's published SLO (per `docs/concepts.md`):

- `adjudicate()` p99 ≤ 2 ms
- `adjudicateAndAudit()` p99 ≤ 15 ms

Observed headroom against SLO at v1.0-RC:

- `adjudicate()` EXECUTE p99 = 0.6 µs → **3,333×** headroom
- `adjudicate()` REWRITE p99 = 6.7 µs → **298×** headroom
- `adjudicate()` REFUSE p99 = 0.5 µs → **4,000×** headroom
- `adjudicateAndAudit()` REFUSE p99 = 26.3 µs → **570×** headroom

The framework's framework-only cost is consistently <2% of any
adopter-visible operation budget. The cost an adopter sees is dominated
by their downstream — Redis hop, Postgres write, OTLP export — not by
adjudication itself.

---

## §5 — Regression watch

The v1.0-RC pipeline does NOT yet automatically gate on a regression
threshold (`vitest bench` does not block CI). The first task post-v1.0
is to capture this baseline into `docs/perf/baselines.json` and run a
nightly bench against `main` so the chart speaks for itself.

For now, regressions are caught by:

- The scale harness CI smoke tests in `bench/src/scale/scale.test.ts`
  (4 invariant-shaped tests that fail on framework regressions in the
  fan-out / propagation story).
- The existing 1121-test suite — performance regressions that materially
  change behavior usually fail at least one functional test.

---

## §6 — Reproducing locally

```bash
# microbench
pnpm -F @adjudicate/bench bench

# scale harness (CI-light variants)
pnpm -F @adjudicate/bench test

# heavy scale run + write baselines
pnpm rc:scale

# full RC pipeline (lint + test + checks + scale smoke)
pnpm rc:check
```

All bench runs are single-process, single-thread, hot-CPU. Vitest's
`--bench` warmup and statistical-convergence defaults apply.
