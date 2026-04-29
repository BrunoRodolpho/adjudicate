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

import type { Taint, TaintPolicy } from "@adjudicate/core";

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
 */
export function createSystemTaintPolicy(
  options: SystemTaintPolicyOptions,
): TaintPolicy {
  const systemOnly = new Set(options.systemOnlyKinds);
  const systemMinimum = options.systemMinimum ?? "TRUSTED";
  const userMinimum = options.userMinimum ?? "UNTRUSTED";
  return {
    minimumFor(kind) {
      return systemOnly.has(kind) ? systemMinimum : userMinimum;
    },
  };
}
