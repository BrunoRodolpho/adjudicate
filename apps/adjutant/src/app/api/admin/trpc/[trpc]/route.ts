import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  extractActor,
  type ApprovalRequestParsed,
  type ApprovalResolveInput,
  type IncidentRowParsed,
  type RemediationProposalParsed,
} from "@adjudicate/admin-sdk";
import { adminRouter } from "@adjudicate/admin-sdk/trpc";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import { createConsoleSink, createMemoryLedger } from "@adjudicate/audit";
import type { AdopterExecutor } from "@adjudicate/adapter-core";
import { createInMemoryApprovalRegistry } from "@adjudicate/approval-engine";
import {
  createIncidentProjection,
  createInMemoryRemediationProposalStore,
  createPostgresIncidentProjection,
  createPostgresRemediationProposalStore,
  createRemediationOrchestrator,
  type IncidentProjection,
  type RemediationProposalStore,
  type RemediationSignal,
} from "@adjudicate/adjutant";
import { getPgPool, isPostgresBacked } from "@/lib/postgres-pool";
import type {
  Incident,
  IncidentIntentKind,
  IncidentState,
} from "@adjudicate/pack-incident-response";
import { requireConsoleAdminAuth } from "@/lib/admin-auth";

/**
 * tRPC route — mounts the @adjudicate/admin-sdk admin router under
 * /api/admin/trpc for the Adjutant operator app.
 *
 * At MODULE LOAD we build a DETERMINISTIC demo (fixed ISO timestamps, no
 * Math.random, counter-based approval tokens) and drive a handful of signals
 * through the Adjutant orchestrator so all three surfaces are populated:
 *   - Incidents   — the IncidentState joined with the IncidentProjection's
 *                   remediation status.
 *   - Proposals   — the RemediationProposalStore read-model.
 *   - Approvals   — the approval-engine registry; the seeded REVIEW-on-inc-3
 *                   leaves a single pending approval token ("tok-0").
 *
 * DETERMINISM: every store here is telemetry / coordination read-model, outside
 * the kernel determinism boundary. Seeding uses fixed timestamps for a
 * byte-stable demo; the live `resolve` path stamps `new Date()` (the app is a
 * server, not under the kernel determinism boundary).
 *
 * Auth: a `requireAuth` gate (`requireConsoleAdminAuth`) is passed to
 * `toNextRouteHandler` — the SDK refuses to mount in production without one.
 * The reference gate is a fail-closed shared-secret bearer check; adopters swap
 * in `withClerkAuth` / `withOidcAuth`.
 */

// ── Deterministic incident state ─────────────────────────────────────────────
const STATE: IncidentState = {
  incidents: new Map<string, Incident>([
    [
      "inc-1",
      {
        id: "inc-1",
        severity: "sev2",
        status: "open",
        dependencies: [],
        createdAt: "2026-06-12T08:00:00.000Z",
      },
    ],
    [
      "inc-2",
      {
        id: "inc-2",
        severity: "sev1",
        status: "investigating",
        dependencies: [{ service: "payments-api", status: "degraded" }],
        createdAt: "2026-06-12T08:05:00.000Z",
      },
    ],
    [
      "inc-3",
      {
        id: "inc-3",
        severity: "sev3",
        status: "open",
        dependencies: [],
        createdAt: "2026-06-12T08:10:00.000Z",
      },
    ],
  ]),
};

// ── In-memory adopter executor ───────────────────────────────────────────────
// Adjutant has NO executor of its own — the side effect ALWAYS routes through
// this, and only on a kernel EXECUTE.
const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
  invokeRead: async () => ({}),
  invokeIntent: async (env) => ({ ok: true, kind: env.kind }),
};

// Counter-based approval-token generator — deterministic, no RNG. The first
// pending_review proposal mints "tok-0".
let tokenCounter = 0;
const generateToken = (): string => `tok-${tokenCounter++}`;

