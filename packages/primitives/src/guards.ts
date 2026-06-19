/**
 * Layer 2 guard factories.
 *
 * The two factories here cover two patterns that BOTH existing Packs
 * (@adjudicate/pack-payments-pix and @adjudicate/pack-identity-kyc) hit
 * directly:
 *
 *   createThresholdGuard    — REFUSE/ESCALATE/EXECUTE/REQUEST_CONFIRMATION
 *                              when a numeric extracted from the envelope
 *                              crosses a threshold. PIX uses it for
 *                              refund-amount escalation; KYC uses it for
 *                              vendor-score outcomes.
 *
 *   createStateDeferGuard   — DEFER on a wire signal when an intent kind
 *                              matches (and optionally a state predicate
 *                              holds). PIX uses it for charge.create
 *                              awaiting the provider webhook; KYC uses
 *                              it for kyc.start / kyc.document.upload
 *                              awaiting external completion signals.
 *
 * Both factories are kept narrower than the kernel's `Guard` signature
 * deliberately: the caller specifies WHAT crosses the threshold and
 * WHAT the resulting Decision contains, but the factory owns the
 * "match → extract → compare" / "match → return DEFER" plumbing.
 * Inline guards remain available — these factories are a convenience,
 * not a constraint.
 */

import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  DEFAULT_SIDE_EFFECT_FLOOR,
  refuse,
  taintRank,
} from "@adjudicate/core";
import type {
  AuditRecord,
  Decision,
  DecisionBasis,
  IntentActor,
  IntentEnvelope,
  OwnershipFact,
  RefusalKind,
  SideEffectClass,
  Taint,
} from "@adjudicate/core";
import { attachGuardCodeArtifact, withMetadata, type Guard } from "@adjudicate/core/kernel";
import { assertSafePattern } from "./pii-patterns.js";
import {
  classifyCommand,
  stripDangerousFlags,
  DEFAULT_COMMAND_RULES,
  DEFAULT_FLAG_STRIP_RULES,
  type CommandClassification,
  type CommandRule,
  type FlagStripRule,
} from "./command-classify.js";

// ─── createThresholdGuard ──────────────────────────────────────────────────

/**
 * Numeric comparator. The factory engages `onCross` when:
 *
 *   ">="   value >= threshold
 *   "<="   value <= threshold
 *   ">"    value >  threshold
 *   "<"    value <  threshold
 *
 * Strict vs non-strict matters at the boundary: a Pack that REFUSEs at
 * `score < 50` (KYC) wants `<`, not `<=`. The factory does not assume.
 */
export type ThresholdComparator = ">=" | "<=" | ">" | "<";

export interface ThresholdGuardOptions<K extends string, P, S> {
  /**
   * Predicate engaging the guard. Typically `(env) => env.kind === "..."`,
   * but state-aware predicates are supported (e.g., "score AND session
   * is in VENDOR_PENDING"). Returning false short-circuits to `null`,
   * matching the kernel's "this guard has no opinion" semantics.
   */
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /**
   * Extract the numeric being compared. Returning `null`/`undefined`
   * also short-circuits — useful when the field is optional in the
   * payload schema and absence should *not* trigger the threshold.
   */
  readonly extract: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | null | undefined;
  /** Static threshold value. */
  readonly threshold: number;
  /** Comparator. Defaults to `">="`. */
  readonly comparator?: ThresholdComparator;
  /**
   * Build the Decision for the threshold-crossed case. The factory
   * does NOT prescribe the Decision kind — caller passes whatever's
   * appropriate (REFUSE for low score, ESCALATE for high refund,
   * EXECUTE for clear high score, etc.). Receives the value, the
   * threshold, the envelope, and the state for full context.
   */
  readonly onCross: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => Decision;
}

const COMPARATORS: Record<
  ThresholdComparator,
  (value: number, threshold: number) => boolean
> = {
  ">=": (v, t) => v >= t,
  "<=": (v, t) => v <= t,
  ">": (v, t) => v > t,
  "<": (v, t) => v < t,
};

export function createThresholdGuard<K extends string, P, S>(
  options: ThresholdGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const comparator = options.comparator ?? ">=";
  const compare = COMPARATORS[comparator];
  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const value = options.extract(envelope, state);
    if (value === null || value === undefined) return null;
    if (!compare(value, options.threshold)) return null;
    return options.onCross(value, options.threshold, envelope, state);
  };
  // Attach structured metadata describing the guard's shape (ADR-105).
  // `emits` is omitted — the factory does not introspect `onCross`. Pack
  // authors who need it can wrap with `withMetadata` themselves.
  return withMetadata(guard, {
    description: {
      kind: "threshold",
      threshold: options.threshold,
      comparator,
    },
  });
}

// ─── createStateDeferGuard ─────────────────────────────────────────────────

export interface StateDeferGuardOptions<K extends string, P, S> {
  /**
   * Predicate engaging the guard. Typically `(env) => env.kind === "..."`
   * for kinds that always DEFER (KYC's kyc.start), but state-aware
   * predicates support patterns like "DEFER only when the local payment
   * status isn't yet `confirmed`" (PIX's pending-charge case).
   */
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /** Wire signal the runtime parks the intent on. */
  readonly signal: string;
  /** DEFER timeout (ms). The runtime ages out the parked intent past this. */
  readonly timeoutMs: number;
  /**
   * Decision basis. Static for simple cases (KYC's stateless DEFERs);
   * a function for cases that want to surface state in the basis (e.g.,
   * "transition INIT→DOCS_REQUIRED" with the source status).
   */
  readonly basis:
    | ReadonlyArray<DecisionBasis>
    | ((
        envelope: IntentEnvelope<K, P>,
        state: S,
      ) => ReadonlyArray<DecisionBasis>);
}

export function createStateDeferGuard<K extends string, P, S>(
  options: StateDeferGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const basisList =
      typeof options.basis === "function"
        ? options.basis(envelope, state)
        : options.basis;
    return decisionDefer(options.signal, options.timeoutMs, basisList);
  };
  // Attach structured metadata (ADR-105). Signal + timeoutMs are static
  // factory inputs so capture is trivial; analyzers can answer "which
  // signals does this Pack park on?" by inspection.
  return withMetadata(guard, {
    description: {
      kind: "state_defer",
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    },
  });
}

// ─── createRewriteGuard (M2/T-024) ─────────────────────────────────────────

/**
 * REWRITE-clamping factory.
 *
 * Mints a guard that REWRITEs the envelope when a numeric value exceeds a
 * cap. The classic case is the PIX `clampRefundToOriginal` guard: a refund
 * request larger than the original charge gets clamped to the original.
 *
 * The factory builds the rewritten payload by replacing exactly the field
 * named in `mutateField` with `cap`. All other payload fields pass
 * through unchanged. The metadata records `mutatesPayloadFields: [field]`
 * so the M3 REWRITE-scope analyzer (ADR-104 + ADR-109 design) can verify
 * the guard's behavior matches its declared scope.
 *
 * Per ADR-105 rule 10: composes with `nameGuard` (the canonical
 * `nameGuard("clampRefundToOriginal", createRewriteGuard(...))` pattern).
 */
