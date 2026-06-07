import { installPack } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import {
  accessGovernancePack,
  rehydrateAccessState,
} from "@adjudicate/pack-access-governance";
import type { ConsolePackAdapter } from "../adapter";

/**
 * Console adapter for `@adjudicate/pack-access-governance`.
 *
 * Synthetic state: empty reviews/grants by default — the policy DEFERs/ESCALATEs
 * fresh requests. This reproduces the recorded outcome for the common pending /
 * sensitive paths; richer reconstruction would need the review history.
 */
const { pack } = installPack(accessGovernancePack);

export const accessAdapter: ConsolePackAdapter = {
  pack,
  displayName: "Access Governance",
  async getSyntheticState(_record: AuditRecord) {
    return rehydrateAccessState({ reviews: {}, grants: {} });
  },
};
