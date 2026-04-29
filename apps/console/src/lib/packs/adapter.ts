import type { AuditRecord } from "@adjudicate/core";

/**
 * Structural minimum the Console reads from an installed Pack.
 *
 * `PackV0<Kind, Payload, State, Context>` is invariant in its type
 * parameters (`PolicyBundle<Kind, ...>` carries Kind contravariantly
 * through the guard signatures). A heterogeneous list of fully-typed
 * Packs therefore can't share a parent type without losing
 * Kind-narrowness — and we don't need it: the registry only reads
 * `id`, `version`, `intents`, and forwards `policy` opaquely to the
 * kernel via `as never`. Encoding only what we use here keeps the
 * adapter list assignable from any concrete `PackV0` instantiation
 * without per-adapter casts.
 */
export interface InstalledPackInfo {
  readonly id: string;
  readonly version: string;
  readonly intents: ReadonlyArray<string>;
  readonly policy: unknown;
}

/**
 * Console-side adapter for an installed adjudicate Pack.
 *
 * The framework's `PackV0` is domain-agnostic by design — the kernel,
 * conformance assertions, and tests don't need to understand the
 * difference between PIX (synchronous, atomic transactions) and KYC
 * (asynchronous, multi-stage state machine). The Console DOES need to
 * understand that difference: it must synthesize plausible state
 * per-domain, and surface the active Pack to operators reading the
 * audit log.
 *
 * `ConsolePackAdapter` is the integration boundary. Each Pack the
 * Console serves ships an adapter; `PackRegistry` looks up adapters by
 * intent kind. Adding a fourth Pack means writing one more adapter and
 * appending it to the registry — no edits in `replay-invoker.ts` or
 * the audit table.
 *
 * Why an adapter, not direct Pack imports across the Console?
 *   - Replay state synthesis: each domain's state shape differs (PIX:
 *     `charges` Map; KYC: `sessions` Map). A switch in `replay-invoker`
 *     would be a per-Pack growth point — the adapter encapsulates it.
 *   - UI labeling: "Replaying via Identity KYC" requires a
 *     human-readable name that doesn't belong on the kernel-side
 *     `PackV0` (which carries an `id` like `pack-identity-kyc`, fine
 *     for code, ugly in a header).
 *   - Forward extensibility: domain-specific trace rendering plugs in
 *     here without leaking back into the table or dialog components.
 */
export interface ConsolePackAdapter {
  /**
   * Installed Pack metadata (post-`installPack`, after
   * `withBasisAudit`). Typed structurally — see `InstalledPackInfo`
   * above for the variance rationale.
   */
  readonly pack: InstalledPackInfo;
  /**
   * Human-readable label shown in the Replay header and the Audit
   * Explorer's Pack column. Format: "Domain Subject" (e.g.,
   * "Identity KYC", "Payments PIX") — distinct from the
   * machine-readable `pack.id`.
   */
  readonly displayName: string;
  /**
   * Synthesize a plausible domain state for replaying the given record.
   * The returned shape must be valid input for the Pack's policy
   * guards. State fidelity is "synthetic" — see `replay-invoker.ts`
   * for the operator-facing caveat.
   *
   * Async by contract for forward compatibility (an adopter fork may
   * fetch state from a history table). Reference Console adapters
   * resolve immediately.
   */
  getSyntheticState(record: AuditRecord): Promise<unknown>;
}
