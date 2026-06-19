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

/**
 * 042 — adopter-facing session-contamination policy.
 *
 * Contamination (000_index.md §G) makes untrusted *origin* contaminating at the
 * session level: once a `Retrieved`/`ExternalAPI` datum enters context, the
 * harness lowers the taint of every subsequently minted LLM intent in that
 * session via the lattice meet, so the kernel's existing `canPropose` gate sees
 * the contaminated taint. This is the adopter knob the harness reads; the
 * mechanism (meet + monotonic fold) lives in `@adjudicate/core`'s taint module
 * and the adapter shell, never in a kernel guard.
 *
 * **Default OFF** (`enabled: false`) so existing deployments are byte-identical
 * to pre-042 behavior — the non-contaminated path mints exactly the declared
 * taint. Adopters opt in by passing `{ enabled: true }`.
 */
export interface SessionContaminationPolicy {
  /** When true, the harness folds session contamination into minted intents. */
  readonly enabled: boolean;
}

export interface SessionContaminationPolicyOptions {
  /**
   * Enable session contamination. Defaults to `false` (OFF) — the safe,
   * behavior-preserving default. Turning it ON does not weaken any guard; it
   * can only *add* friction (the lattice meet lowers trust, never raises it).
   */
  readonly enabled?: boolean;
}

/**
 * 042 — build the canonical adopter-facing contamination policy. Default OFF.
 * Provided as a factory (mirroring `createSystemTaintPolicy`) so the "is
 * contamination enabled for this Pack?" decision is a one-line, single-sourced
 * audit at Pack-installation time rather than an inline boolean scattered across
 * adapter wiring.
 */
export function createSessionContaminationPolicy(
  options: SessionContaminationPolicyOptions = {},
): SessionContaminationPolicy {
  return { enabled: options.enabled ?? false };
}

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
   *
   * NOTE (043): this `origin` is a per-CONFIG default carried for symmetry; it
   * is NOT the per-ENVELOPE origin the kernel gate reads. The 043 origin-aware
   * branch keys off the envelope's harness-stamped `origin` and the
   * `originRequiredKinds` allowlist below — never this field.
   */
  readonly origin?: Origin;
  /**
   * 043 — intent kinds that must NOT be proposed from a *contaminating* origin
   * (`Retrieved` / `ExternalAPI`), even when the trust-rank minimum alone would
   * clear the gate. Populates the policy's optional
   * `requiresUncontaminatedOrigin` method so the kernel taint gate raises the
   * effective minimum for these kinds when the harness-stamped envelope origin
   * is contaminating — catching the `READ`→inject→intent laundering path that an
   * UNTRUSTED-min mutating kind (`1 >= 1` always-pass) cannot otherwise see.
   *
   * **Opt-in / default-OFF (§7 dark-ship flag).** Omit it (or pass `[]`) and the
   * returned policy carries NO `requiresUncontaminatedOrigin` method — the
   * kernel gate is byte-identical to pre-043, so existing packs are unaffected.
   * Listing a kind can only ADD friction (REFUSE a contaminated proposal);
   * `minimumFor` is unchanged for every kind (the trust-rank floor is
   * untouched), so this NEVER relaxes a gate.
   */
  readonly originRequiredKinds?: ReadonlyArray<string>;
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
  //
  // 043 — `originRequiredKinds` is the OPT-IN origin-aware branch. When at least
  // one kind is declared, the returned policy ALSO carries
  // `requiresUncontaminatedOrigin` so the kernel gate refuses a contaminated-
  // origin proposal of those kinds (raising the effective minimum). When the
  // list is absent/empty the method is OMITTED entirely, so the policy shape is
  // byte-identical to pre-043 and the kernel gate behaves exactly as before.
  const originRequired = new Set(options.originRequiredKinds ?? []);
  const base: TaintPolicy = {
    minimumFor(kind) {
      return systemOnly.has(kind) ? systemMinimum : userMinimum;
    },
  };
  if (originRequired.size === 0) return base;
  return {
    ...base,
    requiresUncontaminatedOrigin(kind) {
      return originRequired.has(kind);
    },
  };
}
