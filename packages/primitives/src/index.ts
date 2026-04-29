/**
 * @adjudicate/primitives — Layer 2 risk primitives.
 *
 * # The three layers
 *
 *   Layer 1  @adjudicate/core         kernel, six-outcome Decision, taint, hash
 *   Layer 2  @adjudicate/primitives   generic guard + taint factories (this package)
 *   Layer 3  @adjudicate/pack-*       per-domain bundles (PIX, KYC, …)
 *
 * Layer 2 exists to encode patterns that two or more Layer 3 Packs
 * already share — so adopters writing Pack #4 don't reach for the
 * kernel's raw `Guard` signature when a typed factory would do. The
 * factories are deliberately *lower-leverage* than full guard authors:
 * they encapsulate one specific shape (threshold-crossing, signal-driven
 * DEFER, system-only intent kinds) and refuse to grow into a domain
 * DSL.
 *
 * # When to add to this package
 *
 *   ✓ Two existing Packs implement the same pattern with different
 *     domain values (intent kinds, thresholds, signal names).
 *   ✓ The pattern is ergonomically painful to inline by hand.
 *   ✓ The factory's surface is narrower than the kernel's `Guard`
 *     signature — a typed shape, not a generic free-form callback.
 *
 *   ✗ A pattern that exists in only one Pack — keep it in the Pack.
 *   ✗ Domain-specific helpers (e.g., "is this a refund?") — that's the
 *     Pack's responsibility, not Layer 2.
 *   ✗ A factory whose surface is just `(envelope, state) => Decision` —
 *     that's the kernel's `Guard`, you don't need a wrapper.
 *
 * # Zero-cost intent
 *
 * Each factory runs at Pack *definition* time (closure capture, no
 * allocation per envelope), then returns a tight `Guard`/`TaintPolicy`
 * function the kernel calls per envelope. There is no per-request
 * indirection beyond what an inline guard would do.
 */

export {
  createStateDeferGuard,
  createThresholdGuard,
  type StateDeferGuardOptions,
  type ThresholdComparator,
  type ThresholdGuardOptions,
} from "./guards.js";

export {
  createSystemTaintPolicy,
  type SystemTaintPolicyOptions,
} from "./taint.js";
