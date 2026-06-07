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
  refuse,
} from "@adjudicate/core";
import type {
  Decision,
  DecisionBasis,
  IntentActor,
  IntentEnvelope,
} from "@adjudicate/core";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";

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
  /** Disposition on detection. */
  readonly action: "REWRITE" | "REFUSE";
  /** Sensitivity tag surfaced in metadata AND `basis.detail`. */
  readonly sensitivityLevel: SensitivityLevel;
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
      let fieldMatched = false;
      let redacted = value;
      for (const p of options.patterns) {
        if (testPattern(p.pattern, value)) {
          fieldMatched = true;
          if (!detectedPatterns.includes(p.id)) detectedPatterns.push(p.id);
        }
        if (options.action === "REWRITE") {
          redacted = redactWith(p.pattern, redacted, p.redact ?? (() => DEFAULT_REDACT_TOKEN));
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
      // NaN/Infinity-safe: NaN comparisons are false → no spurious crossing.
      if (Number.isFinite(session) && session >= options.sessionBudget) {
        scope = "session";
        consumed = session;
        budget = options.sessionBudget;
      }
    }
    if (scope === null && options.tenantBudget !== undefined && options.extractTenantTokens) {
      const tenant = options.extractTenantTokens(state, envelope);
      if (Number.isFinite(tenant) && tenant >= options.tenantBudget) {
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