export interface RewriteGuardOptions<K extends string, P, S> {
  /** Predicate engaging the guard. `(env) => env.kind === "..."` typical. */
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /** Extract the numeric value being capped. Return null/undefined to skip. */
  readonly extract: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | null | undefined;
  /** Cap value (or function of state for state-derived caps like inventory). */
  readonly cap: number | ((state: S, envelope: IntentEnvelope<K, P>) => number);
  /** Payload field path to clamp. Single top-level field. */
  readonly mutateField: string;
  /** Human-readable reason recorded on the REWRITE decision. */
  readonly reason: string;
  /** Decision basis. Defaults to a single business:quantity_capped entry. */
  readonly basis?: (
    requested: number,
    capValue: number,
    envelope: IntentEnvelope<K, P>,
  ) => ReadonlyArray<DecisionBasis>;
}

/**
 * @experimental Awaiting Pack #4–#6 feedback; freeze at v1.1 per V1_FREEZE_MATRIX §row-187.
 */
export function createRewriteGuard<K extends string, P, S>(
  options: RewriteGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const requested = options.extract(envelope, state);
    if (requested === null || requested === undefined) return null;
    const capValue =
      typeof options.cap === "function" ? options.cap(state, envelope) : options.cap;
    if (requested <= capValue) return null;
    const newPayload: Record<string, unknown> = {
      ...(envelope.payload as Record<string, unknown>),
      [options.mutateField]: capValue,
    };
    const rewritten = buildEnvelope({
      kind: envelope.kind,
      payload: newPayload as P,
      actor: envelope.actor,
      taint: envelope.taint,
      nonce: envelope.nonce,
      createdAt: envelope.createdAt,
    });
    const basisList = options.basis
      ? options.basis(requested, capValue, envelope)
      : [
          basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
            field: options.mutateField,
            requested,
            cappedTo: capValue,
          }),
        ];
    return decisionRewrite(rewritten, options.reason, basisList);
  };
  // 081: expose the closure-captured cap (and the clamp body) to the
  // descriptor so the ConfigSeal binds guard CODE, not just metadata. The
  // `rewrite` GuardMetadata variant records only `mutatesPayloadFields` (its
  // released shape is immutable, ADR-105 rule 3), so editing
  // AUTO_REMEDIATION_BLAST_CAP 5→5000 produced a byte-identical sealable
  // surface (Critique #27). The code artifact closes that: a static numeric
  // cap is pinned under the mutated field's name; a state-derived cap function
  // is pinned by its source (a body edit is caught even though the runtime
  // value is not statically knowable).
  //
  // 082 — RESIDUAL BLIND SPOT (load-time enforcement must NOT over-claim).
  // `installPack({ verifyOnLoad })` now refuses a Pack whose config seal does
  // not verify, but a clean seal only proves the *sealed* code surface matches
  // what was signed — it is NOT a full proof of guard-body integrity:
  //   • a STATE-DERIVED `cap` (the `typeof options.cap === "function"` branch)
  //     pins the function SOURCE, not the runtime value it returns, so the
  //     actual clamp a given `state` produces is outside the digest; and
  //   • the seal binds only what the descriptor surfaces — a guard that exposes
  //     no `GuardCodeArtifact` contributes nothing to `guardCodeDigests`.
  // Therefore load-time enforcement (082) attests SIGNATURE + SEALED-SURFACE
  // provenance, not behavioral correctness of every closure. Closing the
  // remaining cap-pinning gap is 081's "sign guard code" scope (upstream); 082
  // relies on the seal here, it does not extend it.
  const codeArtifact =
    typeof options.cap === "number"
      ? { caps: { [options.mutateField]: options.cap }, source: guard.toString() }
      : { source: `${options.cap.toString()}|${guard.toString()}` };
  attachGuardCodeArtifact(guard, codeArtifact);
  return withMetadata(guard, {
    description: {
      kind: "rewrite",
      mutatesPayloadFields: [options.mutateField],
    },
  });
}

// ─── createConfirmGuard (M2/T-025) ─────────────────────────────────────────

/**
 * REQUEST_CONFIRMATION factory.
 *
 * Mints a guard that returns REQUEST_CONFIRMATION when a numeric value
 * exceeds a threshold. The user is prompted; on confirmation, the adapter
 * re-adjudicates with a confirmation receipt (kernel substitutes EXECUTE).
 *
 * Internally `createConfirmGuard` is a thin alias for `createThresholdGuard`
 * with `onCross` pinned to `decisionRequestConfirmation`. Ships as a
 * separate factory so Pack authors get domain-readable intent + the
 * analyzer can branch on the `emits` metadata field.
 */
export interface ConfirmGuardOptions<K extends string, P, S> {
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  readonly extract: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | null | undefined;
  readonly threshold: number;
  readonly comparator?: ThresholdComparator;
  /** Build the prompt shown to the user. Receives (value, threshold, envelope, state). */
  readonly prompt: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => string;
  /** Optional basis override. */
  readonly basis?: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
  ) => ReadonlyArray<DecisionBasis>;
}

/**
 * @experimental Awaiting Pack #4–#6 feedback; freeze at v1.1 per V1_FREEZE_MATRIX §row-184.
 */
export function createConfirmGuard<K extends string, P, S>(
  options: ConfirmGuardOptions<K, P, S>,
): Guard<K, P, S> {
  return createThresholdGuard<K, P, S>({
    matches: options.matches,
    extract: options.extract,
    threshold: options.threshold,
    comparator: options.comparator,
    onCross: (value, threshold, envelope, state) => {
      const basisList = options.basis
        ? options.basis(value, threshold, envelope)
        : [
            basis("business", BASIS_CODES.business.RULE_SATISFIED, {
              rule: "confirm_threshold_reached",
              threshold,
              value,
            }),
          ];
      return decisionRequestConfirmation(
        options.prompt(value, threshold, envelope, state),
        basisList,
      );
    },
  });
}

// ─── createEscalateGuard (M2/T-026) ────────────────────────────────────────

/**
 * ESCALATE factory.
 *
 * Mints a guard that returns ESCALATE when a threshold is crossed. The
 * canonical pattern is PIX's `escalateLargeRefunds` (refund ≥ R$1000 →
 * supervisor escalation).
 *
 * Thin alias for `createThresholdGuard` with `onCross` pinned to
 * `decisionEscalate`. Routes to `human` or `supervisor`.
 */
export interface EscalateGuardOptions<K extends string, P, S> {
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  readonly extract: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | null | undefined;
  readonly threshold: number;
  readonly comparator?: ThresholdComparator;
  /** Escalation route. */
  readonly to: "human" | "supervisor";
  /** Build the reason string. */
  readonly reason: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => string;
  readonly basis?: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
  ) => ReadonlyArray<DecisionBasis>;
}

/**
 * @experimental Awaiting Pack #4–#6 feedback; freeze at v1.1 per V1_FREEZE_MATRIX §row-185.
 */
export function createEscalateGuard<K extends string, P, S>(
  options: EscalateGuardOptions<K, P, S>,
): Guard<K, P, S> {
  return createThresholdGuard<K, P, S>({
    matches: options.matches,
    extract: options.extract,
    threshold: options.threshold,
    comparator: options.comparator,
    onCross: (value, threshold, envelope, state) => {
      const basisList = options.basis
        ? options.basis(value, threshold, envelope)
        : [
            basis("business", BASIS_CODES.business.RULE_SATISFIED, {
              rule: "escalation_threshold_reached",
              threshold,
              value,
            }),
          ];
      return decisionEscalate(
        options.to,
        options.reason(value, threshold, envelope, state),
        basisList,
      );
    },
  });
}

