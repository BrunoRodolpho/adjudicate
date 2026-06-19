/**
 * adjudicate() — the pure deterministic heart of the framework.
 *
 * Takes a proposed IntentEnvelope, the current state snapshot, and a
 * PolicyBundle. Returns a single Decision. No LLM calls. No side effects. No
 * randomness. Same inputs always produce the same output — the replay harness
 * depends on this.
 *
 * Evaluation order (strict — do not reorder):
 *   1. Kill switch    — operator-engaged global override (engages before schema)
 *   2. Schema version — unknown versions are SECURITY refusals
 *   2b. intentHash    — re-derived from canonical content; a mismatch is a
 *                       SECURITY refusal (content-addressing must be verified,
 *                       not trusted). Adopters using buildEnvelope pay no cost.
 *   3. stateGuards    — legality of the transition the intent proposes
 *   4. taint gate     — provenance check via canPropose() (T8: moved ahead of auth)
 *   5. authGuards     — caller identity and scope
 *   6. business       — domain-specific rules
 *   7. policy.default
 *
 * **T8 reorder:** the taint gate runs BEFORE auth guards. Auth guards
 * with side effects (logging principals, querying permission services)
 * previously executed on UNTRUSTED inputs; now UNTRUSTED short-circuits
 * before any auth side effect. The refusal-code distribution in audit
 * history shifts as a result — taint refusals on UNTRUSTED inputs that
 * would also have failed auth now surface the taint refusal instead.
 *
 * Each guard returning null contributes a "pass" basis to the final decision.
 *
 * # Trace variant
 *
 * `adjudicateWithTrace()` returns the same Decision plus an evaluation
 * trace — which guards ran, which one matched. Both functions delegate
 * to `_adjudicateImpl`, so trace fidelity is structurally guaranteed:
 * the trace describes the exact path `adjudicate()` would have taken.
 * The hot path (`adjudicate()` itself) passes `undefined` for `traceOut`
 * and pays zero allocation cost.
 */

import { basis, BASIS_CODES, type DecisionBasis } from "../basis-codes.js";
import {
  canPropose,
  canProposeWithOrigin,
  isContaminatingOrigin,
  taintRank,
} from "../taint.js";
import {
  decisionExecute,
  decisionRefuse,
  type Decision,
} from "../decision.js";
import {
  deriveIntentHash,
  INTENT_ENVELOPE_VERSION,
  type IntentEnvelope,
} from "../envelope.js";
import { refuse } from "../refusal.js";
import { getKillSwitchState, isKilled } from "./enforce-config.js";
import { readGuardMetadata, withMetadata, type PolicyBundle } from "./policy.js";
import { makePassBasis } from "./basis.js";

// ─── Trace record contract ─────────────────────────────────────────────────

export type AdjudicationTracePhase =
  | "kill"
  | "schema"
  | "state"
  | "taint"
  | "auth"
  | "business"
  | "default";

/**
 * A single step in the kernel's evaluation of an envelope.
 *
 * Semantics:
 *   - One entry per evaluated step. Steps that didn't run (because an
 *     earlier match short-circuited) are absent from the trace.
 *   - Single-step phases (`kill`, `schema`, `taint`, `default`) emit one
 *     entry. Array phases (`state`, `auth`, `business`) emit one entry
 *     per guard actually invoked.
 *   - `outcome === "match"` exactly identifies the step that produced
 *     the final Decision. The trace always ends with the match.
 *   - `guardName` is best-effort from `Function.name`. Factory-built
 *     guards (e.g., returned from `createThresholdGuard`) are anonymous;
 *     for those, `guardName` is omitted and consumers fall back to
 *     `phase[index]`.
 */
export interface AdjudicationTraceEntry {
  readonly phase: AdjudicationTracePhase;
  /** 0-based position within array phases. Omitted for single-step phases. */
  readonly index?: number;
  /** Non-empty `Function.name` of the guard. Omitted for anonymous closures and non-guard phases. */
  readonly guardName?: string;
  /** "pass" — step yielded no decision; evaluation continued. "match" — step produced the final decision. */
  readonly outcome: "pass" | "match";
}

export interface AdjudicationTraceResult {
  readonly decision: Decision;
  readonly trace: ReadonlyArray<AdjudicationTraceEntry>;
}

// ─── Pure decision core (non-audited — see adjudicateAndAudit for production) ─

