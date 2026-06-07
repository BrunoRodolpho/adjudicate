# @adjudicate/primitives

Layer 2 risk primitives — generic guard + taint factories shared by two or more
Packs. Sits between `@adjudicate/core` (Layer 1, kernel) and per-domain Packs
(Layer 3). Each factory runs at Pack-definition time and returns a tight,
kernel-direct `Guard` / `TaintPolicy`.

## Guard factories

| Factory | Emits | Use |
|---|---|---|
| `createThresholdGuard` | any | numeric crossing → caller-supplied Decision |
| `createConfirmGuard` | REQUEST_CONFIRMATION | numeric crossing → confirmation prompt |
| `createEscalateGuard` | ESCALATE | numeric crossing → human/supervisor |
| `createRewriteGuard` | REWRITE | clamp a numeric payload field to a cap |
| `createStateDeferGuard` | DEFER | park an intent on a wire signal |
| `createIdempotencyGuard` | REFUSE | domain-level dedup (not the ledger) |
| `createDataClassificationGuard` | REWRITE / REFUSE | scan payload for PII/PHI and redact or block |
| `requireTenantBinding` | REFUSE | reject actors not bound to the tenant in state |

## Taint factories

| Factory | Returns | Use |
|---|---|---|
| `createSystemTaintPolicy` | `TaintPolicy` | require `TRUSTED` for an allowlist of system-only intent kinds |

## `createDataClassificationGuard` (ADR-117)

```ts
import { createDataClassificationGuard } from "@adjudicate/primitives";

const redactPii = createDataClassificationGuard({
  matches: (env) => env.kind === "support.ticket.create",
  patterns: [
    { id: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
    { id: "pan", pattern: /\b\d{16}\b/ },
  ],
  scannedFields: ["subject", "body"], // dotted paths; required + non-empty
  action: "REWRITE", // or "REFUSE"
  sensitivityLevel: "high",
});
```

- **REWRITE** masks the matched substrings in the matched fields and re-emits the
  envelope with the redacted payload. **Taint is preserved verbatim** — redaction
  removes content but never declassifies (so it can never trip
  `rewrite_taint_regression`).
- **REFUSE** blocks the intent with a `SECURITY` refusal.
- The runtime `sensitivityLevel` + `redactedFields` ride in `DecisionBasis.detail`
  (the only structured channel that reaches the `AuditRecord`); the static
  `GuardDescription.data_classification` carries the *permitted* scope for
  analyzers. Both, by design.

Pure: regex evaluation over `envelope.payload`, no clock/I/O/RNG. `@experimental`
until Pack feedback per the L2 freeze convention.