// ── Stores + orchestrator ────────────────────────────────────────────────────
const registry = createInMemoryApprovalRegistry();

// P4: when DATABASE_URL is set, PROJECT real managed-agent runs — the proposal
// store reads the shared `remediation_proposals` table (the adopter's producer
// seam writes it on park) and the incident projection folds
// `ibx_domain.agent_runs`. No demo signals, no second adjudication. Otherwise
// fall back to the in-memory demo seed.
const dbBacked = isPostgresBacked();
const pgProposalStore = dbBacked
  ? createPostgresRemediationProposalStore({ sql: getPgPool() })
  : null;
const pgProjection = dbBacked
  ? createPostgresIncidentProjection({ sql: getPgPool() })
  : null;
const proposalStore: RemediationProposalStore =
  pgProposalStore ?? createInMemoryRemediationProposalStore();
const projection: IncidentProjection = pgProjection ?? createIncidentProjection();
const orch = createRemediationOrchestrator({
  executor,
  getState: () => STATE,
  sink: createConsoleSink(),
  ledger: createMemoryLedger(),
  approvalRegistry: registry,
  proposalStore,
  generateToken,
});

// ── Drive deterministic demo signals ─────────────────────────────────────────
// Each signal carries a fixed `at` (so the proposal/approval read-models are
// byte-stable) and a unique nonce (the proposalId). Order matters: the FIRST
// pending_review (inc-3) mints the "tok-0" pending approval token.
const DEMO_SIGNALS: ReadonlyArray<RemediationSignal> = [
  // SAFE on inc-1: blastRadius 50 is clamped (REWRITE) then re-adjudicated to
  // EXECUTE — executed.
  {
    incidentId: "inc-1",
    action: "rollback",
    blastRadius: 50,
    disposition: "SAFE",
    nonce: "sig-inc1-safe",
    at: "2026-06-12T09:00:00.000Z",
  },
  // MANUAL on inc-2: escalate (page oncall) — escalation executed.
  {
    incidentId: "inc-2",
    action: "escalate",
    blastRadius: 0,
    disposition: "MANUAL",
    reason: "page oncall",
    nonce: "sig-inc2-manual",
    at: "2026-06-12T09:05:00.000Z",
  },
  // REVIEW on inc-3: blastRadius 12 -> REQUEST_CONFIRMATION -> pending_review,
  // mints the pending approval token "tok-0".
  {
    incidentId: "inc-3",
    action: "patch",
    blastRadius: 12,
    disposition: "REVIEW",
    nonce: "sig-inc3-review",
    at: "2026-06-12T09:10:00.000Z",
  },
  // REVIEW on inc-1: blastRadius 30 -> ESCALATE -> pending_escalation.
  {
    incidentId: "inc-1",
    action: "failover",
    blastRadius: 30,
    disposition: "REVIEW",
    nonce: "sig-inc1-review",
    at: "2026-06-12T09:15:00.000Z",
  },
];

// Module-load seeding. When DB-backed (P4), load the LIVE projection from
// Postgres instead of running demo signals (per-request refresh happens in
// createContext). Otherwise top-level-await the deterministic demo seed (each
// signal awaited before the next so token minting is stable).
if (dbBacked) {
  await pgProposalStore!.init();
  await pgProjection!.refresh();
} else {
  for (const signal of DEMO_SIGNALS) {
    const outcome = await orch.handle(signal);
    projection.record(signal.incidentId, outcome, signal.at ?? "");
  }
}

// ── Context ports ────────────────────────────────────────────────────────────

const INCIDENT_STATUSES = [
  "open",
  "investigating",
  "remediating",
  "resolved",
  "escalated",
] as const;
type IncidentStatusLiteral = (typeof INCIDENT_STATUSES)[number];
const asIncidentStatus = (s: string): IncidentStatusLiteral | undefined =>
  (INCIDENT_STATUSES as readonly string[]).includes(s)
    ? (s as IncidentStatusLiteral)
    : undefined;

