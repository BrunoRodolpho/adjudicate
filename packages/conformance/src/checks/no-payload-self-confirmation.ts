/**
 * AC-008 — a Pack payload must not self-confirm (plan 014).
 *
 * The constitutional confirmation flow is owned SOLELY by the kernel's
 * intentHash-bound `confirmationReceipt` path
 * (`adjudicate-and-audit.ts`, `receipt.intentHash === envelope.intentHash`):
 * a `REQUEST_CONFIRMATION` may only become an `EXECUTE` when a receipt bound to
 * THIS envelope's `intentHash` is presented out-of-band. A proposer (the LLM)
 * must never be able to mint its own confirmation by stuffing a truthy
 * `confirmationToken` (or any equivalent self-confirmation field) into the
 * model-controlled payload bytes — that is a friction-LOWERING bypass of §C
 * monotonicity and a violation of invariant #1 (LLM has zero mutation
 * authority; only `EXECUTE` reaches the executor).
 *
 * **Why behavioral, not schema-reflective.** `PackV0` carries no runtime
 * payload schema — domain payloads are TypeScript-only types, erased at
 * runtime. So this check cannot reflect over a declared schema; it probes the
 * Pack's actual `adjudicate()` behavior.
 *
 * **Why a domain-valid baseline is required.** The deleted bypasses
 * (`executeConfirmedRevoke` / `allowConfirmedRollback`) lived in the BUSINESS
 * phase, behind STATE guards that REFUSE a payload missing required domain
 * fields (`requireActiveGrantForRevoke`, `refuseEmptyGitSha`, …). A synthetic
 * probe payload with no domain fields is REFUSED at the state stage and never
 * reaches business — so probing with such a payload PASSES vacuously and would
 * NOT catch a real reintroduction of the bypass. To be non-vacuous the check
 * must build a baseline that REACHES the business stage:
 *
 *   - Callers supply `options.validPayloadSamples[kind]` — a domain-valid base
 *     payload that passes the Pack's state guards. The probe merges the
 *     candidate self-confirmation field onto THAT payload.
 *   - The probe confirms the baseline reached business via
 *     `adjudicateWithTrace` (the trace contains a `business`-phase entry).
 *   - A kind whose baseline never reaches business is reported NOT-EXERCISED (a
 *     coverage gap surfaced in `details`) — never a silent clean pass.
 *
 * For each exercised kind the probe builds a BASELINE (domain-valid, no
 * self-confirm field) and VARIANTS that add a single candidate
 * self-confirmation field set to a truthy attacker value. If adding such a
 * field flips a non-EXECUTE baseline into an EXECUTE, the Pack lets a model
 * self-confirm → FAIL. The differential is the precise, non-vacuous signal: a
 * field with no effect on the decision never fails the check.
 *
 * **Determinism.** Same seeded LCG cadence as AC-001 (seed 42 default, no
 * `Math.random()`). Two runs of the same `(pack, options)` produce a
 * byte-identical result.
 */

import { buildEnvelope } from "@adjudicate/core";
import { adjudicate, adjudicateWithTrace } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg } from "../prng.js";

/**
 * Candidate self-confirmation field names. `confirmationToken` is the exact
 * pattern plan 014 deletes; the siblings catch the obvious renames a Pack
 * author might reach for to re-introduce the same bypass. Lower-cased
 * comparison would over-match real domain fields, so the list is explicit and
 * conservative (a false NEGATIVE — a novel field name — is acceptable; a false
 * POSITIVE that fails a clean Pack is not).
 */
const SELF_CONFIRMATION_FIELDS: ReadonlyArray<string> = [
  "confirmationToken",
  "confirmToken",
  "confirmation",
  "confirmed",
  "selfConfirm",
  "selfConfirmation",
  "skipConfirmation",
  "bypassConfirmation",
  "approvalToken",
];

/** Truthy attacker-supplied values a model could put in a self-confirm field. */
const TRUTHY_VALUES: ReadonlyArray<unknown> = ["x", "true", 1, true];