// ─── createIdempotencyGuard (M2/T-027) ─────────────────────────────────────

/**
 * Pure idempotency check.
 *
 * Mints a guard that REFUSEs with `STATE:idempotency_replay` when the
 * envelope's `nonce` (or a derived idempotency key) has been seen
 * within an adopter-supplied predicate. **This is NOT a substitute for
 * the kernel's Execution Ledger** — the ledger is the production-grade
 * dedup substrate; this factory is for Pack-author-declared idempotency
 * checks against domain state (e.g., "this purchase order ID was
 * already filled").
 *
 * Note that the kernel itself enforces `intentHash`-keyed replay
 * suppression via `Ledger.recordExecution`. Use this factory for
 * *domain-level* idempotency that lives in adopter state, not for
 * the framework-level `intentHash` dedup the ledger already handles.
 */
export interface IdempotencyGuardOptions<K extends string, P, S> {
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /**
   * Extract the idempotency key from envelope + state. Typically a
   * payload field (orderId, purchaseId, vendorRequestId) — NOT the
   * envelope's nonce (which the kernel-level ledger already handles).
   */
  readonly extractKey: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => string | null | undefined;
  /**
   * Returns true when the key has been seen and the operation should
   * be suppressed. Adopter reads from their domain state (e.g.,
   * `state.processedOrderIds.has(key)`).
   */
  readonly hasBeenSeen: (
    key: string,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /**
   * Build the refusal Decision. Receives the key + envelope so callers
   * can carry it in basis.detail.
   */
  readonly onReplay: (
    key: string,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => Decision;
}

/**
 * @experimental Domain-level dedup; intersects with ledger semantics — awaiting Pack #4 evidence per V1_FREEZE_MATRIX §row-186.
 */
export function createIdempotencyGuard<K extends string, P, S>(
  options: IdempotencyGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const key = options.extractKey(envelope, state);
    if (key === null || key === undefined || key.length === 0) return null;
    if (!options.hasBeenSeen(key, envelope, state)) return null;
    return options.onReplay(key, envelope, state);
  };
  return withMetadata(guard, {
    description: { kind: "opaque", note: "domain-level idempotency check" },
  });
}

// ─── requireTenantBinding (AuthReviewer-009 / RC-A1 D-12) ───────────────────

/**
 * Pack-level tenant authGuard. Enforces that the envelope's actor is bound to the
 * tenant carried by `state`. Authz flows through the guard + adopter-supplied `state`,
 * NOT through the kernel RuntimeContext (a Guard never receives it) — the principal
 * stays provenance-only. The guard reads `(envelope.actor, state)` and returns a REFUSE
 * on a binding violation, touching NEITHER the principal shape NOR any hashed byte
 * (cycle-19 D-12). Browser-safe: pure logic, no node:crypto / Buffer.
 *
 * The `isActorBoundToTenant` predicate is adopter-supplied: a single-tenant adopter
 * passes a trivially-true predicate (the guard is then a no-op scaffold, wired ahead of
 * the multi-tenant actor model); a multi-tenant adopter compares the actor's resolved
 * tenant to the tenant in `state`.
 */
export function requireTenantBinding<K extends string, P, S>(
  isActorBoundToTenant: (actor: IntentActor, state: S) => boolean,
): Guard<K, P, S> {
  return (envelope, state) =>
    isActorBoundToTenant(envelope.actor, state)
      ? null
      : decisionRefuse(
          refuse(
            "SECURITY",
            "tenant_binding_violation",
            "Não consigo concluir essa ação.",
            "actor is not bound to the tenant in state",
          ),
          [basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT)],
        );
}

// ─── ownershipBindingPredicate (032 — authority-graph fact seam) ─────────────

/**
 * Align the 032 authority-graph FACT to the existing `requireTenantBinding`
 * predicate seam — `(actor: IntentActor, state: S) => boolean` — so plan 034 can
 * wire a constitutional authority guard onto a pack's `authGuards` WITHOUT
 * reshaping the fact. **This is the seam only; 032 wires NO guard.**
 *
 * Given a `resolveFact` that produces an `OwnershipFact` from `(actor, state)`
 * (a 034 adopter closes over its injected `AuthorityGraphStore`/envelope when it
 * builds the guard), this returns the boolean predicate `requireTenantBinding`
 * expects: `true` (actor is bound ⇒ guard PASSES, returns `null`) iff the fact's
 * `bound` predicate holds. The mapping is deliberately the IDENTITY on `bound`
 * — the resolver computes the predicate; this only adapts the shape. No
 * authorization happens here (index §B): a `false` makes `requireTenantBinding`
 * REFUSE (raise friction), never EXECUTE.
 *
 * Pure: a total function of the supplied fact resolver; no clock/RNG/IO.
 */
export function ownershipBindingPredicate<S>(
  resolveFact: (actor: IntentActor, state: S) => OwnershipFact,
): (actor: IntentActor, state: S) => boolean {
  return (actor, state) => resolveFact(actor, state).bound;
}

// ─── createAuthorityGuard (034 — constitutional authority guard) ─────────────