/**
 * The pure, deterministic decision core — NOT the production entry point.
 *
 * `adjudicate()` emits NO AuditRecord, consults NO ledger, and produces NO
 * side effects. It exists for replay, simulation, trace tooling, and property
 * tests, where re-auditing would be wrong. Determinism is a hard invariant:
 * the same `(envelope, state, policy)` always yields the same Decision, with
 * no Date/env/IO read in the path.
 *
 * Production mutation paths MUST call `adjudicateAndAudit()` instead — that is
 * the only entry point that enforces the audit-complete invariant (every
 * authoritative decision yields a durable AuditRecord) plus the ledger
 * replay-suppression that stops side effects from double-firing. Wiring a raw
 * `adjudicate()` call into a mutation path silently bypasses governance.
 *
 * **READ-bearing envelopes (012).** This function makes NO distinction between
 * a "read" and an "intent" envelope: the typed `ToolClassification` that the
 * adapter loop uses to decide which executor surface an EXECUTE authorizes is a
 * STRUCTURAL discriminant on the adapter-facing types — it is NOT a kernel
 * input and introduces NO runtime IO or heuristic here. A READ proposed by the
 * model is routed (by the adapter) into an ordinary envelope and adjudicated
 * under the SAME guard order `state → taint → auth → business → default`, so
 * the taint gate and fail-closed default apply to reads exactly as to
 * mutations. The kernel stays pure and synchronous (§D); read-vs-write routing
 * lives entirely in the impure adapter shell.
 */
export function adjudicate<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
): Decision {
  return _adjudicateImpl(envelope, state, policy, undefined);
}

/**
 * Attach a stable display name to a guard so it appears in trace output
 * (`AdjudicationTraceEntry.guardName`) and learning-event identity
 * (`LearningEvent.guardId`).
 *
 * Guards declared as named consts (e.g., `const validateAmount: Guard<...> = ...`)
 * already carry a useful `Function.name` automatically — `nameGuard` is for
 * the case factory-built guards lose: `createThresholdGuard({...})` returns
 * an anonymous closure with `name === ""`. Wrap it:
 *
 *     const escalateLargeRefunds = nameGuard(
 *       "escalateLargeRefunds",
 *       createThresholdGuard({ ... }),
 *     );
 *
 * Implementation: `nameGuard(name, g)` is a thin facade over
 * `withMetadata(g, { name })` — see `policy.ts` for the metadata surface.
 * No `description` is attached: `nameGuard` is the canonical lightweight-
 * wrapper case the optional-description rule was designed to support, and
 * forcing `{ kind: "opaque" }` would import the fake-precision pattern
 * ADR-105 explicitly rejects. Analyzers seeing a guard with `name` but no
 * `description` treat it identically to `{ kind: "opaque" }`.
 *
 * Identity-preserving: returns the same function object. Stack traces,
 * referential equality, and registry semantics are preserved.
 *
 * Idempotent across identical names — `withMetadata` is per-field write-once
 * with idempotent reattachment of the same value. Calling `nameGuard("a", g)`
 * then `nameGuard("b", g)` throws on the second call (different values
 * for the `name` field).
 */
export function nameGuard<F extends (...args: never[]) => unknown>(
  name: string,
  guard: F,
): F {
  return withMetadata(guard, { name });
}

/**
 * Tracing variant: same Decision as `adjudicate()`, plus the per-step
 * evaluation trace. Useful for simulation tooling (CLI `simulate`),
 * Operator Console replay rendering, and future static-verification
 * over closed-enum guard spaces.
 *
 * Trace fidelity: this function and `adjudicate()` share their body —
 * the only difference is that `adjudicate()` passes `undefined` for
 * `traceOut`. There is no second implementation that could drift.
 */
export function adjudicateWithTrace<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
): AdjudicationTraceResult {
  const trace: AdjudicationTraceEntry[] = [];
  const decision = _adjudicateImpl(envelope, state, policy, trace);
  return { decision, trace };
}

// ─── Shared implementation ─────────────────────────────────────────────────

