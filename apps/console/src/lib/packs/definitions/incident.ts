import { installPack } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import {
  incidentResponsePack,
  rehydrateIncidentState,
} from "@adjudicate/pack-incident-response";
import type { ConsolePackAdapter } from "../adapter";

/**
 * Console adapter for `@adjudicate/pack-incident-response`.
 *
 * Synthetic state: reconstruct a single open incident keyed off the record's
 * `incidentId` (no down dependencies) so replay reproduces the recorded
 * non-DEFER outcome. Records without an incidentId yield an empty map.
 */
const { pack } = installPack(incidentResponsePack);

export const incidentAdapter: ConsolePackAdapter = {
  pack,
  displayName: "Incident Response",
  async getSyntheticState(record: AuditRecord) {
    const incidentId = (record.envelope.payload as { incidentId?: string }).incidentId;
    if (!incidentId) return rehydrateIncidentState({ incidents: {} });
    return rehydrateIncidentState({
      incidents: {
        [incidentId]: {
          id: incidentId,
          severity: "sev2",
          status: "investigating",
          dependencies: [],
          createdAt: record.envelope.createdAt,
        },
      },
    });
  },
};
