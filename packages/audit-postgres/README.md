# @adjudicate/audit-postgres

Postgres durable governance trail for IBX Intent-Gated Execution.

Implements `AuditSink` from `@adjudicate/audit` against a partitioned-by-month
`intent_audit` table. Adopters supply a Postgres writer that runs an INSERT;
the sink flattens each `AuditRecord` into the table's row shape.

This README covers the **audit sink + replay reader**. The package also exports
SDK-shape readers and additional stores (`createPostgresAuditStore`,
governance-events, guard-fire-stats, outcomes, `legacyV1ToV2`) — see
[`src/index.ts`](./src/index.ts).

## Schema

See [`migrations/`](./migrations/). Migration `001` creates the base v1 table;
the additive migrations widen it for later record versions (`002` plan_jsonb,
`003` nonce, `005` supersedes_jsonb, `008` v4 fields, `010` v5 metadata) plus
the sibling stores (`004` governance-events, `006` guard-fire-stats,
`007` outcomes, `009` the (intent_hash, recorded_at) unique constraint).

Partitioned by `recorded_at` (range, monthly). Adopters create partitions
monthly via cron, [pg_partman](https://github.com/pgpartman/pg_partman), or
their migration tooling. Retention is set by dropping old partitions
according to the compliance window (typically 7y for financial intents,
2y for general transactional audit).

## Usage

The reference INSERT is exported as `INSERT_AUDIT_SQL` — the single source of
truth for the row shape — paired with `auditInsertParams(row)`, which produces
the bound parameter array in matching column order. **Use them; do not
hand-roll the statement.** The row spans 25 columns (base v1 schema plus the
v2–v5 additive migrations), and every column carries part of the
tamper-evidence binding: omitting the v4 fields (`audit_hash`,
`signature_jsonb`, `kernel_identity_jsonb`, …) makes `verifyAuditRecord` report
`missing_hash` on read-back. The const + helper keep the column set complete and
in sync by construction.

```ts
import {
  createPostgresSink,
  INSERT_AUDIT_SQL,
  auditInsertParams,
} from "@adjudicate/audit-postgres";
import { multiSink, createConsoleSink, createNatsSink } from "@adjudicate/audit";

const sink = multiSink(
  createConsoleSink(),
  createNatsSink({ publisher: natsPublisher }),
  createPostgresSink({
    writer: {
      insertAudit: (row) =>
        pool.query(INSERT_AUDIT_SQL, [...auditInsertParams(row)]),
    },
    onError: (err, record) => {
      Sentry.captureException(err, { extra: { intentHash: record.intentHash } });
    },
  }),
);
```

`INSERT_AUDIT_SQL` names all 25 columns explicitly (`$1..$25`) and ends with
`ON CONFLICT (intent_hash, recorded_at) DO NOTHING` — the grain backed by the
unique constraint from migration `009`, so idempotent re-emit of the same record
is a no-op. (A re-adjudication at a later `recorded_at` is a distinct row.)

## Replay

`readAuditWindow` takes an `AuditQueryFn` — an object exposing
`fetchRows(window)` — as its first argument. Adopters wrap their Postgres client
in that shape (window ends are both inclusive).

```ts
import { readAuditWindow } from "@adjudicate/audit-postgres";
import { replay } from "@adjudicate/audit";

const query = {
  fetchRows: (window) => pool.query(/* SELECT … WHERE recorded_at BETWEEN … */)
    .then((res) => res.rows),
};

const records = await readAuditWindow(query, {
  fromIso: "2026-04-01T00:00:00Z",
  toIso: "2026-04-30T23:59:59Z",
  intentKind: "order.submit",
});

const report = replay(records, (r) => adjudicate(r.envelope, currentState, policy));
console.log(`${report.matched}/${report.total} matched, ${report.mismatches.length} divergences`);
```

The replay is deterministic — running today's policy against last month's
records detects drift before any audit. Hook this into CI for "no
divergence" regression fences.

## Why a separate package

`@adjudicate/audit` stays free of Postgres-specific imports — adopters that
ship to environments without Postgres (edge functions, mobile-first runtimes)
do not pull in this dependency. The base `AuditSink` interface is everything
they need.