function _adjudicateImpl<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
  traceOut: AdjudicationTraceEntry[] | undefined,
): Decision {
  // 0. Kill switch — operator-engaged global override. Engages BEFORE the
  //    schema-version check so a malformed envelope still gets refused with
  //    a clear "system is in maintenance" code rather than the generic
  //    schema_version_unsupported.
  if (isKilled()) {
    if (traceOut) traceOut.push({ phase: "kill", outcome: "match" });
    const kill = getKillSwitchState();
    return decisionRefuse(
      refuse(
        "SECURITY",
        "kill_switch_active",
        "System is temporarily unavailable.",
        `Kill switch active: ${kill.reason} (toggled at ${kill.toggledAt})`,
      ),
      [
        basis("kill", BASIS_CODES.kill.ACTIVE, {
          reason: kill.reason,
          toggledAt: kill.toggledAt,
        }),
      ],
    );
  }
  if (traceOut) traceOut.push({ phase: "kill", outcome: "pass" });

  const accumulated: DecisionBasis[] = [];

  // 1. Schema version gate — we accept only the known version. Callers that
  //    receive decoded JSON use hasUnknownEnvelopeVersion() upstream; this
  //    check is the last line of defense inside the kernel.
  if (envelope.version !== INTENT_ENVELOPE_VERSION) {
    if (traceOut) traceOut.push({ phase: "schema", outcome: "match" });
    return decisionRefuse(
      refuse(
        "SECURITY",
        "schema_version_unsupported",
        "This action cannot be processed at the moment.",
        `Unknown envelope version: ${String((envelope as { version?: unknown }).version)}`,
      ),
      [
        basis("schema", BASIS_CODES.schema.VERSION_UNSUPPORTED, {
          seen: (envelope as { version?: unknown }).version,
          supported: INTENT_ENVELOPE_VERSION,
        }),
      ],
    );
  }
  if (traceOut) traceOut.push({ phase: "schema", outcome: "pass" });
  accumulated.push(basis("schema", BASIS_CODES.schema.VERSION_SUPPORTED));

  // 1b. Content-addressing integrity — re-derive intentHash from canonical
  //     content and compare. The kernel uses intentHash as the ledger dedup
  //     key, the audit-row identifier, and the confirmation-receipt match
  //     target; trusting the caller-supplied hash makes content-addressing
  //     unverified. A forged or drifted hash is refused here, fail-closed.
  //     Adopters using buildEnvelope pay zero cost — the hashes match.
  //
  //     T1 (011): the derivation itself is wrapped — a non-canonicalizable
  //     payload (e.g. a BigInt or a cyclic value sneaking past the type wall)
  //     must REFUSE as GUARD_PANIC, never throw out of the pure kernel
  //     (invariant #6 totality). Closes the §D caveat that derivation at
  //     :245 ran outside the guard try/catch.
  let derivedHash: string;
  try {
    derivedHash = deriveIntentHash(envelope);
  } catch (err) {
    if (traceOut) traceOut.push({ phase: "schema", outcome: "match" });
    return guardPanicRefusal("schema", null, null, err, accumulated);
  }
  if (derivedHash !== envelope.intentHash) {
    if (traceOut) traceOut.push({ phase: "schema", outcome: "match" });
    return decisionRefuse(
      refuse(
        "SECURITY",
        "intent_hash_mismatch",
        "This action cannot be processed at the moment.",
        "envelope.intentHash does not match the canonical content hash",
      ),
      [...accumulated, basis("schema", BASIS_CODES.schema.INTENT_HASH_MISMATCH)],
    );
  }

  // 2. State guards
  for (let i = 0; i < policy.stateGuards.length; i++) {
    const guard = policy.stateGuards[i]!;
    let d: Decision | null;
    try {
      d = guard(envelope, state);
    } catch (err) {
      if (traceOut) traceOut.push(traceEntry("state", i, guard, "match"));
      return guardPanicRefusal("state", i, guard, err, accumulated);
    }
    if (d !== null) {
      if (traceOut) traceOut.push(traceEntry("state", i, guard, "match"));
      return enrichBasis(gateRewrite(d, envelope), accumulated);
    }
    if (traceOut) traceOut.push(traceEntry("state", i, guard, "pass"));
  }
  accumulated.push(makePassBasis("state"));

  // 3. Taint gate (T8 reorder: now BEFORE auth, so UNTRUSTED inputs
  //    short-circuit before any auth-guard side effect runs).
  //    Declarative, driven by policy.taint. `canProposeWithOrigin()` is the
  //    single call — do not walk payload fields by inspection. Field-level taint
  //    (v1.1) gains precision transparently through this call.
  //
  //    043 — the gate consults the harness-stamped `origin` axis (041) so the
  //    policy may RAISE the effective minimum for a kind it declares
  //    origin-required when the proposal traces to contaminating provenance
  //    (`Retrieved` / `ExternalAPI`). This catches the laundering case the
  //    trust-rank floor alone cannot: an UNTRUSTED-min mutating kind whose
  //    `1 >= 1` rank check always passes regardless of where the bytes came
  //    from. The branch is opt-in per policy (default-absent ⇒ byte-identical to
  //    pre-043) and MONOTONIC — it only ever flips a rank-PASS to a REFUSE,
  //    never the reverse (§C / invariant #7).
  let taintAllowed: boolean;
  let rankAllowed: boolean;
  try {
    // The trust-rank floor (042/pre-043 behavior) and the origin-aware gate.
    // `rankAllowed` lets us attribute the refusal: a rank failure keeps the 042
    // attribution, while a rank PASS that the origin branch flipped is a genuine
    // propagation violation (the proposal cleared the trust gate but laundered
    // its provenance).
    rankAllowed = canPropose(envelope.taint, envelope.kind, policy.taint);
    taintAllowed = canProposeWithOrigin(
      envelope.taint,
      envelope.kind,
      envelope.origin,
      policy.taint,
    );
  } catch (err) {
    // policy.taint.minimumFor()/requiresUncontaminatedOrigin() threw. Treat as
    // guard panic in the taint phase — fail-closed with kernel.GUARD_PANIC.
    if (traceOut) traceOut.push({ phase: "taint", outcome: "match" });
    return guardPanicRefusal("taint", null, null, err, accumulated);
  }
  if (!taintAllowed) {
    if (traceOut) traceOut.push({ phase: "taint", outcome: "match" });
    // 043 — the origin-aware policy branch fired: the proposal cleared the
    // trust-rank floor (`rankAllowed`) but the policy declares this kind
    // origin-required AND the proposal carries a contaminating origin. This is a
    // genuine provenance-propagation refusal (a decision the rank gate would
    // have PASSED), so it is attributed to `taint:propagation_violation` with a
    // distinct message and the kind's effective-minimum elevation recorded.
    const originBranchFired = rankAllowed; // !taintAllowed && rankAllowed
    // 042 — for a rank-floor refusal, distinguish a contamination-LOWERED
    // refusal from a bare declared-untrusted one via the read-only `origin`.
    const propagationCaused =
      originBranchFired || isContaminatingOrigin(envelope.origin);
    const code = propagationCaused
      ? BASIS_CODES.taint.PROPAGATION_VIOLATION
      : BASIS_CODES.taint.LEVEL_INSUFFICIENT;
    return decisionRefuse(
      refuse(
        "SECURITY",
        "taint_level_insufficient",
        "I can't perform this action with the information available.",
        originBranchFired
          ? `Origin-required intent kind ${envelope.kind} refused: proposal traces to contaminating origin ${envelope.origin}`
          : propagationCaused
            ? `Contaminated proposal (origin ${envelope.origin}) lowered taint ${envelope.taint} below the minimum for intent kind ${envelope.kind}`
            : `Taint ${envelope.taint} insufficient for intent kind ${envelope.kind}`,
      ),
      [
        ...accumulated,
        basis("taint", code, {
          actual: envelope.taint,
          kind: envelope.kind,
          ...(propagationCaused ? { origin: envelope.origin } : {}),
          ...(originBranchFired ? { branch: "origin_required" } : {}),
        }),
      ],
    );
  }
  if (traceOut) traceOut.push({ phase: "taint", outcome: "pass" });
  accumulated.push(makePassBasis("taint"));

  // 4. Auth guards (T8 reorder: now AFTER taint).
  for (let i = 0; i < policy.authGuards.length; i++) {
    const guard = policy.authGuards[i]!;
    let d: Decision | null;
    try {
      d = guard(envelope, state);
    } catch (err) {
      if (traceOut) traceOut.push(traceEntry("auth", i, guard, "match"));
      return guardPanicRefusal("auth", i, guard, err, accumulated);
    }
    if (d !== null) {
      if (traceOut) traceOut.push(traceEntry("auth", i, guard, "match"));
      return enrichBasis(gateRewrite(d, envelope), accumulated);
    }
    if (traceOut) traceOut.push(traceEntry("auth", i, guard, "pass"));
  }
  accumulated.push(makePassBasis("auth"));

  // 5. Business rules
  for (let i = 0; i < policy.business.length; i++) {
    const guard = policy.business[i]!;
    let d: Decision | null;
    try {
      d = guard(envelope, state);
    } catch (err) {
      if (traceOut) traceOut.push(traceEntry("business", i, guard, "match"));
      return guardPanicRefusal("business", i, guard, err, accumulated);
    }
    if (d !== null) {
      if (traceOut) traceOut.push(traceEntry("business", i, guard, "match"));
      return enrichBasis(gateRewrite(d, envelope), accumulated);
    }
    if (traceOut) traceOut.push(traceEntry("business", i, guard, "pass"));
  }
  accumulated.push(makePassBasis("business"));

  // 6. Policy default
  if (traceOut) traceOut.push({ phase: "default", outcome: "match" });
  if (policy.default === "EXECUTE") {
    return decisionExecute(accumulated);
  }
  return decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "default_deny",
      "This action is not permitted right now.",
    ),
    accumulated,
  );
}