export const noPayloadSelfConfirmationCheck: ConformanceCheck = {
  id: "AC-008",
  name: "Pack payloads must not self-confirm (no model-minted confirmation field)",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);
    const payloadSamples = options.validPayloadSamples ?? {};
    const stateSamples = options.validStateSamples ?? {};

    // Per-kind state. A kind reaches the business stage either against the empty
    // state (payload-only state guards, e.g. a deployment rollback's
    // `refuseEmptyGitSha`) or against a caller-supplied state sample (state-
    // dependent guards, e.g. `access.revoke` needs an active grant). State is
    // rehydrated through the Pack's own `rehydrateState` so its guards see the
    // shape they expect (e.g. `Map` not plain object). Pure: rehydrate is the
    // Pack's deterministic deserializer, no clock/IO.
    const rehydrate = (raw: unknown): S =>
      typeof pack.rehydrateState === "function" ? pack.rehydrateState(raw) : (raw as S);
    function stateFor(kind: K): S {
      const has = Object.prototype.hasOwnProperty.call(stateSamples, kind as string);
      return rehydrate(has ? stateSamples[kind as string] : {});
    }

    const failures: string[] = [];
    const notExercised: K[] = [];
    let attempted = 0;
    let exercisedKinds = 0;

    /** Did this envelope's evaluation reach the business phase under `state`? */
    function reachedBusiness(envelope: IntentEnvelope<K, P>, state: S): boolean {
      try {
        const { trace } = adjudicateWithTrace(envelope, state, pack.policy);
        return trace.some((e) => e.phase === "business");
      } catch {
        return false;
      }
    }

    function makeEnvelope(kind: K, payload: unknown, nonce: string, createdAt: string): IntentEnvelope<K, P> {
      return buildEnvelope({
        kind: kind as string,
        // UNTRUSTED taint is the proposer's posture — so the self-confirmation
        // field, not a high-trust actor, is the only thing distinguishing
        // baseline from variant.
        payload: payload as P,
        actor: { principal: "llm", sessionId: "conformance" },
        taint: "UNTRUSTED",
        nonce,
        createdAt,
      }) as IntentEnvelope<K, P>;
    }

    for (const kind of pack.intents) {
      const sample = payloadSamples[kind as string];
      const hasSample = Object.prototype.hasOwnProperty.call(payloadSamples, kind as string);
      const state = stateFor(kind);
      let kindExercised = false;
      let kindFailed = false;

      for (let i = 0; i < sampling && !kindFailed; i++) {
        attempted++;
        // Domain-valid base payload (caller-supplied sample) + per-iteration
        // probe markers so distinct envelopes are exercised deterministically.
        const basePayload: Record<string, unknown> = {
          ...((hasSample && sample !== null && typeof sample === "object")
            ? (sample as Record<string, unknown>)
            : {}),
          __selfConfirmProbe: true,
          seed: rng(),
        };
        const baseCreatedAt = deterministicTimestamp(rng);
        const baseline = makeEnvelope(kind, basePayload, deterministicNonce(rng), baseCreatedAt);

        // Non-vacuity gate: the baseline MUST reach the business stage, else a
        // self-confirm guard could never have fired and a "pass" would be
        // meaningless. A kind that never reaches business across all samples is
        // reported NOT-EXERCISED below.
        if (!reachedBusiness(baseline, state)) continue;
        kindExercised = true;

        let baselineKind: string;
        try {
          baselineKind = adjudicate(baseline, state, pack.policy).kind;
        } catch {
          // A baseline that throws is out of this check's scope (AC-001 owns
          // the throws-outside-the-kernel property). No differential possible.
          continue;
        }
        // If the baseline already EXECUTEs, there is no self-confirmation
        // differential to detect for this sample — the EXECUTE does not depend
        // on a confirmation field. Move on.
        if (baselineKind === "EXECUTE") continue;

        for (const field of SELF_CONFIRMATION_FIELDS) {
          for (const value of TRUTHY_VALUES) {
            const variant = makeEnvelope(
              kind,
              { ...basePayload, [field]: value },
              deterministicNonce(rng),
              baseCreatedAt,
            );
            let variantKind: string;
            try {
              variantKind = adjudicate(variant, state, pack.policy).kind;
            } catch {
              continue;
            }
            if (variantKind === "EXECUTE") {
              failures.push(
                `kind="${String(kind)}" EXECUTEs when payload carries a truthy ` +
                  `self-confirmation field "${field}"=${JSON.stringify(value)} ` +
                  `(domain-valid baseline without it was ${baselineKind}). A model can ` +
                  `mint its own confirmation — confirmation must flow only through the ` +
                  `kernel's intentHash-bound receipt path (plan 014, invariant #1/§C).`,
              );
              kindFailed = true;
              break;
            }
          }
          if (kindFailed) break;
        }
      }

      if (kindExercised) exercisedKinds++;
      else notExercised.push(kind);
    }

    if (failures.length > 0) {
      return {
        id: noPayloadSelfConfirmationCheck.id,
        name: noPayloadSelfConfirmationCheck.name,
        passed: false,
        details: `Payload self-confirmation bypass (${failures.length}): ${failures.join("; ")}`,
      };
    }

    // No proven bypass. Surface coverage honestly: a not-exercised kind is a
    // GAP (no business-reaching baseline), never a silent clean pass.
    const exercisedNote =
      `Verified ${attempted} baseline/variant differentials across ${exercisedKinds} ` +
      `business-reaching intent kind(s) — no payload field self-confirms an EXECUTE (plan 014).`;
    if (notExercised.length > 0) {
      return {
        id: noPayloadSelfConfirmationCheck.id,
        name: noPayloadSelfConfirmationCheck.name,
        passed: true,
        details:
          `${exercisedNote} NOT EXERCISED (no business-reaching baseline; supply ` +
          `options.validPayloadSamples to cover): ${notExercised.map(String).join(", ")}.`,
      };
    }
    return {
      id: noPayloadSelfConfirmationCheck.id,
      name: noPayloadSelfConfirmationCheck.name,
      passed: true,
      details: exercisedNote,
    };
  },
};
