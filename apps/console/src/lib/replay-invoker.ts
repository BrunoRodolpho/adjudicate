import { adjudicate } from "@adjudicate/core/kernel";
import {
  ReplayError,
  type ReplayInvoker,
} from "@adjudicate/admin-sdk";
import { PackRegistry } from "./packs/registry";

/**
 * Reference console's `ReplayInvoker` — synthetic-state implementation
 * dispatched per-Pack via `PackRegistry`.
 *
 * # FORK THIS FILE for production deployments.
 *
 * This implementation answers the question: "if this exact intent
 * envelope was adjudicated under CURRENT policy + a SYNTHESIZED state,
 * what would happen?" The synthesized state is plausible but NOT the
 * actual world state at decision time.
 *
 * Honest limitation: any mismatch surfaced by the replay diff could be
 * EITHER a policy regression OR a state divergence. The Replay UI's
 * "State: synthetic (demo)" chip is operators' visual reminder.
 *
 * For production-grade regression detection, an adopter forks this file
 * and wires a real state retriever. Two strategies:
 *
 *   - State-history table: the adopter persists state snapshots keyed
 *     by intentHash + decisionTime; the retriever fetches the snapshot.
 *     This answers the "policy-regression" question precisely.
 *   - Current-state retrieval: the retriever fetches the resource's
 *     current state. This answers a different (but useful) question:
 *     "is this old intent still valid under current world state?"
 *
 * # The Pack Registry
 *
 * Phase 4 introduces a multi-Pack registry (`apps/console/src/lib/packs`).
 * The invoker is now Pack-agnostic: it resolves the right adapter from
 * the record's intent kind, asks the adapter to synthesize state, then
 * runs the kernel against that adapter's policy. Adding a fourth Pack
 * is one new adapter file plus a one-line registry entry — the
 * invoker is closed against further edits for routine Pack additions.
 *
 * Pack-installation symmetry — installing the same Packs in the
 * Console as in the adopter's running application — is the adopter's
 * deployment responsibility. Document this in your runbook.
 */

export function createReferenceReplayInvoker(): ReplayInvoker {
  return {
    async replay(record) {
      const adapter = PackRegistry.match(record.envelope.kind);
      if (!adapter) {
        throw new ReplayError(
          "REPLAY_NO_POLICY",
          `No installed Pack handles intent kind "${record.envelope.kind}". Register the Pack adapter in apps/console/src/lib/packs/registry.ts.`,
        );
      }

      const state = await adapter.getSyntheticState(record);

      try {
        // Casts: `AuditRecord.envelope` is the generic `IntentEnvelope`;
        // the per-Pack policy expects narrowed types. The cast is the
        // type-system price for replaying historical records that
        // predate any local generic context — the kernel's runtime
        // checks (taint, conformance, basis-audit) protect correctness.
        const decision = adjudicate(
          record.envelope as never,
          state as never,
          adapter.pack.policy as never,
        );
        return {
          decision,
          stateSource: "synthetic" as const,
        };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        throw new ReplayError(
          "REPLAY_FAILED",
          `adjudicate() threw during replay: ${e.message}`,
        );
      }
    },
  };
}