/**
 * Gate a guard's Decision before it leaves the kernel.
 *
 * For every Decision kind except REWRITE this is the identity. For a REWRITE
 * (011 / T1) the kernel applies two fail-closed checks to the substituted
 * `rewritten` envelope — the kernel must never hand a rewrite to the executor
 * unless it would itself pass content-addressing and the monotonicity law:
 *
 *   1. intentHash re-derivation — `deriveIntentHash(rewritten)` must equal
 *      `rewritten.intentHash`. A forged/drifted rewrite hash REFUSEs with the
 *      `schema:intent_hash_mismatch` code, exactly like the original-envelope
 *      gate at step 1b. The derivation is wrapped so a non-canonicalizable
 *      rewritten payload becomes a GUARD_PANIC REFUSE, never a throw out of
 *      the pure kernel (invariant #6 totality).
 *   2. taint monotonicity (§C / invariant #7) — a non-deterministic rewrite may
 *      only increase friction, never decrease it. A rewrite whose `rewritten.taint`
 *      outranks the ORIGINAL `envelope.taint` (e.g. UNTRUSTED→SYSTEM) would
 *      launder provenance, so it REFUSEs with `taint:propagation_violation`.
 *
 * The downstream audited shell (`adjudicateAndAudit`) re-adjudicates a surviving
 * REWRITE through the kernel a SECOND time and only lets a second-pass EXECUTE
 * reach the executor (invariant #1) — this gate is the pure-kernel half that
 * makes the rewritten bytes safe to re-adjudicate.
 */