/**
 * Constitutional authority guard (034). Ships a real, FAIL-CLOSED authority
 * guard primitive: a mutating UNTRUSTED-min kind can no longer reach `EXECUTE`
 * without an owner predicate firing (constitutional invariant §D #8).
 *
 * Shape & placement. It returns a kernel `Guard<K,P,S> = (envelope, state) =>
 * Decision | null` — the SAME arity-2 contract every guard honors (the kernel
 * never passes identity/RuntimeContext to a guard; the `IntentActor` stays
 * provenance-only, so the authority FACT must flow through the injected `state`,
 * `packages/core/src/kernel/policy.ts`). 034 ships ONLY this primitive; the
 * per-pack wiring into `authGuards` — preserving kernel order
 * `state→taint→auth→business` so taint short-circuits before auth (§D #3) — is
 * 035's single-owner job. This factory supersedes `requireTenantBinding` as the
 * authority primitive 035 wires.
 *
 * Resolver seam. `resolveOwner(envelope, state)` produces the `OwnershipFact`
 * (032's `resolveOwnership(store, envelope)`) for the payload's resource from the
 * injected authority-graph snapshot (032/033). A 034/035 adopter closes over its
 * injected `AuthorityGraphStore` (read from `state`) when it builds the guard;
 * the resolver reads the envelope's `resourceRefs` (031) for the (principal,
 * resource) pair. The resolver computes a deterministic FACT — it NEVER returns
 * a `Decision` and NEVER authorizes (index §B): this guard is the only thing that
 * turns the fact into friction.
 *
 * ⚠️ KNOWN RESIDUAL — the BARE ownership-binding wiring does NOT close the IDOR
 * class (handed to a later plan). Under the canonical wiring
 * `resolveOwner=(env,store)=>resolveOwnership(store,env)`, the OwnershipFact's
 * `principal` is read from `envelope.resourceRefs.owner` — an ATTACKER-CONTROLLED
 * envelope field (031). Nothing in the bare wiring ties that declared owner to
 * the AUTHENTICATED actor, because there is no authenticated identity to bind
 * to: `IntentActor.principal` is the provenance enum `"llm"|"user"|"system"`
 * only (`packages/core/src/envelope.ts`), it carries NO owner/account identity,
 * and `attestation` (`KernelIdentity.attest`) is an unimplemented stub. So a
 * caller that forges `resourceRefs.owner = <a real, snapshot-bound victim
 * principal>` PASSES the bare check (the snapshot binds that victim to the
 * resource), even though the AUTHENTICATED session is not that principal. The
 * bare wiring therefore enforces "the DECLARED owner genuinely owns the resource"
 * — a real and useful invariant — but it does NOT enforce "the AUTHENTICATED
 * actor IS that owner", which is what closes IDOR. Closing IDOR requires an
 * authenticated principal on the auth path; this primitive exposes the seam for
 * it (`authenticatedPrincipal`, below) but the AUTHENTICATED-IDENTITY DATA MODEL
 * (an actor with a verifiable resolved identity, not the provenance enum) is a
 * pre-existing residual 034 cannot itself close — it is handed forward to the
 * actor-attestation / v3-actor-model plan. Do NOT wire the BARE resolver onto a
 * mutating kind and call it IDOR-closed; supply `authenticatedPrincipal` (or wait
 * for the actor-identity plan) to actually defend IDOR.
 *
 * Closing IDOR — the `authenticatedPrincipal` seam. When the host CAN supply the
 * acting principal from the AUTHENTICATED side (`envelope.actor` or a host
 * identity map keyed by `actor.sessionId` — NEVER `resourceRefs.owner`), pass
 * `options.authenticatedPrincipal`. The guard then additionally REQUIRES the
 * resolved owner principal (`fact.principal`) to EQUAL the authenticated
 * principal — a forged `resourceRefs.owner` naming a victim no longer passes,
 * because the authenticated session is not that victim. With the seam supplied,
 * the guard genuinely closes the IDOR class for the kinds it is wired onto.
 *
 * Fail-closed (§D #6). The guard returns `null` (continue) ONLY when the fact's
 * `bound` predicate is `true` AND (when `authenticatedPrincipal` is supplied) the
 * resolved owner principal equals the authenticated principal. EVERY other case
 * REFUSEs:
 *   - declared owner not bound to the resource (no binding edge) ⇒ REFUSE;
 *   - absent/unresolvable owner — a missing `resourceRefs` ref yields a `null`
 *     principal/resource and `bound: false` ⇒ REFUSE;
 *   - authenticated-principal mismatch (forged owner ≠ authenticated actor, or an
 *     absent/`null` authenticated principal when the seam is supplied) ⇒ REFUSE;
 *   - a `resolveOwner` or `authenticatedPrincipal` that THROWS (an absent/
 *     misconfigured graph store / identity map) is caught and REFUSEd, never
 *     propagated as a fail-open `null`.
 * There is no code path that returns `null` on an unresolvable owner or an
 * unresolved authenticated principal — absence defaults to friction, never
 * bypass (§C monotonicity: this is `EXECUTE→REFUSE` only, friction-increasing).
 *
 * Refusal codes. On any non-bound / mismatched outcome it REFUSEs `SECURITY` /
 * `tenant_binding_violation` with basis `auth.SCOPE_INSUFFICIENT` — the SAME
 * test-pinned codes `requireTenantBinding` emits, so the IDOR-class refusal
 * surfaces under one stable code across both authority primitives.
 *
 * Decision algebra (§D #2). Emits only members of the closed 6-outcome `Decision`
 * union (`REFUSE` | `null`); adds no `confidence`/free `metadata` to the Decision.
 *
 * Pure & synchronous (§D, invariant #5): a deterministic function of the supplied
 * resolver over `(envelope, state)`; no clock/RNG/IO on any path. Browser-safe.
 */
export interface AuthorityGuardOptions<K extends string, P, S> {
  /**
   * Optional predicate scoping the guard to specific kinds. Returning `false`
   * short-circuits to `null` (the guard has no opinion on out-of-scope kinds —
   * those are governed by their own guards/taint floor). When omitted the guard
   * applies to EVERY kind it is wired onto (fail-closed: no implicit exemption).
   */
  readonly matches?: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /**
   * IDOR-closing seam. Resolves the AUTHENTICATED acting principal from the
   * envelope's actor (or a host identity map in `state` keyed by
   * `actor.sessionId`) — NEVER from `resourceRefs.owner` (which is
   * attacker-controlled). When supplied, the guard additionally REQUIRES the
   * resolved owner principal (`OwnershipFact.principal`) to EQUAL this
   * authenticated principal, so a forged `resourceRefs.owner` naming a real
   * (snapshot-bound) victim no longer passes. Return `null` for an
   * unauthenticated/unresolvable session — the guard then REFUSEs (fail-closed),
   * never bypasses. WITHOUT this seam the guard only checks that the DECLARED
   * owner owns the resource and does NOT close the IDOR class (see the
   * doc-comment residual). A throwing resolver is caught and REFUSEd.
   */
  readonly authenticatedPrincipal?: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => string | null;
  /** User-facing refusal text. Defaults to the neutral PT-BR string `requireTenantBinding` uses. */
  readonly refusalUserFacing?: string;
}

export function createAuthorityGuard<K extends string, P, S>(
  resolveOwner: (envelope: IntentEnvelope<K, P>, state: S) => OwnershipFact,
  options: AuthorityGuardOptions<K, P, S> = {},
): Guard<K, P, S> {
  const refusalUserFacing =
    options.refusalUserFacing ?? "Não consigo concluir essa ação.";

  const refuseUnbound = (detail: string, fact?: OwnershipFact): Decision =>
    decisionRefuse(
      refuse("SECURITY", "tenant_binding_violation", refusalUserFacing, detail),
      [
        basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT, {
          rule: "authority_guard",
          principal: fact?.principal ?? null,
          resource: fact?.resource ?? null,
          bound: fact?.bound ?? false,
        }),
      ],
    );

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (options.matches && !options.matches(envelope, state)) return null;

    let fact: OwnershipFact;
    try {
      fact = resolveOwner(envelope, state);
    } catch {
      // A throwing resolver = absent/misconfigured authority-graph snapshot.
      // Fail CLOSED: REFUSE, never propagate as a fail-open `null`.
      return refuseUnbound("owner could not be resolved (resolver threw)");
    }

    // First gate: the DECLARED owner must genuinely own the resource. Absent/
    // unresolvable owner (`bound: false`) ⇒ REFUSE.
    if (!fact.bound) {
      return refuseUnbound(
        "declared owner is not bound to the resource (no authority-graph edge)",
        fact,
      );
    }

    // Second gate (IDOR-closing) — ONLY when the host supplies an authenticated
    // principal. The declared owner (`fact.principal`, read from the
    // attacker-controlled `resourceRefs.owner`) MUST equal the AUTHENTICATED
    // acting principal; otherwise a caller can forge a real victim's owner ref.
    // WITHOUT the seam this gate is skipped and the guard does NOT close IDOR
    // (documented residual) — it only enforces "declared owner owns resource".
    if (options.authenticatedPrincipal) {
      let authedPrincipal: string | null;
      try {
        authedPrincipal = options.authenticatedPrincipal(envelope, state);
      } catch {
        // A throwing identity resolver = absent/misconfigured identity map.
        // Fail CLOSED: REFUSE, never bypass.
        return refuseUnbound(
          "authenticated principal could not be resolved (resolver threw)",
          fact,
        );
      }
      if (authedPrincipal === null || authedPrincipal !== fact.principal) {
        return refuseUnbound(
          "authenticated actor is not the declared resource owner (IDOR: forged owner ref)",
          fact,
        );
      }
    }

    // `null` (continue): the declared owner owns the resource AND — when the
    // seam is supplied — the authenticated actor IS that owner.
    return null;
  };

  return withMetadata(guard, {
    description: { kind: "opaque", note: "constitutional authority guard" },
  });
}

