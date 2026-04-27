/**
 * Pack — the contract every domain Pack satisfies.
 *
 * A Pack is the unit of composability in the adjudicate platform: an
 * installable npm package that brings a domain (payments-pix, ordering,
 * billing) into an adopter's application. The Pack exposes:
 *
 *   - the intent kinds it handles
 *   - the PolicyBundle that adjudicates them
 *   - the CapabilityPlanner that decides which tools the LLM may see
 *   - the basis-code vocabulary the policy may emit (refusal taxonomy)
 *   - optional handlers that execute side effects after kernel returns EXECUTE
 *
 * `PackV0` is the v0.x contract — implicit-and-observed during Phases 1–3.
 * After Phase 3's two more Packs validate the shape, `PackV1` extracts and
 * the `-experimental` semver tag drops on all qualifying Packs.
 *
 * Conformance pattern (preferred):
 *
 * ```ts
 * import type { PackV0 } from "@adjudicate/core";
 *
 * export const myPack = {
 *   id: "pack-foo",
 *   version: "0.1.0-experimental",
 *   contract: "v0",
 *   intents: ["foo.create", "foo.cancel"],
 *   policy: fooPolicyBundle,
 *   planner: fooCapabilityPlanner,
 *   basisCodes: ["foo.created", "foo.cancelled"],
 * } as const satisfies PackV0<"foo.create" | "foo.cancel">;
 * ```
 *
 * The `satisfies` operator gives compile-time conformance without widening
 * the literal types — `myPack.intents` stays typed as the literal tuple.
 */

import type { PolicyBundle } from "./kernel/policy.js";
import type { CapabilityPlanner } from "./llm/planner.js";

export interface PackV0<
  Kind extends string = string,
  Payload = unknown,
  State = unknown,
  Context = unknown,
> {
  /**
   * Stable identifier for this Pack. Conventionally matches the npm
   * package name's last segment (`@adjudicate/pack-payments-pix` →
   * `"pack-payments-pix"`). Referenced in audit records and the (future)
   * Phase 6 governance dashboard.
   */
  readonly id: string;

  /** Pack semver. MUST match the `version` field in `package.json`. */
  readonly version: string;

  /**
   * Pack contract version. Always `"v0"` for PackV0.
   *
   * When the contract evolves (Phase 3 surfaces a breaking change in the
   * shape), `PackV1` ships and Packs upgrade their `contract` field. Lets
   * adjudicate-side tooling detect contract-version mismatches at install
   * time and refuse to load incompatible Packs.
   */
  readonly contract: "v0";

  /**
   * Intent kinds this Pack handles. Must be a non-empty list of unique
   * strings. The PolicyBundle and (optional) handlers below are typed
   * against this kind union.
   */
  readonly intents: ReadonlyArray<Kind>;

  /**
   * PolicyBundle that adjudicates the Pack's intents — the core authority
   * for what's allowed when. Per the kernel's evaluation order:
   * `state → auth → taint → business`.
   */
  readonly policy: PolicyBundle<Kind, Payload, State>;

  /**
   * CapabilityPlanner that decides which tools and intent kinds the LLM
   * sees per (state, context). Security-sensitive — adopters MUST unit-test
   * this at byte level.
   */
  readonly planner: CapabilityPlanner<State, Context>;

  /**
   * Basis codes the Pack's policy may emit. Declares the Pack's refusal
   * taxonomy. Phase 6's AaC review verifies that every basis emitted at
   * runtime is in this list — drift indicates either a missed declaration
   * or unauthorized vocabulary.
   */
  readonly basisCodes: ReadonlyArray<string>;

  /**
   * Optional: side-effect handlers keyed by intent kind. Executed by the
   * adopter after `adjudicate()` returns EXECUTE.
   *
   * Phase 1 keeps handlers as plain functions. Phase 2's `@adjudicate/tools`
   * introduces `ToolDefinition<I, O>` (versioned, schema-defined, signed) —
   * Packs migrate handler signatures onto that contract without changing
   * PackV0.
   */
  readonly handlers?: Readonly<Record<Kind, PackHandler<Payload, State>>>;

  /**
   * Optional: DEFER signal vocabulary (T4). When declared, every DEFER
   * Decision emitted by the Pack's policy must carry a `signal` from
   * this list — `withBasisAudit` records `basis_code_drift` for unknown
   * signals. Cross-pack signal collision (issue #38) can be detected at
   * boot if two packs declare overlapping signals; the framework leaves
   * that detection to a future Phase-2 registry.
   *
   * Adopters publishing to a shared NATS topic typically prefix their
   * signals with the pack id (e.g., `"pack-payments-pix:payment.confirmed"`)
   * to avoid collisions. The lighthouse Pack's signal is documented as
   * `"payment.confirmed"` per ADR-002 of pack-payments-pix.
   */
  readonly signals?: ReadonlyArray<string>;
}

/**
 * Side-effect handler for an intent kind.
 *
 * Receives the (possibly REWRITTEN) payload and current state; returns
 * whatever the side effect produces. The kernel never calls these directly
 * — they're invoked by the adopter's executor when adjudicate() returns
 * EXECUTE.
 *
 * Intentionally loose in v0; Phase 2's ToolDefinition tightens the
 * input/output contract via Zod schemas.
 */
export type PackHandler<Payload, State> = (
  payload: Payload,
  state: State,
) => Promise<unknown>;
