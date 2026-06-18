# Guide: multi-pack composition analysis

> WS-D / ADR-140 / ADR-125. Tiers: gating Tier-1 composition checks
> (AJD-107..110) + advisory Tier-3 reachability (AJD-302/303).

When you compose several Packs into one merged policy, two classes of problem
can appear that no single Pack exhibits alone:

- **Conflicts** (sound, gating) — REWRITE-field overlap, DEFER-signal collision,
  taint contradiction, duplicate intents. These are declarative and decidable
  from Pack metadata, so they **gate** (`AJD-107..110`, Tier-1).
- **Reachability/coherence** (advisory, probe-dependent) — is every threshold
  the operative gate? does the planner actually reach the declared intents? These
  need planner **probes** and are field-unverifiable at Tier-3, so they are
  **advisory only** (`AJD-301..303`) and never gate.

## Adopter merge-set gate (blocking, Tier-1)

In-repo CI already gates the shipped catalog (`.github/workflows/ci.yml` →
`analyze-composition` over the six shipped packs). **Adopters should run the same
command as a blocking gate over THEIR declared merge set** — every Pack they
actually compose, in the order they compose it:

```sh
adjudicate analyze-composition \
  --pack ./node_modules/@yourco/pack-a/dist/index.js \
  --pack ./node_modules/@yourco/pack-b/dist/index.js \
  --pack ./packs/your-local-pack/dist/index.js
# exits non-zero on any AJD-107..110 conflict → fail the PR
```

This path is metadata-only (no planner probes), runs offline/CI, and never runs
inside `adjudicate()`.

## Advisory Tier-3 reachability (AJD-302/303)

These run only when you pass `plannerProbes` to `analyzePolicy` (a set of
deterministic `{ state, context }` fixtures). They emit notes/one warning and
**never** set `passed = false`.

### AJD-302 — CompositionThresholdReachability

- `probe_coverage_floor` (**warning**): your probe set covers only K/N declared
  non-system intents — so the Tier-3 advisory is partial. This is the
  analysis-confidence caveat that makes "advisory" honest. It reports counts +
  ratio only; the per-intent defect ("intent X is unreachable") is the separate
  `AJD-301` `unreachable_intent` warning, so the two never double-list intents.
- `threshold_unreachable` (**note**): the merged set has threshold guards but the
  planner offers no intents across your probes → those gates are dead.
- `threshold_redundancy` (**note**): two same-phase, same-direction thresholds
  where one subsumes the other → the dominated guard is never the binding
  constraint. **Field-unverifiable** (`unverifiableField: true`): Tier-3 cannot
  resolve which field each threshold reads (the `extract` closure is opaque;
  full field resolution is the deferred Tier-2 `AJD-202`), so this is a
  low-confidence hint — confirm before acting.

### AJD-303 — CompositionEscalationCycle (deferred — feasibility note)

AJD-303 detects cycles in the escalation graph across the merged set. The
cycle-detection engine (`detectEscalationCycles`) is implemented and tested, and
the analyzer is wired — but it is a **sound no-op on every Pack today** because
**`GuardDescription` carries no escalation target**. A guard's `threshold.emits`
may be `"ESCALATE"`, but the metadata never says *to whom/where*, so there are no
`from → to` edges to form a graph.

To activate AJD-303, guard metadata must gain an escalation-target surface (e.g.
a `description.escalatesTo` field, or a dedicated `kind: "escalation"` variant).
That is a `@adjudicate/core` kernel-metadata change and is intentionally **out of
scope for WS-D** — the analyzer's `extractEscalationEdges` seam is the single
place to populate once that surface exists, and AJD-303 then activates with no
further analyzer change.
