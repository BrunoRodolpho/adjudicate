import type { AuditRecord, Decision } from "@adjudicate/core";
import type { StateSource } from "../schemas/replay.js";

/**
 * Adopter-implemented contract for re-adjudicating a historical
 * `AuditRecord` against currently-installed policy.
 *
 * The framework intentionally does NOT prescribe how state is retrieved.
 * `AuditRecord` carries the envelope (input) and decision (output) but
 * NOT the world state at decision time — that's adopter persistence the
 * framework never owned. Each `ReplayInvoker` implementation answers a
 * different question depending on its state-retrieval strategy:
 *
 *   - `synthetic` state retrieval: "would this envelope produce the same
 *     decision under current policy if state were X?" (X is approximate)
 *   - `adopter`-supplied state history: "would this envelope produce the
 *     same decision under current policy at the original state?"
 *   - Current-state retrieval: "is this old intent still valid given
 *     current world state?" (time-confused; answers a different question)
 *
 * Implementations MUST surface their state-retrieval fidelity via
 * `stateSource`. Operators reading the diff cannot distinguish policy
 * regression from state divergence without it.
 *
 * Reference implementations:
 *   - `apps/console/src/lib/replay-invoker.ts` — synthetic state for the
 *     PIX demo Pack. Adopters fork to wire their real retrieval.
 */
export interface ReplayInvoker {
  replay(record: AuditRecord): Promise<{
    decision: Decision;
    stateSource: StateSource;
  }>;
}

/**
 * Typed errors the invoker may throw. The tRPC `replay.run` procedure
 * surfaces these as structured errors the UI can render distinctly
 * from generic exceptions.
 */
export type ReplayErrorCode =
  | "REPLAY_NO_POLICY" // Pack for record's intent kind not installed
  | "REPLAY_NO_STATE" // State retrieval failed
  | "REPLAY_FAILED"; // adjudicate() threw — likely envelope schema issue

export class ReplayError extends Error {
  constructor(
    public readonly code: ReplayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReplayError";
  }
}
