/**
 * AC-007 — a Pack payload must not self-confirm (plan 014).
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
 * Pack's actual `adjudicate()` behavior. For every intent kind it builds a
 * BASELINE envelope (clean payload) and a set of VARIANT envelopes that add a
 * single candidate self-confirmation field set to a truthy attacker-supplied
 * value. If adding such a field flips a non-EXECUTE baseline into an EXECUTE,
 * the Pack lets a model self-confirm — the exact `executeConfirmedRevoke` /
 * `allowConfirmedRollback` bypass plan 014 deletes. The differential is the
 * precise, non-vacuous signal: a field with no effect on the decision never
 * fails the check.
 *
 * **Determinism.** Same seeded LCG cadence as AC-001 (seed 42 default, no
 * `Math.random()`). Two runs of the same `(pack, options)` produce a
 * byte-identical result.
 */

import { buildEnvelope } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg } from "../prng.js";
import { emptyStateFor } from "../state.js";

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
  id: "AC-007",
  name: "Pack payloads must not self-confirm (no model-minted confirmation field)",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);
    const emptyState = emptyStateFor(pack);

    const failures: string[] = [];
    let attempted = 0;

    for (const kind of pack.intents) {
      for (let i = 0; i < sampling; i++) {
        attempted++;
        // A stable per-iteration base payload. We probe with UNTRUSTED taint —
        // the proposer's posture — so the field, not a high-trust actor, is the
        // only thing distinguishing baseline from variant.
        const basePayload = { __selfConfirmProbe: true, seed: rng() } as Record<string, unknown>;
        const baseNonce = deterministicNonce(rng);
        const baseCreatedAt = deterministicTimestamp(rng);

        const baseline = buildEnvelope({
          kind: kind as string,
          payload: { ...basePayload } as P,
          actor: { principal: "llm", sessionId: "conformance" },
          taint: "UNTRUSTED",
          nonce: baseNonce,
          createdAt: baseCreatedAt,
        }) as IntentEnvelope<K, P>;

        let baselineKind: string;
        try {
          baselineKind = adjudicate(baseline, emptyState, pack.policy).kind;
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
            const variant = buildEnvelope({
              kind: kind as string,
              payload: { ...basePayload, [field]: value } as P,
              actor: { principal: "llm", sessionId: "conformance" },
              taint: "UNTRUSTED",
              // Vary the nonce so the variant is a distinct envelope; the field,
              // not nonce reuse, drives any decision change.
              nonce: deterministicNonce(rng),
              createdAt: baseCreatedAt,
            }) as IntentEnvelope<K, P>;

            let variantKind: string;
            try {
              variantKind = adjudicate(variant, emptyState, pack.policy).kind;
            } catch {
              continue;
            }
            if (variantKind === "EXECUTE") {
              failures.push(
                `kind="${String(kind)}" EXECUTEs when payload carries a truthy ` +
                  `self-confirmation field "${field}"=${JSON.stringify(value)} ` +
                  `(baseline without it was ${baselineKind}). A model can mint its own ` +
                  `confirmation — confirmation must flow only through the kernel's ` +
                  `intentHash-bound receipt path (plan 014, invariant #1/§C).`,
              );
              // First proven bypass per kind is enough; stop drilling this kind.
              break;
            }
          }
          if (failures.length > 0 && failures[failures.length - 1]!.startsWith(`kind="${String(kind)}"`)) {
            break;
          }
        }
        if (failures.length > 0) break;
      }
    }

    if (failures.length > 0) {
      return {
        id: noPayloadSelfConfirmationCheck.id,
        name: noPayloadSelfConfirmationCheck.name,
        passed: false,
        details: `Payload self-confirmation bypass (${failures.length}): ${failures.join("; ")}`,
      };
    }
    return {
      id: noPayloadSelfConfirmationCheck.id,
      name: noPayloadSelfConfirmationCheck.name,
      passed: true,
      details:
        `Verified ${attempted} baseline/variant differentials across ${pack.intents.length} ` +
        `intent kind(s) — no payload field self-confirms an EXECUTE (plan 014).`,
    };
  },
};
