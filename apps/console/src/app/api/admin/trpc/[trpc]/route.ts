import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  extractActor,
  type AuditStore,
  type EmergencyStateStore,
} from "@adjudicate/admin-sdk";
import { adminRouter } from "@adjudicate/admin-sdk/trpc";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import { createRedisEmergencyStateStore } from "@adjudicate/audit";
import {
  createPostgresAuditStore,
  createPostgresGovernanceLog,
} from "@adjudicate/audit-postgres";
import { ALL_MOCKS } from "@/lib/mocks";
import { createDurableEmergencyStore } from "@/lib/durable-emergency-store";
import {
  createPgPoolGovernanceWriter,
  createPgPoolReader,
  getPgPool,
} from "@/lib/postgres-pool";
import { createLazyRedisLedgerAdapter } from "@/lib/redis-client";
import { createReferenceReplayInvoker } from "@/lib/replay-invoker";

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
 * Auth: NONE at this layer. Adopters MUST gate this route with auth
 * middleware that populates `x-adjudicate-actor-*` headers AFTER
 * verifying the OIDC/SAML/Clerk session. The SDK trusts whatever the
 * headers contain.
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

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin/trpc",
  createContext: (req) => ({
    store: auditStore,
    emergencyStore,
    actor: extractActor(req),
    replayer,
  }),
});