// ─── createDataClassificationGuard (PII / data-classification, ADR-117) ──────

/**
 * Data-classification / PII guard factory.
 *
 * Inspects a whitelisted set of payload fields for sensitive-data patterns
 * (SSN, account numbers, PHI/MPI, …) and, on detection, either:
 *
 *   - **REWRITE** — masks the matched substrings in the matched fields and
 *     re-emits the envelope with the redacted payload (field-level redaction),
 *     or
 *   - **REFUSE** — blocks the intent with a SECURITY refusal.
 *
 * **Taint is preserved verbatim** on the REWRITE path (`taint: envelope.taint`)
 * — redaction removes the *content* but does not declassify the envelope, so it
 * can never raise taint and never trips the `rewrite_taint_regression` drift
 * signal. Declassification would require field-level taint (deferred).
 *
 * **Two channels for `sensitivityLevel`, by design (ADR-117):** the static
 * `GuardDescription.data_classification` metadata carries it for analyzers; the
 * runtime `DecisionBasis.detail.sensitivityLevel` carries it for the audit
 * record / console (guard metadata is never serialized into an AuditRecord).
 * Likewise the static `scannedFields` whitelist declares *permitted* scope while
 * runtime `detail.redactedFields` records the subset that actually fired.
 *
 * Pure: regex evaluation over `envelope.payload`, no clock/I/O/RNG. Patterns
 * and fields are iterated in declared order so `detectedPatterns` /
 * `redactedFields` are deterministically ordered (matters for the replay
 * basis-set comparison).
 */
export type SensitivityLevel = "low" | "medium" | "high" | "critical";

export interface DataClassificationPattern {
  /** Stable id for audit detail + dedup, e.g. "ssn", "cpf", "pan". */
  readonly id: string;
  /** Regex matched against stringified leaf field values. */
  readonly pattern: RegExp;
  /**
   * Redaction replacement applied per-match when `action: "REWRITE"`. Receives
   * the matched substring; returns the masked string. Defaults to a fixed
   * `[REDACTED]` token when omitted.
   */
  readonly redact?: (match: string) => string;
}

export interface DataClassificationGuardOptions<K extends string, P, S> {
  /** Predicate engaging the guard. `(env) => env.kind === "..."` typical. */
  readonly matches: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** Patterns to scan for. */
  readonly patterns: ReadonlyArray<DataClassificationPattern>;
  /**
   * Whitelist of payload field paths to scan (dotted paths: `["note",
   * "items.0.memo"]`). Required + non-empty so the static
   * `GuardDescription.scannedFields` can declare scope (AJD-104 parity).
   */
  readonly scannedFields: ReadonlyArray<string>;
  /**
   * Disposition on detection. NOTE: observe-only "SHADOW" is intentionally NOT
   * a value here — modelling shadow as a no-op REWRITE would force-execute the
   * payload and skip later guards (ADR-141 §4.6). Use the out-of-path
   * `createDataClassificationShadowProvider` for observe-only detection.
   */
  readonly action: "REWRITE" | "REFUSE";
  /** Sensitivity tag surfaced in metadata AND `basis.detail`. */
  readonly sensitivityLevel: SensitivityLevel;
  /**
   * Skip scanning any field whose stringified value exceeds this length. A
   * second line of defense against pathological/quadratic patterns scanning
   * attacker-controlled free text — NOT a substitute for keeping the patterns
   * linear (`assertSafePattern` is a best-effort heuristic, not a proof). Any
   * guard that scans an UNTRUSTED free-text field SHOULD set this. Oversized
   * fields are NOT scanned (fail-open on size). Default: unbounded.
   */
  readonly maxInputLength?: number;
  /** REWRITE reason text. Defaults to a fixed string. */
  readonly reason?: string;
  /** REFUSE user-facing text. Defaults to "I can't process that data." */
  readonly userFacing?: string;
}

const DEFAULT_REDACT_TOKEN = "[REDACTED]";

/** Resolve a dotted path (`a.b.0.c`) against a value. Returns undefined if absent. */
function getPath(root: unknown, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Set a dotted path on a mutable clone. No-op if an intermediate node is missing. */
function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const next = cursor[segments[i]!];
    if (next === null || typeof next !== "object") return;
    cursor = next as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/** Non-global tester (avoids shared-lastIndex statefulness of a `/g` regex). */
function testPattern(p: RegExp, value: string): boolean {
  const flags = p.flags.replace("g", "");
  return new RegExp(p.source, flags).test(value);
}

/** Global replacer for redaction (fresh regex so lastIndex never leaks). */
function redactWith(p: RegExp, value: string, redact: (m: string) => string): string {
  const flags = p.flags.includes("g") ? p.flags : `${p.flags}g`;
  return value.replace(new RegExp(p.source, flags), (m) => redact(m));
}

export function createDataClassificationGuard<K extends string, P, S>(
  options: DataClassificationGuardOptions<K, P, S>,
): Guard<K, P, S> {
  if (options.scannedFields.length === 0) {
    throw new Error(
      "createDataClassificationGuard: scannedFields must be non-empty (declares the permitted scan/redact scope).",
    );
  }
  // ReDoS guard: reject catastrophic-backtracking patterns at construction.
  for (const p of options.patterns) assertSafePattern(p.pattern, p.id);
  const reason = options.reason ?? "Redacted classified data from payload.";
  const userFacing = options.userFacing ?? "I can't process that data.";

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const payload = envelope.payload;
    // Trust-boundary: a non-object payload cannot be scanned — no opinion.
    if (payload === null || typeof payload !== "object") return null;

    const detectedPatterns: string[] = [];
    const redactedFields: string[] = [];
    // Built lazily, only for the REWRITE path.
    let clone: Record<string, unknown> | null = null;

    for (const field of options.scannedFields) {
      const value = getPath(payload, field);
      if (typeof value !== "string") continue;
      // Oversized field: skip scanning (fail-open on size).
      if (options.maxInputLength !== undefined && value.length > options.maxInputLength) continue;
      let fieldMatched = false;
      let redacted = value;
      for (const p of options.patterns) {
        if (testPattern(p.pattern, value)) {
          fieldMatched = true;
          if (!detectedPatterns.includes(p.id)) detectedPatterns.push(p.id);
          // Redact only patterns that actually matched (§4.6 — was redacting
          // with every pattern's regex regardless, a wasted pass).
          if (options.action === "REWRITE") {
            redacted = redactWith(p.pattern, redacted, p.redact ?? (() => DEFAULT_REDACT_TOKEN));
          }
        }
      }
      if (fieldMatched) {
        redactedFields.push(field);
        if (options.action === "REWRITE") {
          if (clone === null) clone = structuredClone(payload) as Record<string, unknown>;
          setPath(clone, field, redacted);
        }
      }
    }

    if (detectedPatterns.length === 0) return null;

    if (options.action === "REFUSE") {
      return decisionRefuse(
        refuse("SECURITY", "pii_blocked", userFacing, `detected ${detectedPatterns.join(", ")} in ${redactedFields.join(", ")}`),
        [
          basis("validation", BASIS_CODES.validation.PII_BLOCKED, {
            sensitivityLevel: options.sensitivityLevel,
            detectedPatterns,
            fields: redactedFields,
          }),
        ],
      );
    }

    const rewritten = buildEnvelope({
      kind: envelope.kind,
      payload: (clone ?? (payload as Record<string, unknown>)) as P,
      actor: envelope.actor,
      taint: envelope.taint,
      nonce: envelope.nonce,
      createdAt: envelope.createdAt,
    });
    return decisionRewrite(rewritten, reason, [
      basis("validation", BASIS_CODES.validation.PII_REDACTED, {
        sensitivityLevel: options.sensitivityLevel,
        detectedPatterns,
        redactedFields,
      }),
    ]);
  };

  return withMetadata(guard, {
    description: {
      kind: "data_classification",
      sensitivityLevel: options.sensitivityLevel,
      action: options.action,
      scannedFields: [...options.scannedFields],
    },
  });
}

