---
"@adjudicate/cli": minor
"@adjudicate/console": minor
---

UX cut (v0.5.1) — console UX additions + 7 new CLI commands + 4 domain templates.

## Console (apps/console)

- **Real-time audit tail** via 2s polling. `<LiveTailToggle>` in the TopBar; new records highlight briefly on arrival.
- **WhyNotPanel** on the decision detail page explains which other Decision kinds were NOT reached and why.
- **Lineage explorer** at `/decisions/[intentHash]/lineage` walks the supersession chain to depth 20 as a depth-limited tree.
- **Drift detection panel** on the Dashboard aggregates basis_code_drift / rewrite_taint_regression / defer_signal_drift / guard_panic counts.
- **SLO dashboard panel** computes p50/p95/p99 per intent kind with color-coded utilization vs SLO budget.
- **Scenario replay UI** in `ReplayDialog` allows single-field payload edit + side-by-side diff against original decision.
- **Failure-state banners** (Postgres lag, DLQ, drift) at the top of every page via `FailureBanners`.

## CLI (@adjudicate/cli)

Seven new commands:

- `adjudicate reap` — Idle-DeferStore Redis scanner (verification-only in v0.5).
- `adjudicate visualize` — Standalone HTML force-graph of a Pack's PolicyBundle.
- `adjudicate repl` — Interactive intent → decision shell.
- `adjudicate replay` — Re-adjudicate stored AuditRecords against a Pack with mismatch classification.
- `adjudicate export` — Audit-record export to JSON / CSV (Parquet deferred to v0.6).
- `adjudicate scenarios generate` — Seeded LCG-based scenario fixture generation.
- `adjudicate dev` — Docker Compose harness (Redis + Postgres) for local dev.

## Pack templates (T-034/T-035/T-036)

`adjudicate pack init <name> --template <basic|payment|approval|kyc|deployment>` scaffolds a domain-specific Pack:

- `basic` (default; existing template)
- `payment` — create/confirm/refund with REWRITE clamp, ESCALATE on large refund, DEFER on creation
- `approval` — request/approve/deny with self-actor refusal, TRUSTED-only approve, escalation threshold
- `kyc` — start/upload/callback/complete with multi-stage DEFER, SYSTEM-only callback, low-score escalation
- `deployment` — request/rollback with production escalation, rollback confirmation, ramp-percent REWRITE clamp

877 tests pass (was 833 baseline). All new commands have paired tests under `packages/cli/tests/`.