// incidentsPort — JOIN the IncidentState metadata with the projection's
// remediation status; apply status/limit filters.
const incidentsPort = {
  async list(
    filter?: { status?: string; limit?: number },
  ): Promise<ReadonlyArray<IncidentRowParsed>> {
    let rows: IncidentRowParsed[] = [...STATE.incidents.values()].map((inc) => {
      const entry = projection.get(inc.id);
      return {
        incidentId: inc.id,
        severity: inc.severity,
        status: inc.status,
        dependencies: inc.dependencies.map((d) => ({
          service: d.service,
          status: d.status,
        })),
        ...(entry?.lastDisposition
          ? { lastDisposition: entry.lastDisposition }
          : {}),
        executed: entry?.executed ?? false,
        pending: entry?.pending ?? null,
        updatedAt: entry?.updatedAt ?? inc.createdAt,
      };
    });
    if (filter?.status) {
      const wanted = asIncidentStatus(filter.status);
      rows = wanted ? rows.filter((r) => r.status === wanted) : [];
    }
    if (typeof filter?.limit === "number") {
      rows = rows.slice(0, filter.limit);
    }
    return rows;
  },
};

// proposalsPort — the RemediationProposalStore read-model mapped to the wire
// shape, dropping the internal `envelope` field.
const proposalsPort = {
  async list(filter?: {
    incidentId?: string;
    status?: string;
    limit?: number;
  }): Promise<ReadonlyArray<RemediationProposalParsed>> {
    const wantedStatus = filter?.status;
    let rows = proposalStore
      .list({
        ...(filter?.incidentId ? { incidentId: filter.incidentId } : {}),
      })
      .filter((p) => (wantedStatus ? p.status === wantedStatus : true))
      .map((p): RemediationProposalParsed => ({
        proposalId: p.proposalId,
        incidentId: p.incidentId,
        action: p.action,
        blastRadius: p.blastRadius,
        disposition: p.disposition,
        status: p.status,
        ...(p.approvalToken !== undefined ? { approvalToken: p.approvalToken } : {}),
        ...(p.intentHash !== undefined ? { intentHash: p.intentHash } : {}),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    if (typeof filter?.limit === "number") {
      rows = rows.slice(0, filter.limit);
    }
    return rows;
  },
};

// approvalPort — list reads the registry; resolve DRIVES the kernel
// confirmationReceipt re-adjudication via the orchestrator (approve/decline ->
// full re-adjudication of the parked envelope).
const approvalPort = {
  async list(
    filter: { status?: string; sessionId?: string; limit?: number },
  ): Promise<ReadonlyArray<ApprovalRequestParsed>> {
    return (await registry.list(
      filter as never,
    )) as ReadonlyArray<ApprovalRequestParsed>;
  },
  async resolve(
    input: ApprovalResolveInput,
    by: { id: string; displayName?: string },
  ): Promise<ApprovalRequestParsed> {
    const r = await orch.resolve({
      token: input.token,
      accepted: input.accepted,
      by,
      at: new Date().toISOString(),
    });
    if (!r.request) {
      throw new Error(`unknown approval token ${input.token}`);
    }
    return r.request as ApprovalRequestParsed;
  },
};

// ── Stores wired into context ────────────────────────────────────────────────
const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireConsoleAdminAuth,
  createContext: async (req) => {
    // P4: re-project the live data per request so the operator sees the latest
    // agent_runs + remediation_proposals (best-effort; ignore transient DB blips).
    if (dbBacked) {
      try {
        await pgProjection!.refresh();
        await pgProposalStore!.init();
      } catch {
        /* serve the last-loaded snapshot on a transient DB error */
      }
    }
    return {
      store,
      emergencyStore,
      actor: extractActor(req),
      incidentsPort,
      proposalsPort,
      approvalPort,
    };
  },
});
