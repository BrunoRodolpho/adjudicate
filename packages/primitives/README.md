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
| `createTokenBudgetGuard` | REFUSE / DEFER | refuse (or park) when cumulative LLM token use crosses a per-session/per-tenant budget |
| `createCommandRiskGuard` | REFUSE / REWRITE / REQUEST_CONFIRMATION | classify a proposed shell command and refuse / strip / confirm |
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
    { id: "pan", pattern: /\b\d{16}\b/, redact: (m) => `****${m.slice(-4)}` },
  ],
  scannedFields: ["subject", "body"], // dotted paths; required + non-empty
  action: "REWRITE", // or "REFUSE"
  sensitivityLevel: "high",
});
```

- **REWRITE** masks the matched substrings in the matched fields and re-emits the
  envelope with the redacted payload, carrying basis code `PII_REDACTED`. Each
  pattern may set a `redact(match)` callback to override the default `[REDACTED]`
  token. **Taint is preserved verbatim** — redaction removes content but never
  declassifies (so it can never trip `rewrite_taint_regression`).
- **REFUSE** blocks the intent with a `SECURITY` refusal carrying basis code
  `PII_BLOCKED`.
- The runtime `sensitivityLevel` + matched fields ride in `DecisionBasis.detail`
  (the only structured channel that reaches the `AuditRecord`); the static
  `GuardDescription.data_classification` carries the *permitted* scope for
  analyzers. Both, by design.

Pure: regex evaluation over `envelope.payload`, no clock/I/O/RNG.

## `createTokenBudgetGuard` (ADR-120)

Refuses (default) or parks an intent when cumulative LLM token consumption
crosses a per-session and/or per-tenant budget. Token counts live in the
adopter's **state `S`** (read via `extractSessionTokens` / `extractTenantTokens`),
not in `RuntimeContext` — so the decision stays pure and replayable. At least one
of `sessionBudget` / `tenantBudget` is required.

- Default `action` is `REFUSE`. Set `action: "DEFER"` (with `deferTimeoutMs`) to
  park on the `token_budget_reset` signal (overridable via `deferSignal`) — DEFER
  has no natural external resume signal, hence REFUSE is the primary action.
- **Fails CLOSED** on a definitively-over meter: `+Infinity` crosses any finite
  budget and refuses. Only `NaN` (an uninterpretable reading) and genuinely
  sub-budget values pass.

## `createCommandRiskGuard` (ADR-123)

Classifies a proposed shell command via a pure rule table and emits the least
disruptive safe disposition:

- **REFUSE** for irrecoverable risk (e.g. `rm -rf /`, `mkfs`, `dd of=/dev/…`,
  fork bombs).
- **REWRITE** when a dangerous flag can be stripped to de-escalate the command
  (taint preserved verbatim).
- **REQUEST_CONFIRMATION** otherwise (network / credential / recoverable).

Defense-in-depth, not a sandbox. The classifier and flag-stripper are pure and
backed by the frozen `command-classify` rule tables (see below); adopters supply
`matches` / `extractCommand` / `commandField` and may override the tables per
guard.

## `command-classify` module

Pure, deterministic command-risk classification re-exported from the package
root (ADR-123). Useful standalone, and the engine behind `createCommandRiskGuard`.

| Export | Kind | Purpose |
|---|---|---|
| `classifyCommand(command, rules?)` | fn | classify a command → `{ category, matchedRuleIds, disposition }` (highest-severity category wins; `disposition: "refuse"` if any matched rule refuses, else `"confirm"`, else `"safe"`) |
| `stripDangerousFlags(command, rules?)` | fn | remove strippable safety-disabling flags → `{ command, stripped }` |
| `DEFAULT_COMMAND_RULES` | const | frozen default rule table (destructive / network / credential) |
| `DEFAULT_FLAG_STRIP_RULES` | const | frozen default flag-strip table (e.g. `-f`/`--force`/`--no-preserve-root` on `rm`) |
| `CommandClassification`, `CommandRiskCategory`, `CommandRule`, `FlagStripRule` | types | classification result + rule shapes |

Deterministic — no clock/I/O/RNG. Rule tables are frozen module constants;
override per call/guard via the `rules` / `flagStripRules` arguments.
