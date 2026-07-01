# @adjudicate/drift

## 0.2.5

### Patch Changes

- Updated dependencies [efabb92]
  - @adjudicate/core@1.8.0

## 0.2.4

### Patch Changes

- Updated dependencies [33fcb81]
  - @adjudicate/core@1.7.0

## 0.2.3

### Patch Changes

- Updated dependencies [06eea00]
  - @adjudicate/core@1.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [6a73485]
- Updated dependencies [9056c6e]
- Updated dependencies [b77f6b0]
- Updated dependencies [5a261ef]
- Updated dependencies [014e8fe]
- Updated dependencies [f34c493]
- Updated dependencies [a9be0ad]
- Updated dependencies [e8698b1]
- Updated dependencies [6121a7a]
- Updated dependencies [c0d1b93]
- Updated dependencies [c0b1b44]
- Updated dependencies [86abd1a]
- Updated dependencies [d2c3625]
- Updated dependencies [cb8d608]
- Updated dependencies [6e18f2c]
- Updated dependencies [580fc68]
- Updated dependencies [7832b4c]
- Updated dependencies [0d83e43]
- Updated dependencies [e9cc367]
- Updated dependencies [44c46d2]
- Updated dependencies [79f47fe]
- Updated dependencies [e81b801]
- Updated dependencies [539337f]
- Updated dependencies [1978f2b]
- Updated dependencies [3f4bbbc]
  - @adjudicate/core@1.5.0

## 0.2.1

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 0.2.0

### Minor Changes

- 71658f9: Behavioral Drift history surface (ADR-132). `@adjudicate/drift` gains `createDriftHistory({ capacity? })` — a bounded, deterministic snapshot-history accumulator. `record(snapshot, at)` appends a per-dimension TVD + alert-count roll-up of a `DriftSnapshot`, stamped with a CALLER-SUPPLIED `at` timestamp + a monotonic, eviction-stable `seq`; `view()` returns `{ capacity, count, dropped, entries }` (oldest → newest). It is a fixed-capacity ring buffer (default 100), oldest evicted first, with `dropped` exposing eviction so a dashboard never silently loses history. NO wall-clock and NO RNG on any path — the package never reads a clock; timestamps are supplied by the adopter (same clock-free posture as `DriftSnapshot`). New types `DriftHistory`/`DriftHistoryEntry`/`DriftHistoryDimensionEntry`/`DriftHistoryView`/`DriftHistoryOptions`.

  `@adjudicate/admin-sdk` gains the read-only `governance.driftHistory` query (input `{ limit }`, default 100, max 500 → windows the timeline to the last N retained points) returning `DriftHistoryResultSchema` (`{ schemaVersion: 1, capacity, count, dropped, entries }`, each entry `{ at, seq, totalObserved, maxTvd, alertCount, dimensions: { dimension, tvd, alertCount }[] }`). New schemas `DriftHistoryEntrySchema`/`DriftHistoryDimensionEntrySchema`/`DriftHistoryResultSchema`/`DriftHistoryQuerySchema` (+ inferred types) re-declare the `DriftHistoryView` shape as Zod with NO dependency on `@adjudicate/drift` — the same dependency-free posture `BehavioralDriftResultSchema` takes; `DriftDimensionNameSchema` is now also exported. New optional `AdminContext.driftHistory?: { query(input: DriftHistoryQuery): DriftHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `driftDetector`/`governance.behavioralDrift`. No actor required (read-only aggregates). The existing single-point `governance.behavioralDrift` + `BehavioralDriftResultSchema` and `AdminContext.driftDetector` are unchanged. No closed-enum widening (`DriftDimension`/`DriftSignalKind` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/drift` page (Active Drifts + Dimensions + Timeline + a labelled Operational sub-view) and the public web `/transparency/drift` status badge.

- 2ea6156: feat(drift): new @adjudicate/drift package — behavioral/statistical drift detection over the AuditEventBus (total-variation-distance, new-category, proportion-spike) with bounded cardinality and deterministic count-based windows (ADR-119).

  feat(admin-sdk): add `governance.behavioralDrift` returning a drift snapshot for the console Behavioral Drift panel.

### Patch Changes

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

## 0.1.0

### Minor Changes

- Initial release (ADR-119). Behavioral/statistical drift detection over the
  AuditEventBus — total-variation-distance, new-category, and proportion-spike
  signals with bounded cardinality and count-based (deterministic) windows.
