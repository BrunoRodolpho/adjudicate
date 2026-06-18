/**
 * System-only intent kinds — the canonical TaintPolicy shape.
 *
 * Both shipped Packs hit the same pattern: most user-initiated intents
 * tolerate UNTRUSTED (the LLM proposes them on behalf of the user);
 * a small allowlist of system-event kinds (webhooks, vendor callbacks)
 * require TRUSTED so the LLM can't forge them. The factory encodes
 * exactly that split — a whitelist of system-only kinds plus a default
 * for everything else.
 *
 * Why a factory instead of one-off TaintPolicy objects:
 *
 *   - One source of truth for what counts as "system-only" — Packs that
 *     refactor a system-event kind don't accidentally drop the TRUSTED
 *     requirement by editing the wrong line of an inline policy.
 *   - The kernel's `canPropose` runs against this PER ENVELOPE; encoding
 *     the lookup as a `Set.has` keeps the hot path branchless.
 *   - The narrow surface (one allowlist) makes "can the LLM propose
 *     this intent?" a one-line audit at Pack-installation time.
 */

import type { Origin, Taint, TaintPolicy } from "@adjudicate/core";

/**
 * 041 — mirror the core `Origin` provenance source axis into the primitives
 * surface (alongside the existing `Taint` re-export pattern) so Pack authors
 * can reference the type without a second core import. Additive; structurally
 * identical to `@adjudicate/core`'s `Origin`.
 */
export type { Origin } from "@adjudicate/core";

export interface SystemTaintPolicyOptions {
  /**
   * Intent kinds that originate from the system (webhooks, scheduled
   * jobs, vendor callbacks) and MUST arrive with `TRUSTED` taint. Any
   * intent kind not in this list is treated as user-initiated and
   * tolerates `UNTRUSTED`.
   */
  readonly systemOnlyKinds: ReadonlyArray<string>;
  /**
   * Override the minimum taint for non-system-only kinds. Defaults to
   * `"UNTRUSTED"`. Adopters with stricter user-input requirements (e.g.,
   * "every intent must be TRUSTED") set this to `"TRUSTED"` instead —
   * but at that point a custom TaintPolicy is usually clearer.
   */
  readonly userMinimum?: Taint;
  /**
   * Override the minimum taint for system-only kinds. Defaults to
   * `"TRUSTED"`. Lowering this defeats the factory's purpose; the
   * option exists for completeness, not encouragement.
   */
  readonly systemMinimum?: Taint;
  /**
   * 041 — provenance SOURCE axis carried for symmetry with the envelope's
   * new `origin` field. **Metadata-opaque (ADR-105 rule 7): NOT consulted.**
   * The factory does NOT branch on `origin` — the kernel's taint gate is a
   * fixed-position step keyed on `kind`, and an origin-based decision belongs
   * to the contaminating propagation gate (plan 042), never here. Present so
   * Pack authors can thread the source through their config without a schema
   * break; carried, not gated.
   */
  readonly origin?: Origin;
}

/**
 * Build a TaintPolicy that requires TRUSTED for an allowlist of
 * system-only intent kinds and UNTRUSTED for everything else.
 *
 * Equivalent to writing:
 *
 *     const systemOnly = new Set(["kyc.vendor.callback"]);
 *     const taint: TaintPolicy = {
 *       minimumFor(kind) {
 *         return systemOnly.has(kind) ? "TRUSTED" : "UNTRUSTED";
 *       },
 *     };
 *
 * — but lifted to a primitive so the pattern's name (system-only kinds)
 * appears in the Pack's source rather than its mechanics.
 *
 * **No `GuardMetadata` attached.** ADR-105's metadata surface
 * (`withMetadata`, `readGuardMetadata`, `GuardDescription`) is keyed off
 * a symbol slot on `Guard<K,P,S>` function objects — `nameGuard` and
 * the L2 guard factories (`createThresholdGuard`, `createStateDeferGuard`)
 * use it. `createSystemTaintPolicy` returns a `TaintPolicy` (a plain
 * object with one method), not a `Guard`, so the symbol-keyed slot
 * does not apply structurally. The kernel's taint gate is one
 * fixed-position step in the evaluation order (state → **taint** →
 * auth → business per ADR-104) rather than one of an array of
 * adopter-supplied guards; the matched-guard identity that flows into
 * `LearningEvent.guardId` is meaningless for the taint phase. Per
 * ADR-105 rule 7, absence of metadata is a permanent valid state for
 * any non-Guard surface — analyzers MUST treat the taint phase as
 * structurally opaque on the metadata axis. The `system_taint` variant
 * in `GuardDescription` exists for future use by Pack-author-defined
 * guards that wrap a system-only-kind check inline (e.g., as part of
 * a state guard); it is not produced by this factory.
 */
export function createSystemTaintPolicy(
  options: SystemTaintPolicyOptions,
): TaintPolicy {
  const systemOnly = new Set(options.systemOnlyKinds);
  const systemMinimum = options.systemMinimum ?? "TRUSTED";
  const userMinimum = options.userMinimum ?? "UNTRUSTED";
  // 041 — `options.origin` is deliberately NOT read here. The minimum is a
  // pure function of `kind`; origin is carried metadata, consulted by the
  // 042 propagation gate, never by this factory (ADR-105 rule 7).
  return {
    minimumFor(kind) {
      return systemOnly.has(kind) ? systemMinimum : userMinimum;
    },
  };
}