function gateRewrite(decision: Decision, envelope: IntentEnvelope): Decision {
  if (decision.kind !== "REWRITE") return decision;
  const rewritten = decision.rewritten;

  // Gate refusals carry ONLY their gate-specific basis; the surrounding
  // `enrichBasis(gateRewrite(...), accumulated)` call prepends the prior-phase
  // pass-bases exactly once (same contract as a guard's own returned decision).

  // (1) intentHash re-derivation on the rewritten envelope, fail-closed.
  let derived: string;
  try {
    derived = deriveIntentHash(rewritten);
  } catch (err) {
    // Non-canonicalizable rewritten payload → GUARD_PANIC REFUSE (no throw).
    return guardPanicRefusal("schema", null, null, err, []);
  }
  if (derived !== rewritten.intentHash) {
    return decisionRefuse(
      refuse(
        "SECURITY",
        "intent_hash_mismatch",
        "This action cannot be processed at the moment.",
        "decision.rewritten.intentHash does not match the canonical content hash",
      ),
      [
        basis("schema", BASIS_CODES.schema.INTENT_HASH_MISMATCH, {
          subject: "rewritten",
        }),
      ],
    );
  }

  // (2) taint monotonicity — a rewrite may never raise the trust of the
  //     proposal. Higher rank = more trust; a rewritten taint that outranks
  //     the original is a friction-DECREASING substitution, forbidden by §C.
  if (taintRank(rewritten.taint) > taintRank(envelope.taint)) {
    return decisionRefuse(
      refuse(
        "SECURITY",
        "taint_level_insufficient",
        "I can't perform this action with the information available.",
        `Rewrite would elevate taint ${envelope.taint} -> ${rewritten.taint}`,
      ),
      [
        basis("taint", BASIS_CODES.taint.PROPAGATION_VIOLATION, {
          original: envelope.taint,
          rewritten: rewritten.taint,
        }),
      ],
    );
  }

  return decision;
}

