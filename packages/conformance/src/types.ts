/**
 * @adjudicate/conformance — public types.
 *
 * The conformance harness re-frames the kernel's internal invariant tests
 * (`packages/core/tests/kernel/invariants/`) as something adopters can
 * call against their own Pack at boot time or in CI: same property
 * suite, same pass/fail polarity, same vocabulary as the kernel itself.
 *
 * The four invariants are framed as soundness claims:
 *   1. AC-001 untrusted-never-executes   — taint protection holds for the Pack.
 *   2. AC-002 replay-determinism         — `adjudicate()` is a pure function
 *                                          of `(envelope, state, policy)`.
 *   3. AC-003 intent-hash-deterministic  — `buildEnvelope()` is deterministic
 *                                          under the v2 hash inputs.
 *   4. AC-004 basis-vocabulary-purity    — every basis code emitted is in
 *                                          `BASIS_CODES` ∪ `Pack.basisCodes`.
 *   5. AC-005 guard-ordering             — the kernel evaluates phases in
 *                                          `state → taint → auth → business`.
 *   6. AC-006 default-polarity           — `policy.default = "EXECUTE"` is
 *                                          rejected unless opted in.
 *
 * The harness is intentionally side-effect-free: it does not write audit
 * records, it does not install metrics sinks, and it does not mutate the
 * Pack. The kernel's own conformance wrapper (`withBasisAudit`) is
 * orthogonal — adopters who want runtime drift telemetry call that
 * separately at boot.
 */

import type { PackV0 } from "@adjudicate/core";

/**
 * One conformance invariant. Authored once in
 * `packages/conformance/src/checks/<id>.ts`; collected into the framework
 * default set as `DEFAULT_CHECKS`. Adopters who want to register
 * additional Pack-specific invariants can pass `{ checks: [...] }` to
 * `runConformance()`.
 *
 * A check returns a `ConformanceResult`. It MUST NOT throw — bugs in a
 * check should still produce a clean `passed: false` with a useful
 * `details` string. The harness wraps every check in a try/catch as
 * defence in depth, but checks themselves are the first line.
 */
export interface ConformanceCheck {
  /**
   * Stable, machine-readable identifier. Convention: `"AC-NNN"` (Adopter
   * Conformance, three-digit zero-padded). Audit dashboards filter by
   * this id; tooling can suppress a single check by id in CI without
   * editing the harness.
   */
  readonly id: string;
  /** Human-readable name (no markup). Used in `ConformanceReport`. */
  readonly name: string;
  /**
   * Run the invariant against `pack`. Returns a result describing whether
   * the Pack satisfied the invariant. Must be deterministic — same
   * `(pack, options)` MUST produce the same result, byte-identical, on
   * repeated invocations. PRNG seeding is mandatory; `Math.random()` is
   * banned.
   */
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult;
}

/**
 * Options governing `runConformance()`. All fields are optional with
 * documented defaults so the canonical adopter call site is just
 * `runConformance(myPack)`.
 */
export interface ConformanceOptions {
  /**
   * Mirror of `assertPackConformance({ allowDefaultExecute })`. When
   * `false` (the default), the `default-polarity` check fails if
   * `pack.policy.default === "EXECUTE"`. Read-only Packs (search,
   * summary, classification with no side effects) opt in by passing
   * `true`. See the docstring on `pack-conformance.ts` for the rationale.
   */
  readonly allowDefaultExecute?: boolean;
  /**
   * Number of random envelopes generated per fuzz-style check. The
   * deterministic LCG seed (`options.seed`) controls the sequence so
   * `sampling` does not introduce nondeterminism — increasing it just
   * extends the deterministic walk. Default: `100`. The framework's
   * internal property tests use 5k–10k runs; the public harness defaults
   * lower so boot-time invocation stays well under a second.
   */
  readonly sampling?: number;
  /**
   * Seed for the LCG-based PRNG used by random-envelope-generation
   * checks. Default: `42`. Adopters who want diversity across runs (e.g.,
   * nightly CI that sweeps seeds) bump this value externally. **Same
   * seed → same envelopes → same results.** No part of the harness
   * touches `Math.random()`.
   */
  readonly seed?: number;
  /**
   * Override the default check set. Useful for CI configurations that
   * want a subset (e.g., skip `default-polarity` for read-only Packs)
   * or that want to register Pack-specific custom invariants alongside
   * the framework defaults. Defaults to `DEFAULT_CHECKS`.
   */
  readonly checks?: ReadonlyArray<ConformanceCheck>;
}

/**
 * Outcome of running one `ConformanceCheck`. `passed === false` carries
 * an operator-facing `details` string explaining why; `passed === true`
 * may also carry `details` (typically empty or a sample-count
 * confirmation).
 */
export interface ConformanceResult {
  readonly id: string;
  readonly name: string;
  readonly passed: boolean;
  /**
   * Free-form operator detail. On failure, this is the load-bearing
   * field — it should name the invariant, the input that violated it,
   * and the observed Decision. On success, optional sample-count or
   * skipped-reason note.
   */
  readonly details?: string;
}

/**
 * Aggregate report from `runConformance()`. The `passed` flag is the
 * AND of every result's `passed`. `summary` is the count breakdown so
 * dashboards can render at a glance without iterating `results`.
 */
export interface ConformanceReport {
  readonly packId: string;
  readonly results: ReadonlyArray<ConformanceResult>;
  readonly passed: boolean;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
  };
}
