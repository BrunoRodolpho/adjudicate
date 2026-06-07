import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  extractActor,
  type AuditStore,
  type EmergencyStateStore,
} from "@adjudicate/admin-sdk";
import { adminRouter } from "@adjudicate/admin-sdk/trpc";
import type {
  BehavioralDriftResultParsed,
  RedTeamReportParsed,
} from "@adjudicate/admin-sdk";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import {
  generateAllVectors,
  runRedTeam,
  type RedTeamPack,
} from "@adjudicate/red-team";
import { createDriftDetector } from "@adjudicate/drift";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { createRedisEmergencyStateStore } from "@adjudicate/audit";
import {
  createPostgresAuditStore,
  createPostgresGovernanceLog,
} from "@adjudicate/audit-postgres";
import {
  describePolicyBundle,
  GuardFireStats,
  type PolicyBundle,
  type PolicyBundleDescriptor,
} from "@adjudicate/core";
import { ALL_MOCKS } from "@/lib/mocks";
import { createDurableEmergencyStore } from "@/lib/durable-emergency-store";
import {
  createPgPoolGovernanceWriter,
  createPgPoolReader,
  getPgPool,
} from "@/lib/postgres-pool";
import { createLazyRedisLedgerAdapter } from "@/lib/redis-client";
import { createReferenceReplayInvoker } from "@/lib/replay-invoker";
import { PackRegistry } from "@/lib/packs/registry";
import { isProductionEnv } from "@/lib/runtime-mode";

/**
 * Reference auth gate (AuthReviewer-007 / ConfigReviewer-004). The admin SDK now
 * REQUIRES a `requireAuth` hook — without one it refuses to mount in production.
 * This reference gate enforces a shared-secret bearer token from
 * `ADMIN_API_TOKEN`; a real deployment swaps in `withClerkAuth` / `withOidcAuth`
 * (see the toNextRouteHandler JSDoc). It is fail-CLOSED in production: with no
 * token configured every request is rejected rather than trusting the forgeable
 * `x-adjudicate-actor-*` headers. Local dev (non-production, no token) leaves the
 * gate open for convenience — insecure by design, for demos only.
 */
