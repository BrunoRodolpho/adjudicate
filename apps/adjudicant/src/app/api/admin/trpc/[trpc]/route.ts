import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  createInMemoryEscalationSink,
  extractActor,
  type GovernanceEvent,
  type KillSwitchTimelineReportParsed,
} from "@adjudicate/admin-sdk";
import { readOnlyAdminRouter } from "@adjudicate/admin-sdk/trpc";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import { GuardFireStats } from "@adjudicate/core";
import {
  analyzeKillSwitchTimeline,
  type KillSwitchEvent,
} from "@adjudicate/audit";
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

// 115 — Governance dashboards (READ-ONLY). The guard-fire accumulator is a
// process singleton: the OBSERVER reads per-guard fire counts through it via the
// pure `.query` `governance.guardFireStats`. Wiring it (vs leaving it omitted)
// surfaces the dashboard view; an adopter that does NOT wire it gets
// PRECONDITION_FAILED, the same runtime feature-detection every governance view
// uses. `governance.outcomeDistribution` reads the AuditStore directly and needs
// no extra port. NOTE: this is read-only telemetry, outside the determinism
// boundary — it never feeds a kernel decision (the OBSERVER plane has no kernel).
const guardFireStats = new GuardFireStats();

// 115 — Kill-switch READ-status (the activation-timeline roll-up). The OBSERVER
// shows the engage/clear timeline; the kill-switch WRITE (`emergency.update`)
// stays on the OPERATOR console and is structurally absent from this plane. We
// map the emergency/governance event history (GovernanceEvent) onto the pure
// analyzer's `KillSwitchEvent[]` and run `analyzeKillSwitchTimeline` adopter-side
// so `governance.killSwitchTimeline` stays a pure `.query` (no clock/RNG in the
// resolver — the analyzer is deterministic over the recorded sequence).
//
// Mapping: GovernanceEvent carries previousStatus/newStatus/reason/actor/at but
// no explicit `source`, so operator updates map to source 'operator'. A DENY_ALL
// newStatus is a `trip` (state 'active'); any other newStatus (NORMAL) is a
// `clear` (state 'normal'). History is newest-first; the analyzer is
// order-sensitive and does NOT sort, so we reverse to chronological
// (oldest-first) before analysis.
function governanceEventToKillSwitchEvent(e: GovernanceEvent): KillSwitchEvent {
  const tripped = e.newStatus === "DENY_ALL";
  return {
    at: e.at,
    kind: tripped ? "trip" : "clear",
    state: tripped ? "active" : "normal",
    source: "operator",
    reason: e.reason,
    actor: e.actor.displayName ?? e.actor.id,
  };
}

/**
 * Compute the kill-switch timeline report from the live emergency history. An
 * empty history yields a `stable`/empty report (the feature stays AVAILABLE, not
 * PRECONDITION_FAILED) — the OBSERVER renders "no incidents" rather than a
 * not-configured error. The history read is pure: it never engages the WRITE
 * (`update`) path (the OBSERVER cannot toggle the switch).
 */
async function computeKillSwitchTimeline(): Promise<KillSwitchTimelineReportParsed> {
  let history: readonly GovernanceEvent[] = [];
  try {
    // Cap matches the emergency.history UI default ceiling.
    history = await emergencyStore.history(100);
  } catch {
    history = [];
  }
  // History is newest-first; the analyzer is order-sensitive — reverse to
  // chronological order before mapping.
  const events = [...history].reverse().map(governanceEventToKillSwitchEvent);
  return analyzeKillSwitchTimeline(
    events,
  ) as unknown as KillSwitchTimelineReportParsed;
}

export const { GET, POST } = toNextRouteHandler({
  router: readOnlyAdminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireAdjudicantAuth,
  createContext: async (req) => ({
    store,
    emergencyStore,
    escalationSink,
    // 115 — governance read ports (pure-read, feature-detected). The policy
    // descriptor/manifest ports stay OMITTED in this scaffold (an OBSERVER does
    // not install adopter packs), so `governance.describePolicy` /
    // `governance.policyManifest` self-fence with PRECONDITION_FAILED until an
    // adopter wires a recorded policy snapshot — the same posture every other
    // optional governance view uses.
    guardFireStats,
    killSwitchTimeline: await computeKillSwitchTimeline(),
    // `actor` is required by AdminContext. Read procedures still actor-gate
    // (UNAUTHORIZED without an id); the gate above authenticates, this derives
    // the (now-trusted) identity from the headers. The escalate mutation is
    // gated identically (UNAUTHORIZED without an actor) and per-actor
    // rate-limited before any write.
    actor: extractActor(req),
  }),
});
