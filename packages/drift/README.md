# @adjudicate/drift

Opt-in behavioral / statistical drift detection over the `AuditEventBus`. A pure
observer that compares a frozen **baseline** decision distribution against a
trailing **recent** window and raises alerts when the distribution shifts.

```ts
import { createDriftDetector } from "@adjudicate/drift";

const detector = createDriftDetector({
  baselineWindow: 500,
  recentWindow: 100,
  alertThreshold: 0.25,
  dimensions: ["decision.kind", "intent.kind", "basis"],
  onDrift: (alert) => console.warn("drift", alert),
});

const unsubscribe = detector.attach(auditEventBus); // observe() per record
// ...later, on a schedule the adopter owns:
detector.evaluate();          // recompute + fire onDrift
const snap = detector.snapshot(); // distributions + TVD + alerts (drives the console)
```

## Signals

- `distribution_shift` — total-variation distance ≥ `alertThreshold`.
- `new_category` — a recent key never seen in the baseline (e.g. a new intent kind).
- `proportion_spike` — a single category's recent share exceeds its baseline share by `alertThreshold` (e.g. a REFUSE spike).

## Guarantees

- **Pure observer.** `observe(record)` is synchronous, total, no-throw, no-I/O —
  safe as a bus handler. `evaluate()` is the only method that fires `onDrift`.
- **Deterministic.** Count-based windows (no wall-clock), no RNG. Same record
  sequence → byte-identical `snapshot()`. The kernel never imports this package;
  nothing reaches `intentHash` or the decision path.
- **Bounded cardinality.** `maxCategoriesPerDimension` (default 64); over-cap keys
  fall into an `__overflow__` bucket.
- **Not** the operational `DriftPanel` (integrity codes) — this is statistical
  decision-distribution drift.
