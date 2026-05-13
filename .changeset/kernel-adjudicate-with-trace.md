---
"@adjudicate/core": minor
---

Add `adjudicateWithTrace` — tracing variant of `adjudicate()` for simulation and verification tooling.

`adjudicateWithTrace(envelope, state, policy)` returns `{ decision, trace }` where `trace` is an ordered array of `AdjudicationTraceEntry` describing which guards ran and which one matched. The `decision` is byte-identical to `adjudicate(envelope, state, policy)` — both functions share a single internal implementation, so trace fidelity is structurally guaranteed.

```ts
import { adjudicateWithTrace } from "@adjudicate/core/kernel";

const { decision, trace } = adjudicateWithTrace(envelope, state, policy);
// trace: [
//   { phase: "kill",     outcome: "pass" },
//   { phase: "schema",   outcome: "pass" },
//   { phase: "taint",    outcome: "pass" },
//   { phase: "business", index: 3, guardName: "requestConfirmForMediumRefund", outcome: "match" },
// ]
```

**Trace semantics:**
- One entry per evaluated step, in order. Steps that didn't run (short-circuited by an earlier match) are absent.
- Single-step phases (`kill`, `schema`, `taint`, `default`) emit one entry per call.
- Array phases (`state`, `auth`, `business`) emit one entry per guard actually invoked, carrying its 0-based `index` and best-effort `guardName` from `Function.name`.
- The trace always ends with exactly one entry where `outcome === "match"` — that step produced the final decision.

**Zero hot-path overhead:** `adjudicate()` delegates to the same internal implementation passing `undefined` for `traceOut`, paying no allocation cost. Existing call sites are unaffected.

Use cases this unlocks:
- Phase 6 `adjudicate simulate` CLI: renders the per-guard trace to terminal output.
- Operator Console replay: can show *which* guard short-circuited, not just the final decision.
- Phase 7 static verification: enumerate guard reachability over closed-enum input spaces.

New exports from `@adjudicate/core/kernel`:
- `adjudicateWithTrace`
- `AdjudicationTraceEntry`, `AdjudicationTracePhase`, `AdjudicationTraceResult`