/**
 * Out-of-path SHADOW detection (ADR-141 §4.6). Observe-only PII detection that
 * NEVER changes the Decision: it rides the post-decision `metadataProvider` seam
 * (hash-EXCLUDED, exactly like hallucination scoring), so it cannot force-execute
 * a payload or skip later guards the way a "SHADOW REWRITE" would. Pair with
 * `adjudicateAndAudit({ metadataProvider })`; it attaches
 * `{ pii_shadow_detected, pii_shadow_fields, pii_shadow_sensitivity }` only when
 * something matched, and `undefined` otherwise (so byte-identical audit hashes
 * are preserved for clean records). Pure — same scan as the guard, no I/O.
 */
export function createDataClassificationShadowProvider(options: {
  readonly patterns: ReadonlyArray<DataClassificationPattern>;
  readonly scannedFields: ReadonlyArray<string>;
  readonly sensitivityLevel: SensitivityLevel;
  readonly maxInputLength?: number;
  /** Restrict scanning to matching records (default: every record). */
  readonly matches?: (record: AuditRecord) => boolean;
}): {
  readonly metadataProvider: (record: AuditRecord) => Readonly<Record<string, unknown>> | undefined;
} {
  if (options.scannedFields.length === 0) {
    throw new Error("createDataClassificationShadowProvider: scannedFields must be non-empty.");
  }
  for (const p of options.patterns) assertSafePattern(p.pattern, p.id);
  return {
    metadataProvider(record) {
      if (options.matches && !options.matches(record)) return undefined;
      const payload = record.envelope?.payload;
      if (payload === null || typeof payload !== "object") return undefined;
      const detectedPatterns: string[] = [];
      const fields: string[] = [];
      for (const field of options.scannedFields) {
        const value = getPath(payload, field);
        if (typeof value !== "string") continue;
        if (options.maxInputLength !== undefined && value.length > options.maxInputLength) continue;
        let matched = false;
        for (const p of options.patterns) {
          if (testPattern(p.pattern, value)) {
            matched = true;
            if (!detectedPatterns.includes(p.id)) detectedPatterns.push(p.id);
          }
        }
        if (matched) fields.push(field);
      }
      if (detectedPatterns.length === 0) return undefined;
      return {
        pii_shadow_detected: detectedPatterns,
        pii_shadow_fields: fields,
        pii_shadow_sensitivity: options.sensitivityLevel,
      };
    },
  };
}

// ─── createTokenBudgetGuard (cost control, ADR-120) ─────────────────────────

/**
 * Token-budget guard factory.
 *
 * A pure guard that REFUSEs (or DEFERs) when cumulative LLM token consumption
 * crosses a per-session or per-tenant budget.
 *
 * **Determinism note (corrects the roadmap):** guards never receive
 * `RuntimeContext`, and `RuntimeContext` is a singletons-only container — NOT
 * decision-input data. So `tokensConsumed` lives in the adopter's **state `S`**
 * (which guards do receive), read here via `extractSessionTokens` /
 * `extractTenantTokens`. The adapter updates the counter AFTER each LLM
 * response (via `AssistantTurn.usage` + the `onTokenUsage` hook) and folds it
 * into the next `S`. Given a fixed `S` the decision is pure and replayable.
 *
 * DEFER has no natural external resume signal (unlike a webhook), so REFUSE is
 * the default/primary action; DEFER parks on an adopter-emitted
 * `token_budget_reset` signal.
 *
 * Metadata is `{ kind: "opaque" }` — the guard is a numeric-crossing shape but
 * spans two scopes, so it does not fit the closed `threshold` variant; opaque
 * is the sanctioned escape hatch (no `GuardDescription` widening).
 */
export type TokenBudgetAction = "REFUSE" | "DEFER";

export interface TokenBudgetGuardOptions<K extends string, P, S> {
  /** Engage predicate. Defaults to "always engage" when omitted. */
  readonly matches?: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** Read session-scoped tokens consumed so far from adopter state S. */
  readonly extractSessionTokens: (state: S, envelope: IntentEnvelope<K, P>) => number;
  /** Read tenant-scoped tokens consumed. Required iff `tenantBudget` is set. */
  readonly extractTenantTokens?: (state: S, envelope: IntentEnvelope<K, P>) => number;
  /** Per-session cap. At least one of sessionBudget/tenantBudget is required. */
  readonly sessionBudget?: number;
  /** Per-tenant cap. */
  readonly tenantBudget?: number;
  /** What to do when a budget is crossed. Defaults to "REFUSE". */
  readonly action?: TokenBudgetAction;
  /** Signal to park on when action === "DEFER". Defaults to "token_budget_reset". */
  readonly deferSignal?: string;
  /** DEFER timeout (ms). Required when action === "DEFER". */
  readonly deferTimeoutMs?: number;
  /** User-facing refusal text (REFUSE action). */
  readonly userFacing?: string;
}