function requireConsoleAdminAuth(req: Request): void | Response {
  const expected = process.env.ADMIN_API_TOKEN;
  if (expected) {
    if (req.headers.get("authorization") !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    return;
  }
  if (isProductionEnv()) {
    // No auth configured in production → refuse rather than serve the admin API
    // on header-trust alone.
    return new Response(
      "Admin API auth not configured (set ADMIN_API_TOKEN or wire withClerkAuth/withOidcAuth)",
      { status: 503 },
    );
  }
  // Local dev: open gate (documented insecure-by-design).
}

/**
 * tRPC route — mounts the @adjudicate/admin-sdk admin router under
 * /api/admin/trpc. Two independent storage axes:
 *
 *   DATABASE_URL? → AuditStore (audit explorer reads), governance log
 *   REDIS_URL? + EMERGENCY_REDIS_KEY? → live emergency state coordination
 *
 * Storage matrix (Phase 1.5d):
 *
 *   DATABASE_URL  REDIS_URL  AuditStore       EmergencyStateStore
 *   ────────────  ─────────  ───────────────  ────────────────────────────
 *   no            no         in-memory mocks  in-memory only (volatile)
 *   yes           no         Postgres         in-memory state + Postgres log
 *   no            yes        in-memory mocks  Redis-coordinated, no log
 *   yes           yes        Postgres         Redis-coordinated + Postgres log
 *                                              (the "real-world" shape)
 *
 * The full-stack mode (both env vars set) is the "synthetic ceiling
 * removed" configuration — toggling DENY_ALL in this Console halts every
 * replica running the kernel's `startDistributedKillSwitch` poller
 * against the same Redis key, and the operator action is durably logged
 * to Postgres for compliance review.
 *
 * Live emergency state stays in-memory unless REDIS_URL is set: the
 * kernel polls Redis, not Postgres, so a Postgres-backed live state
 * would be a "hallucination of control."
 *
 * Auth: a `requireAuth` gate (`requireConsoleAdminAuth`, below) is now passed
 * to `toNextRouteHandler` — the SDK refuses to mount in production without one.
 * The reference gate is a fail-closed shared-secret bearer check; adopters swap
 * in `withClerkAuth` / `withOidcAuth` that verify a real OIDC/SAML/Clerk session
 * before `extractActor` reads the `x-adjudicate-actor-*` headers.
 */
function createStores(): {
  auditStore: AuditStore;
  emergencyStore: EmergencyStateStore;
} {
  // Audit-side: Postgres if DATABASE_URL, mocks otherwise.
  const auditStore: AuditStore = process.env.DATABASE_URL
    ? createPostgresAuditStore({ reader: createPgPoolReader(getPgPool()) })
    : createInMemoryAuditStore({ records: ALL_MOCKS });

  // Live state backend: Redis if REDIS_URL + EMERGENCY_REDIS_KEY are
  // both set; otherwise in-memory.
  const liveStateStore: EmergencyStateStore =
    process.env.REDIS_URL && process.env.EMERGENCY_REDIS_KEY
      ? createRedisEmergencyStateStore({
          redis: createLazyRedisLedgerAdapter(),
          key: process.env.EMERGENCY_REDIS_KEY,
        })
      : createInMemoryEmergencyStateStore();

  // History layering: Postgres governance log if DATABASE_URL is set;
  // otherwise the live state's history (empty for Redis state-only,
  // in-memory ring for in-memory state).
  let emergencyStore: EmergencyStateStore = liveStateStore;
  if (process.env.DATABASE_URL) {
    const pool = getPgPool();
    const reader = createPgPoolReader(pool);
    const writer = createPgPoolGovernanceWriter(pool);
    const log = createPostgresGovernanceLog({ reader, writer });
    emergencyStore = createDurableEmergencyStore({
      stateStore: liveStateStore,
      log,
    });
  }

  return { auditStore, emergencyStore };
}

const { auditStore, emergencyStore } = createStores();

// Reference console always wires the replay capability against the
// installed PIX Pack with synthetic state. Adopters fork
// `apps/console/src/lib/replay-invoker.ts` for production replay.
const replayer = createReferenceReplayInvoker();

// Process-singleton GuardFireStats — survives every request in this Node
// instance. Resets on cold-start (which is fine for v0.1's in-memory
// accumulator; persistent backing arrives in Phase 1.5C).
const guardFireStats = new GuardFireStats({
  resolvePackId: (intentKind) => PackRegistry.match(intentKind)?.pack.id,
});

// Snapshot the first installed Pack's policy. The console runs a small
// fixed set of Packs; if multiple are installed, the descriptor for the
// first is what `governance.describePolicy` returns. Multi-Pack composition
// is a future ticket (Phase 1.5+ — derivePack).
const firstPack = PackRegistry.all()[0]?.pack;
// `InstalledPackInfo.policy` is typed `unknown` so heterogeneous Packs can
// coexist in the adapter list; the kernel reads it through the same opaque
// channel. For the descriptor we widen back to the generic PolicyBundle
// signature — describePolicyBundle is variance-safe (reads only structure).
const policyDescriptor: PolicyBundleDescriptor | undefined = firstPack
  ? describePolicyBundle(
      firstPack.policy as PolicyBundle<string, unknown, unknown>,
    )
  : undefined;

// Pre-compute the adversarial red-team report once at startup (ADR-118). The
// kernel run is pure + deterministic; the report feeds the console's Red-Team
// panel via `governance.redTeam`.
const redTeamPack = deploymentsApprovalPack as unknown as RedTeamPack;
const redTeamReport = runRedTeam(
  redTeamPack,
  generateAllVectors(redTeamPack),
) as unknown as RedTeamReportParsed;

// Behavioral-drift detector (ADR-119). The console has no live AuditEventBus, so
// warm the detector by replaying the mock audit records at startup. A real
// deployment wires `detector.attach(auditEventBus)` instead.
const driftDetector = createDriftDetector({
  baselineWindow: 500,
  recentWindow: 100,
  alertThreshold: 0.25,
  dimensions: ["decision.kind", "intent.kind", "basis"],
});
for (const record of ALL_MOCKS) driftDetector.observe(record);

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireConsoleAdminAuth,
  createContext: (req) => ({
    store: auditStore,
    emergencyStore,
    actor: extractActor(req),
    replayer,
    guardFireStats,
    redTeamReport,
    driftDetector: driftDetector as unknown as {
      snapshot(): BehavioralDriftResultParsed;
    },
    ...(policyDescriptor ? { policyDescriptor } : {}),
  }),
});
