# @adjudicate/drift

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