export function createTokenBudgetGuard<K extends string, P, S>(
  options: TokenBudgetGuardOptions<K, P, S>,
): Guard<K, P, S> {
  if (options.sessionBudget === undefined && options.tenantBudget === undefined) {
    throw new Error(
      "createTokenBudgetGuard: at least one of sessionBudget / tenantBudget is required.",
    );
  }
  const action = options.action ?? "REFUSE";
  if (action === "DEFER" && options.deferTimeoutMs === undefined) {
    throw new Error("createTokenBudgetGuard: deferTimeoutMs is required when action is DEFER.");
  }
  if (options.tenantBudget !== undefined && options.extractTenantTokens === undefined) {
    throw new Error("createTokenBudgetGuard: extractTenantTokens is required when tenantBudget is set.");
  }
  const userFacing = options.userFacing ?? "Token budget exhausted for this session.";
  const deferSignal = options.deferSignal ?? "token_budget_reset";

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (options.matches && !options.matches(envelope, state)) return null;

    let scope: "session" | "tenant" | null = null;
    let consumed = 0;
    let budget = 0;
    if (options.sessionBudget !== undefined) {
      const session = options.extractSessionTokens(state, envelope);
      // Fail-CLOSED on a definitively-over meter: +Infinity ≥ any finite budget,
      // so it crosses (REFUSE) — a broken/overflowed accumulator must NOT let an
      // over-budget session through. Only NaN (an uninterpretable reading, whose
      // comparisons are all false) and genuinely sub-budget values pass.
      if (!Number.isNaN(session) && session >= options.sessionBudget) {
        scope = "session";
        consumed = session;
        budget = options.sessionBudget;
      }
    }
    if (scope === null && options.tenantBudget !== undefined && options.extractTenantTokens) {
      const tenant = options.extractTenantTokens(state, envelope);
      if (!Number.isNaN(tenant) && tenant >= options.tenantBudget) {
        scope = "tenant";
        consumed = tenant;
        budget = options.tenantBudget;
      }
    }
    if (scope === null) return null;

    const detail = { rule: "token_budget", scope, consumed, budget };
    if (action === "DEFER") {
      return decisionDefer(deferSignal, options.deferTimeoutMs!, [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, detail),
      ]);
    }
    return decisionRefuse(
      refuse("BUSINESS_RULE", "token_budget.exhausted", userFacing, `${scope} budget ${budget} reached (consumed ${consumed})`),
      [basis("business", BASIS_CODES.business.RULE_VIOLATED, detail)],
    );
  };

  return withMetadata(guard, {
    description: { kind: "opaque", note: "token budget guard (session/tenant)" },
  });
}

// ─── createCommandRiskGuard (CLI/terminal safety, ADR-123) ──────────────────

/**
 * Command-risk guard factory for CLI/terminal agents.
 *
 * Classifies a proposed shell command via a pure rule table and returns:
 *   - REFUSE for irrecoverable risk,
 *   - REWRITE when a dangerous flag can be stripped (taint preserved verbatim),
 *   - REQUEST_CONFIRMATION otherwise (network / credential / recoverable).
 *
 * Metadata is `{ kind: "opaque" }` — the guard is multi-disposition and does not
 * fit a single structured `GuardDescription` variant.
 */
export interface CommandRiskGuardOptions<K extends string, P, S> {
  readonly matches: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** Extract the proposed command string. null/undefined short-circuits to null. */
  readonly extractCommand: (envelope: IntentEnvelope<K, P>, state: S) => string | null | undefined;
  /** Payload field holding the command (REWRITE mutation target). */
  readonly commandField: string;
  /** Override the rule table; defaults to DEFAULT_COMMAND_RULES. */
  readonly rules?: ReadonlyArray<CommandRule>;
  /** Override flag-strip rules; defaults to DEFAULT_FLAG_STRIP_RULES. */
  readonly flagStripRules?: ReadonlyArray<FlagStripRule>;
  /** Optional adopter allowlist read from state/command — true → null (no opinion). */
  readonly allow?: (command: string, envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** Prompt builder for the REQUEST_CONFIRMATION case. */
  readonly prompt?: (c: CommandClassification, command: string) => string;
  /** User-facing refusal text for the REFUSE case. */
  readonly refusalUserFacing?: string;
}

export function createCommandRiskGuard<K extends string, P, S>(
  options: CommandRiskGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const rules = options.rules ?? DEFAULT_COMMAND_RULES;
  const flagRules = options.flagStripRules ?? DEFAULT_FLAG_STRIP_RULES;
  const refusalUserFacing = options.refusalUserFacing ?? "I can't run that command.";

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const command = options.extractCommand(envelope, state);
    if (command === null || command === undefined || command.length === 0) return null;
    if (options.allow && options.allow(command, envelope, state)) return null;

    const classification = classifyCommand(command, rules);
    if (classification.disposition === "safe") return null;

    const detailBase = {
      category: classification.category,
      matchedRuleIds: classification.matchedRuleIds,
      command,
    };

    if (classification.disposition === "refuse") {
      // Try a sanitizing REWRITE first; if flags strip AND the sanitized
      // command de-escalates below "refuse", REWRITE instead of REFUSE.
      const { command: sanitized, stripped } = stripDangerousFlags(command, flagRules);
      if (stripped.length > 0 && classifyCommand(sanitized, rules).disposition !== "refuse") {
        return rewriteCommand(envelope, options.commandField, sanitized, stripped, detailBase);
      }
      return decisionRefuse(
        refuse("SECURITY", "command_risk_blocked", refusalUserFacing, `${classification.category}: ${classification.matchedRuleIds.join(", ")}`),
        [basis("validation", BASIS_CODES.validation.COMMAND_BLOCKED, detailBase)],
      );
    }

    // Recoverable risk: REWRITE if a flag is strippable, else REQUEST_CONFIRMATION.
    const { command: sanitized, stripped } = stripDangerousFlags(command, flagRules);
    if (stripped.length > 0) {
      return rewriteCommand(envelope, options.commandField, sanitized, stripped, detailBase);
    }
    const prompt = options.prompt
      ? options.prompt(classification, command)
      : `Confirm ${classification.category} command: ${command}`;
    return decisionRequestConfirmation(prompt, [
      basis("business", BASIS_CODES.business.RULE_SATISFIED, {
        rule: "command_risk_confirm",
        ...detailBase,
      }),
    ]);
  };

  return withMetadata(guard, {
    description: { kind: "opaque", note: "command-risk classifier" },
  });
}

function rewriteCommand<K extends string, P>(
  envelope: IntentEnvelope<K, P>,
  commandField: string,
  sanitized: string,
  stripped: ReadonlyArray<string>,
  detailBase: Record<string, unknown>,
): Decision {
  const newPayload: Record<string, unknown> = {
    ...(envelope.payload as Record<string, unknown>),
    [commandField]: sanitized,
  };
  const rewritten = buildEnvelope({
    kind: envelope.kind,
    payload: newPayload as P,
    actor: envelope.actor,
    taint: envelope.taint, // never lowered/raised
    nonce: envelope.nonce,
    createdAt: envelope.createdAt,
  });
  return decisionRewrite(rewritten, `Stripped dangerous flags: ${stripped.join(", ")}`, [
    basis("validation", BASIS_CODES.validation.COMMAND_FLAG_STRIPPED, {
      ...detailBase,
      sanitized,
      stripped: [...stripped],
    }),
  ]);
}

// ─── createSessionConsistencyGuard (runtime contradiction detection) ─────────

/**
 * Discriminated verdict returned by the adopter's `contradicts` predicate.
 * Returning `null` from the predicate means "no contradiction" — the guard then
 * returns `null`, matching the kernel's "this guard has no opinion" semantics.
 */
export interface SessionContradiction {
  /**
   * "hard" — the envelope is logically incompatible with established session
   * facts; the guard REFUSEs. "suspicious" — the envelope is anomalous but not
   * provably contradictory; the guard ESCALATEs for human/supervisor review.
   */
  readonly severity: "hard" | "suspicious";
  /** Operator/log-facing explanation; rides ESCALATE.reason and the basis detail. */
  readonly reason: string;
  /** Optional structured context merged into the DecisionBasis detail. */
  readonly detail?: Record<string, unknown>;
}

