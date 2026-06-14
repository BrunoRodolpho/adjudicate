import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  IncidentRowSchema,
  RemediationProposalSchema,
  type IncidentRowParsed,
  type RemediationProposalParsed,
} from "../src/schemas/adjutant.js";

/**
 * tRPC coverage for the Adjutant operator surface (task 13): `adjutant.incidents`
 * + `adjutant.proposals`. Context-read posture; PRECONDITION_FAILED when a port
 * is unwired. Also pins that the proposal wire shape never carries the internal
 * envelope.
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({ store, emergencyStore, actor: null, ...ctx });
}

const INCIDENTS: IncidentRowParsed[] = [
  {
    incidentId: "inc-1",
    severity: "sev2",
    status: "open",
    dependencies: [],
    lastDisposition: "SAFE",
    executed: true,
    pending: null,
    updatedAt: "2026-06-12T09:00:00.000Z",
  },
  {
    incidentId: "inc-3",
    severity: "sev3",
    status: "open",
    dependencies: [{ service: "db", status: "degraded" }],
    lastDisposition: "REVIEW",
    executed: false,
    pending: { kind: "review", prompt: "Confirm remediation?" },
    updatedAt: "2026-06-12T09:10:00.000Z",
  },
];

const PROPOSALS: RemediationProposalParsed[] = [
  {
    proposalId: "p1",
    incidentId: "inc-3",
    action: "patch",
    blastRadius: 12,
    disposition: "REVIEW",
    status: "pending_review",
    approvalToken: "tok-0",
    intentHash: "f".repeat(64),
    createdAt: "2026-06-12T09:10:00.000Z",
    updatedAt: "2026-06-12T09:10:00.000Z",
  },
];

describe("adjutant.incidents", () => {
  it("returns incident rows when the port is wired", async () => {
    const caller = callerWith({ incidentsPort: { list: async () => INCIDENTS } });
    const res = await caller.adjutant.incidents({});
    expect(res).toHaveLength(2);
    expect(res[0]?.incidentId).toBe("inc-1");
    expect(res[1]?.pending?.kind).toBe("review");
  });

  it("throws PRECONDITION_FAILED when no incidents port is wired", async () => {
    const caller = callerWith({});
    await expect(caller.adjutant.incidents({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("adjutant.proposals", () => {
  it("returns proposals; the internal envelope is never on the wire", async () => {
    const caller = callerWith({ proposalsPort: { list: async () => PROPOSALS } });
    const res = await caller.adjutant.proposals({});
    expect(res[0]?.proposalId).toBe("p1");
    expect(res[0]?.status).toBe("pending_review");
    expect((res[0] as Record<string, unknown>).envelope).toBeUndefined();
  });

  it("throws PRECONDITION_FAILED when no proposals port is wired", async () => {
    const caller = callerWith({});
    await expect(caller.adjutant.proposals({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("adjutant schemas", () => {
  it("IncidentRowSchema + RemediationProposalSchema round-trip", () => {
    expect(IncidentRowSchema.parse(INCIDENTS[0])).toEqual(INCIDENTS[0]);
    expect(RemediationProposalSchema.parse(PROPOSALS[0])).toEqual(PROPOSALS[0]);
  });

  it("RemediationProposalSchema strips an internal envelope if present", () => {
    const withEnvelope = { ...PROPOSALS[0], envelope: { kind: "x" } };
    const parsed = RemediationProposalSchema.parse(withEnvelope) as Record<string, unknown>;
    expect(parsed.envelope).toBeUndefined();
  });
});