/**
 * Guard-panic refusal — emitted when a guard (or the taint policy) throws.
 *
 * Per ADR-106: kernel determinism + fail-closed posture means a thrown guard
 * does NOT propagate to the adopter. Instead the kernel converts it to a
 * SECURITY REFUSE with the `kernel.GUARD_PANIC` basis, preserving the audit
 * trail (the phase + matched-guard identity travel in `basis.detail`).
 *
 * Deterministic-by-content: the basis carries `Error.message` (stable for
 * stable input) plus the matched-guard name. The kernel itself adds nothing
 * nondeterministic — no timestamps, no random IDs.
 *
 * `guardIndex` and `guard` are null for the taint-gate path, since
 * `canPropose` is not a guard array entry.
 */
function guardPanicRefusal(
  phase: "schema" | "state" | "taint" | "auth" | "business",
  guardIndex: number | null,
  guard: unknown,
  err: unknown,
  accumulated: DecisionBasis[],
): Decision {
  const message =
    err instanceof Error ? err.message : String(err);
  const errorName = err instanceof Error ? err.name : "Error";
  let guardName: string | undefined;
  if (guard !== null && typeof guard === "function") {
    const fn = guard as (...args: never[]) => unknown;
    const metaName = readGuardMetadata(fn)?.name;
    const fnName =
      typeof (fn as { name?: unknown }).name === "string"
        ? (fn as { name: string }).name
        : "";
    const resolved = metaName ?? fnName;
    if (resolved.length > 0) guardName = resolved;
  }
  return decisionRefuse(
    refuse(
      "SECURITY",
      "guard_panic",
      "System is temporarily unavailable.",
      `Guard panic in ${phase} phase${
        guardIndex !== null ? `[${guardIndex}]` : ""
      }${guardName ? ` (${guardName})` : ""}: ${errorName}: ${message}`,
    ),
    [
      ...accumulated,
      basis("kernel", BASIS_CODES.kernel.GUARD_PANIC, {
        phase,
        ...(guardIndex !== null ? { index: guardIndex } : {}),
        ...(guardName ? { guardName } : {}),
        errorName,
        message,
      }),
    ],
  );
}

function traceEntry(
  phase: "state" | "auth" | "business",
  index: number,
  guard: unknown,
  outcome: "pass" | "match",
): AdjudicationTraceEntry {
  // Per ADR-105: `metadata.name ?? guard.name`. Guards wrapped with
  // `nameGuard` / `withMetadata({ name })` get the explicit metadata name;
  // adopter-authored named consts fall back to `Function.name`; anonymous
  // closures still resolve to `""` and the field is omitted.
  const fn =
    typeof guard === "function"
      ? (guard as (...args: never[]) => unknown)
      : null;
  const metaName = fn ? readGuardMetadata(fn)?.name : undefined;
  const fnName =
    fn && typeof (fn as { name?: unknown }).name === "string"
      ? (fn as { name: string }).name
      : "";
  const name = metaName ?? fnName;
  return name.length > 0
    ? { phase, index, guardName: name, outcome }
    : { phase, index, outcome };
}

/**
 * Prepend the accumulated "pass" bases to a Decision returned by a guard.
 * This preserves the full audit trail of everything that ran before the
 * short-circuit.
 */
function enrichBasis(decision: Decision, passed: DecisionBasis[]): Decision {
  const merged: DecisionBasis[] = [...passed, ...decision.basis];
  switch (decision.kind) {
    case "EXECUTE":
      return { kind: "EXECUTE", basis: merged };
    case "REFUSE":
      return { kind: "REFUSE", refusal: decision.refusal, basis: merged };
    case "ESCALATE":
      return {
        kind: "ESCALATE",
        to: decision.to,
        reason: decision.reason,
        basis: merged,
      };
    case "REQUEST_CONFIRMATION":
      return {
        kind: "REQUEST_CONFIRMATION",
        prompt: decision.prompt,
        basis: merged,
      };
    case "DEFER":
      return {
        kind: "DEFER",
        signal: decision.signal,
        timeoutMs: decision.timeoutMs,
        basis: merged,
      };
    case "REWRITE":
      return {
        kind: "REWRITE",
        rewritten: decision.rewritten,
        reason: decision.reason,
        basis: merged,
      };
  }
}