export interface SessionConsistencyGuardOptions<K extends string, P, S> {
  /**
   * Pure contradiction predicate. Reads ALL session history out of the
   * adopter-owned `state` (exactly as `createTokenBudgetGuard` reads counters
   * out of `S`); returns a `SessionContradiction` to act, or `null` for "no
   * opinion". This predicate is the guard's ENTIRE semantic — the factory adds
   * no scoring or contradiction logic of its own.
   */
  readonly contradicts: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => SessionContradiction | null;
  /** RefusalKind for the "hard" case. Defaults to "STATE". */
  readonly refusalKind?: RefusalKind;
  /**
   * Stable, machine-readable `Refusal.code` for the "hard" case. Defaults to
   * "session.contradiction". (This is the refusal identifier, not a BASIS_CODES
   * entry — the basis stays in the closed `state` vocabulary.)
   */
  readonly refusalCode?: string;
  /**
   * User-facing refusal text, or a builder receiving the verdict + envelope.
   * Defaults to a generic state-conflict message.
   */
  readonly userFacing?:
    | string
    | ((
        contradiction: SessionContradiction,
        envelope: IntentEnvelope<K, P>,
      ) => string);
  /** Escalation target for the "suspicious" case. Defaults to "supervisor". */
  readonly escalateTo?: "human" | "supervisor";
}

const DEFAULT_CONTRADICTION_USER_FACING =
  "That request conflicts with what we have on record for this session.";

/**
 * Runtime session-consistency / contradiction guard.
 *
 * The runtime analogue of the design-time consistency analyzer: it detects when
 * a proposed envelope contradicts facts already established in the adopter-owned
 * session `State` and maps the adopter's verdict onto a frozen outcome —
 *
 *   severity "hard"        → REFUSE   (default RefusalKind "STATE")
 *   severity "suspicious"  → ESCALATE (default "supervisor")
 *
 * Conformance: it never calls `buildEnvelope` and never returns REWRITE, so it
 * is structurally incapable of touching a hashed envelope byte; given
 * `(envelope, state)` it is pure and emits only frozen outcomes; metadata is
 * opaque. Crucially it contains ZERO scoring logic — the entire semantic is the
 * adopter's deterministic predicate, so no probabilistic scoring reaches the
 * decision path (invariant 3).
 */
export function createSessionConsistencyGuard<K extends string, P, S>(
  options: SessionConsistencyGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const refusalKind = options.refusalKind ?? "STATE";
  const refusalCode = options.refusalCode ?? "session.contradiction";
  const escalateTo = options.escalateTo ?? "supervisor";

  const guard: Guard<K, P, S> = (envelope, state) => {
    const verdict = options.contradicts(envelope, state);
    if (verdict === null) return null;

    // Canonical keys win over adopter-supplied detail (spread first).
    const detail = {
      ...(verdict.detail ?? {}),
      rule: "session_contradiction",
      severity: verdict.severity,
      reason: verdict.reason,
    };

    if (verdict.severity === "hard") {
      const userFacing =
        typeof options.userFacing === "function"
          ? options.userFacing(verdict, envelope)
          : (options.userFacing ?? DEFAULT_CONTRADICTION_USER_FACING);
      return decisionRefuse(
        refuse(refusalKind, refusalCode, userFacing, verdict.reason),
        [basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, detail)],
      );
    }

    return decisionEscalate(escalateTo, verdict.reason, [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, detail),
    ]);
  };

  return withMetadata(guard, {
    description: {
      kind: "opaque",
      note: "session-consistency guard (adopter predicate)",
    },
  });
}

// ─── createSideEffectTaintFloor (blanket taint floor by side-effect class) ────

export interface SideEffectTaintFloorOptions<K extends string, P, S> {
  /**
   * Declared side-effect class per intent kind — typically the same object set
   * on `PackV0.sideEffects`. Kinds absent here fall to `defaultClass`.
   */
  readonly sideEffects: Readonly<Partial<Record<K, SideEffectClass>>>;
  /**
   * Class assumed for any kind absent from `sideEffects`. Defaults to
   * "destructive" so an unmapped kind fails CLOSED (highest floor) — never
   * fail-open on an unclassified, possibly-destructive kind.
   */
  readonly defaultClass?: SideEffectClass;
  /**
   * Minimum-taint table per class. Defaults to `DEFAULT_SIDE_EFFECT_FLOOR`
   * (none/read: UNTRUSTED, write: TRUSTED, destructive: SYSTEM).
   */
  readonly floor?: Readonly<Record<SideEffectClass, Taint>>;
  /**
   * Disposition when the envelope's taint is below the floor. "REFUSE"
   * (default) hard-blocks; "ESCALATE" routes to a supervisor.
   */
  readonly onBelowFloor?: "REFUSE" | "ESCALATE";
  /** Optional predicate to scope the guard; returning false short-circuits to null. */
  readonly matches?: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** User-facing refusal text for the REFUSE disposition. */
  readonly refusalUserFacing?: string;
}

/**
 * Blanket taint-floor guard keyed by side-effect class.
 *
 * Per envelope: `kind → SideEffectClass → required Taint`, then an integer
 * `taintRank` compare. When the envelope's taint is below the class floor it
 * emits REFUSE (default) or ESCALATE — structurally preventing, e.g., an
 * UNTRUSTED (LLM-proposed) envelope from driving a `destructive` side effect.
 *
 * Conformance: pure Record-lookup + integer compare (mirrors `canPropose`); no
 * scoring, no clock, no RNG. Place it in `stateGuards` so it short-circuits
 * before any auth-guard side effect. The default class is "destructive"
 * (fail-closed), so an unmapped kind never slips through.
 */
export function createSideEffectTaintFloor<K extends string, P, S>(
  options: SideEffectTaintFloorOptions<K, P, S>,
): Guard<K, P, S> {
  const floor = options.floor ?? DEFAULT_SIDE_EFFECT_FLOOR;
  const defaultClass = options.defaultClass ?? "destructive";
  const onBelowFloor = options.onBelowFloor ?? "REFUSE";
  const refusalUserFacing =
    options.refusalUserFacing ??
    "That action requires a higher trust level than this request carries.";

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (options.matches && !options.matches(envelope, state)) return null;

    const sideEffectClass = options.sideEffects[envelope.kind] ?? defaultClass;
    const required = floor[sideEffectClass];
    if (taintRank(envelope.taint) >= taintRank(required)) return null;

    const detail = {
      rule: "side_effect_taint_floor",
      sideEffectClass,
      requiredTaint: required,
      actualTaint: envelope.taint,
    };

    if (onBelowFloor === "ESCALATE") {
      return decisionEscalate(
        "supervisor",
        `${sideEffectClass} side effect requires ${required}; envelope is ${envelope.taint}`,
        [basis("taint", BASIS_CODES.taint.LEVEL_INSUFFICIENT, detail)],
      );
    }
    return decisionRefuse(
      refuse(
        "SECURITY",
        "side_effect.taint_floor",
        refusalUserFacing,
        `${sideEffectClass} requires ${required}; got ${envelope.taint}`,
      ),
      [basis("taint", BASIS_CODES.taint.LEVEL_INSUFFICIENT, detail)],
    );
  };

  return withMetadata(guard, {
    description: { kind: "opaque", note: "side-effect taint floor" },
  });
}
