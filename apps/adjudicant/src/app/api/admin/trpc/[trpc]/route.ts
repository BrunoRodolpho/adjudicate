import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  createInMemoryEscalationSink,
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
 *   apps/adjudicant = OBSERVER  — THIS app. Reads + escalate-only (114).
 *
 * This app mounts `readOnlyAdminRouter` — the full `adminRouter` MINUS every
 * AUTHORIZE/WEAKEN mutation procedure (`emergency.update`, `replay.run`,
 * `governance.recordOutcome`, `approval.resolve`), PLUS the ONE friction-
 * monotone write the observer plane IS permitted: `escalate.raise` (114). The
 * write-isolation is ROUTER-LEVEL (not context-level): the 4 authorize/weaken
 * procedures do not exist on the wire, so an OBSERVER physically cannot
 * authorize, weaken, or replay-mutate a decision — no amount of header forging
 * or context fiddling can reach one of those resolvers, because there is none to
 * reach. `escalate.raise` IS reachable, but it can only RECORD a friction-
 * increasing FACT (pause/review/escalate — never allow/bypass/override/EXECUTE);
 * it never produces a `Decision`. The kill switch is READ-status only here
 * (`emergency.state` / `emergency.history`); the kill-switch WRITE stays on the
 * OPERATOR console.
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
 * The impure ports the AUTHORIZE/WEAKEN mutations needed (`replayer`,
 * `outcomeSink`, `approvalPort.resolve`) are NOT wired — and could not be
 * reached even if they were, since the read-only router excludes those mutation
 * procedures. The ONE write port that IS wired is `escalationSink` (114): the
 * feature-detected sink for the friction-monotone `escalate.raise` write. A
 * real deployment swaps the in-memory sink for `createDurableEscalationSink`
 * (fail-OPEN durable log per the governance-plane precedent).
 */

// In-memory read stores. The Adjudicant is an OBSERVER: it never writes audit
// records or emergency state — these are read surfaces. A real deployment swaps
// in the cold-store reader (`@adjudicate/audit-postgres`) and the durable
// emergency-state reader; the read-only router contract is identical.
const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();
// 114 — the SINGLE write port the observer plane is permitted: the escalation
// sink backing the friction-monotone `escalate.raise` mutation. In-memory for
// the scaffold; production wires `createDurableEscalationSink({ log })` so an
// escalation is durably logged (fail-OPEN governance-plane write). The default
// per-actor rate limiter (SDK) applies; a host may inject `escalateRateLimiter`.
const escalationSink = createInMemoryEscalationSink();

export const { GET, POST } = toNextRouteHandler({
  router: readOnlyAdminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireAdjudicantAuth,
  createContext: async (req) => ({
    store,
    emergencyStore,
    escalationSink,
    // `actor` is required by AdminContext. Read procedures still actor-gate
    // (UNAUTHORIZED without an id); the gate above authenticates, this derives
    // the (now-trusted) identity from the headers. The escalate mutation is
    // gated identically (UNAUTHORIZED without an actor) and per-actor
    // rate-limited before any write.
    actor: extractActor(req),
  }),
});
