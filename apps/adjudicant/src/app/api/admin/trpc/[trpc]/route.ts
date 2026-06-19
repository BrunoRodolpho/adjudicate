import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  extractActor,
} from "@adjudicate/admin-sdk";
import { readOnlyAdminRouter } from "@adjudicate/admin-sdk/trpc";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import { requireAdjudicantAuth } from "@/lib/admin-auth";

/**
 * tRPC route — mounts the @adjudicate/admin-sdk **READ-ONLY** admin router under
 * /api/admin/trpc for the Adjudicant (Inspector-General) observer app.
 *
 * ── Separation of powers (the THIRD plane) ──────────────────────────────────
 *   apps/console    = OPERATOR  — kill-switch WRITE, replay.run, recordOutcome.
 *   apps/adjutant   = APPROVER  — approval.resolve RE-ADJUDICATES (→ EXECUTE).
 *   apps/adjudicant = OBSERVER  — THIS app. Reads + (later, 114) escalate-only.
 *
 * This app mounts `readOnlyAdminRouter` — the full `adminRouter` MINUS every
 * mutation procedure (`emergency.update`, `replay.run`,
 * `governance.recordOutcome`, `approval.resolve`). The write-isolation is
 * ROUTER-LEVEL (not context-level): those procedures do not exist on the wire,
 * so an OBSERVER physically cannot authorize, weaken, or replay-mutate a
 * decision — no amount of header forging or context fiddling can reach a
 * mutation resolver, because there is none to reach. The kill switch is
 * READ-status only here (`emergency.state` / `emergency.history`); the kill-
 * switch WRITE stays on the OPERATOR console.
 *
 * ── Auth ────────────────────────────────────────────────────────────────────
 * A `requireAuth` gate (`requireAdjudicantAuth`) is passed to
 * `toNextRouteHandler` — the SDK refuses to mount in production without one
 * (the SDK-layer mitigation of the forgeable `extractActor` header gap). The
 * reference gate is a fail-closed shared-secret bearer check; adopters swap in
 * `withClerkAuth` / `withOidcAuth`. `extractActor` remains a TRUST boundary,
 * not an authenticator — the host supplies real auth in `requireAuth`.
 *
 * ── Stores ──────────────────────────────────────────────────────────────────
 * The scaffold wires in-memory read stores so the shell builds and serves with
 * no external infra. The pure-read ports (turnTrace, guardFireStats,
 * policyDescriptor, killSwitchTimeline, …) are intentionally OMITTED — each
 * self-fences via PRECONDITION_FAILED until 112+ wires the corresponding view.
 * The impure ports the mutations needed (`replayer`, `outcomeSink`,
 * `approvalPort.resolve`) are NOT wired — and could not be reached even if they
 * were, since the read-only router excludes those mutation procedures.
 */

// In-memory read stores. The Adjudicant is an OBSERVER: it never writes audit
// records or emergency state — these are read surfaces. A real deployment swaps
// in the cold-store reader (`@adjudicate/audit-postgres`) and the durable
// emergency-state reader; the read-only router contract is identical.
const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

export const { GET, POST } = toNextRouteHandler({
  router: readOnlyAdminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireAdjudicantAuth,
  createContext: async (req) => ({
    store,
    emergencyStore,
    // `actor` is required by AdminContext. Read procedures still actor-gate
    // (UNAUTHORIZED without an id); the gate above authenticates, this derives
    // the (now-trusted) identity from the headers.
    actor: extractActor(req),
  }),
});
