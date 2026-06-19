"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  EscalateInput,
  RecordedEscalation,
} from "@adjudicate/admin-sdk";
import { trpc } from "@/lib/trpc-client";

/**
 * 114 — raises a friction-monotone escalation/recommendation against an audited
 * decision via the SOLE write the Inspector-General OBSERVER plane permits:
 * `escalate.raise`.
 *
 * This is the ONE `.mutate(...)` call site in the whole Adjudicant app. It is
 * safe on the observer plane precisely because it is friction-INCREASING by
 * construction:
 *   - its input `recommendation` is the closed friction-only enum
 *     (pause / review / escalate) — there is NO allow/bypass/override/EXECUTE
 *     value, so the UI cannot express, and the wire cannot accept, a
 *     friction-DECREASING recommendation (§C / §D inv.7 monotonicity);
 *   - its result is a recorded FACT (`RecordedEscalation`), never a `Decision`.
 *
 * The procedure is actor-gated (UNAUTHORIZED without an actor header) and
 * per-actor rate-limited (TOO_MANY_REQUESTS over the window) on the server. The
 * authorize/weaken mutations (`emergency.update`, `approval.resolve`,
 * `governance.recordOutcome`, `replay.run`) are NOT members of the read-only
 * client's type — calling one is a compile error.
 */
export function useRaiseEscalation() {
  return useMutation<RecordedEscalation, Error, EscalateInput>({
    mutationKey: ["adjudicant", "escalate", "raise"],
    mutationFn: (input: EscalateInput) => trpc.escalate.raise.mutate(input),
    retry: false,
  });
}
