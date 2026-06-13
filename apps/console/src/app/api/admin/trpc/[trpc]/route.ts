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
  ConfigSealReportParsed,
  DriftHistoryQuery,
  DriftHistoryResultParsed,
  KillSwitchTimelineReportParsed,
  PackConfigSealEntryParsed,
  RedTeamHistoryQuery,
  RedTeamHistoryResultParsed,
  RedTeamReportParsed,
  TokenBudgetByTenantResult,
  TokenBudgetQuery,
  TokenBudgetResult,
  TokenBudgetTenantQuery,
} from "@adjudicate/admin-sdk";
import { deriveSealViolations } from "@adjudicate/admin-sdk";
import {
  sealPackConfig,
  verifyConfigSeal,
  type SealablePackInput,
} from "@adjudicate/conformance";
import { analyzePolicy, describeInstalledPacks } from "@adjudicate/analyze";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYMENT_POLICY_COHERENCE_PROBES } from "@/lib/policy-coherence-probes";
import {
  generateAiBom,
  runConformance,
  scorePackHealth,
  type PackFingerprintInput,
  type PackManifest,
} from "@adjudicate/conformance";
import type { AiBomParsed, PolicyCoherenceReportParsed } from "@adjudicate/admin-sdk";
import {
  createInMemoryApprovalRegistry,
  createRedisApprovalRegistry,
  type ApprovalRegistry,
  type ApprovalRequest,
} from "@adjudicate/approval-engine";
import {
  applyCostTable,
  createInMemoryMemoryStore,
  createInMemoryTokenUsageStore,
  type PriceTable,
  type TokenUsageSample,
} from "@adjudicate/adapter-core";
import type {
  ApprovalRequestParsed,
  ApprovalResolveInput,
  ApprovalHistoryQuery,
  ApprovalHistoryResult,
  ApprovalChainQuery,
  ApprovalChainResult,
} from "@adjudicate/admin-sdk";
import { toNextRouteHandler } from "@adjudicate/admin-sdk/adapters/next";
import {
  createInMemoryRedTeamHistoryStore,
  generateAllVectors,
  runRedTeam,
  runRedTeamAcrossPacks,
  type RedTeamPack,
} from "@adjudicate/red-team";
import {
  createDriftDetector,
  createDriftHistory,
  type DriftAlert,
} from "@adjudicate/drift";
import { DRIFT_CONFIG } from "@/lib/drift-config";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";
import {
  analyzeKillSwitchTimeline,
  createRedisEmergencyStateStore,
  type KillSwitchEvent,
} from "@adjudicate/audit";
import type { GovernanceEvent } from "@adjudicate/admin-sdk";
import {
  PolicyManifestSchema,
  type PolicyManifestParsed,
} from "@adjudicate/admin-sdk";
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
import {
  ALL_MOCKS,
  DECISION_OUTCOME_MOCKS,
  DEPLOYMENT_ROLLBACK_RESUMED_HASH,
} from "@/lib/mocks";
import { createDurableEmergencyStore } from "@/lib/durable-emergency-store";
import {
  createPgPoolGovernanceWriter,
  createPgPoolReader,
  getPgPool,
} from "@/lib/postgres-pool";
import {
  createLazyRedisApprovalAdapter,
  createLazyRedisLedgerAdapter,
} from "@/lib/redis-client";
import { createReferenceReplayInvoker } from "@/lib/replay-invoker";
import { PackRegistry } from "@/lib/packs/registry";
import { requireConsoleAdminAuth } from "@/lib/admin-auth";
import { getAuditBus } from "@/lib/audit-bus";

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

// Policy manifest for the rule-provenance tree (/policy-tree). Prefer a
// committed adopter manifest (e.g. `policy-manifests/ibatexas.json`, produced
// by `ibx policy export` in the ibatexas repo); otherwise compute one live
// from adjudicate's own shipped Packs so the tree always has real data to
// render. The live builder output matches the wire schema by construction.
function loadPolicyManifest(): PolicyManifestParsed | undefined {
  try {
    const dir = join(process.cwd(), "policy-manifests");
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      const first = files[0];
      if (first !== undefined) {
        const parsed = PolicyManifestSchema.safeParse(
          JSON.parse(readFileSync(join(dir, first), "utf8")),
        );
        if (parsed.success) return parsed.data;
      }
    }
  } catch {
    // fall through to the live manifest
  }
  const live = describeInstalledPacks(
    [paymentsPixPack, IdentityKycPack, deploymentsApprovalPack] as unknown as Parameters<
      typeof describeInstalledPacks
    >[0],
    { adopter: "adjudicate (shipped packs)" },
  );
  return live as unknown as PolicyManifestParsed;
}
const policyManifest = loadPolicyManifest();

// Pre-compute the adversarial red-team report once at startup (ADR-118). The
// kernel run is pure + deterministic; the report feeds the console's Red-Team
// panel via `governance.redTeam`.
const redTeamPack = deploymentsApprovalPack as unknown as RedTeamPack;
const redTeamReport = runRedTeam(
  redTeamPack,
  generateAllVectors(redTeamPack),
) as unknown as RedTeamReportParsed;

// Red-team run-history (ADR-133). The CURRENT run is the suite executed across
// every installed Pack — `runRedTeamAcrossPacks` over `PackRegistry.all()`. The
// store is content-keyed + idempotent, bounded, and clock-free (timestamps are
// caller-supplied), so this history is byte-stable across restarts and never a
// system of record; the kernel never reads it.
const redTeamHistoryStore = createInMemoryRedTeamHistoryStore({ capacity: 500 });

// Deterministic demo-timeline base + spacing. The red-team package is clock-free
// (digests exclude timing; `record(report, at)` takes the stamp), so we derive
// evenly-spaced ISO stamps from a FIXED base rather than wall-clock.
const RED_TEAM_TIMELINE_BASE = Date.parse("2026-01-01T00:00:00.000Z");
const RED_TEAM_TIMELINE_STEP_MS = 91 * 24 * 60 * 60 * 1000; // ~one quarter

const currentRedTeamReports = runRedTeamAcrossPacks(
  PackRegistry.all().map((a) => a.pack as unknown as RedTeamPack),
);

// ILLUSTRATIVE prior history so the reference demo's Trend chart has more than a
// single point. These are SYNTHETIC earlier runs with earlier fixed timestamps
// and slightly varying defended counts (a small regression that recovers) — they
// are NOT real runs. The LAST point recorded for each pack (below) is the REAL
// current run; only it reflects the live policy. A production deployment records
// only real runs (e.g. one per CI release-candidate), so this seed block is the
// only place synthetic history is introduced.
const PRIOR_RUN_OFFSETS: ReadonlyArray<{ step: number; defendedDelta: number }> = [
  { step: 0, defendedDelta: 0 }, // baseline, oldest
  { step: 1, defendedDelta: -1 }, // a dip (one fewer defended) → a visible regression
  { step: 2, defendedDelta: 0 }, // recovered to baseline
];
for (const report of currentRedTeamReports) {
  for (const { step, defendedDelta } of PRIOR_RUN_OFFSETS) {
    // Clamp so we never fabricate negative/over-total counts; shift one scenario
    // from defended → escaped to keep total constant and the digest distinct.
    const escapedShift = Math.max(
      0,
      Math.min(report.summary.total, -defendedDelta),
    );
    const priorReport = {
      ...report,
      summary: {
        ...report.summary,
        defended: report.summary.defended - escapedShift,
        escaped: report.summary.escaped + escapedShift,
        escapesByVector: {
          ...report.summary.escapesByVector,
          prompt_injection:
            report.summary.escapesByVector.prompt_injection + escapedShift,
        },
      },
      // Tag the synthetic results so the content digest differs per prior run.
      results: report.results.map((r, i) =>
        i === 0 ? { ...r, name: `${r.name}#prior-${step}` } : r,
      ),
    };
    const at = new Date(
      RED_TEAM_TIMELINE_BASE + step * RED_TEAM_TIMELINE_STEP_MS,
    ).toISOString();
    redTeamHistoryStore.record(priorReport, at);
  }
  // The REAL current run, recorded LAST (newest timestamp) so it is the latest
  // trend point and the newest-first run.
  const currentAt = new Date(
    RED_TEAM_TIMELINE_BASE + PRIOR_RUN_OFFSETS.length * RED_TEAM_TIMELINE_STEP_MS,
  ).toISOString();
  redTeamHistoryStore.record(report, currentAt);
}

// Adapter from the @adjudicate/red-team history store to the admin-sdk
// `governance.redTeamHistory` port.
const redTeamHistoryPort = {
  view(input: RedTeamHistoryQuery): RedTeamHistoryResultParsed {
    const view = redTeamHistoryStore.view(input);
    return {
      runs: view.runs.map((r) => ({
        digest: r.digest,
        at: r.at,
        packId: r.packId,
        summary: r.summary,
      })),
      trend: view.trend.map((p) => ({
        at: p.at,
        packId: p.packId,
        total: p.total,
        defended: p.defended,
        escaped: p.escaped,
        errors: p.errors,
      })),
    };
  },
};

// Behavioral-drift detector (ADR-119 / ADR-128). When an AuditEventBus is wired
// (REDIS_URL set — a real kernel publishes on the bus), attach the detector to
// the LIVE feed so it updates as records arrive. Otherwise (reference console,
// no live producer) warm it from the mock stream at startup so the panel has
// data. Windows are sized for the demo stream (see DRIFT_CONFIG) so drift
// actually triggers; evaluate() with an onDrift callback keeps the ADR-119
// alerting path live.
const driftAlerts: DriftAlert[] = [];
const driftDetector = createDriftDetector({
  ...DRIFT_CONFIG,
  onDrift: (alert) => driftAlerts.push(alert),
});

// Bounded drift-history time-series (ADR-132). Snapshots are recorded on a
// cadence so the Drift Timeline can show whether a TVD spike is new /
// recovering / sustained. The buffer is in-process telemetry, never a system
// of record; the kernel never reads it.
const driftHistory = createDriftHistory({ capacity: 100 });

// Deterministic demo-timeline base + spacing. The drift package is clock-free
// (timestamps are caller-supplied), so we derive evenly-spaced ISO stamps from
// a FIXED base rather than wall-clock — keeping the reference console's history
// byte-stable across restarts.
const DRIFT_TIMELINE_BASE = Date.parse("2026-01-01T00:00:00.000Z");
const DRIFT_TIMELINE_STEP_MS = 91 * 24 * 60 * 60 * 1000; // ~one quarter

const auditBus = getAuditBus();
if (auditBus) {
  // Live: observe() each published record as it arrives (ADR-128). A live
  // adopter records `driftHistory.record(driftDetector.snapshot(), at)` on
  // their own cadence (e.g. a periodic tick with a harness-supplied clock) —
  // the bus handler stays no-throw and the package never reads a clock here.
  driftDetector.attach(auditBus);
} else {
  // Reference fallback: replay the mock stream in CHUNKS (quarters) and record
  // a snapshot after each chunk with an evenly-spaced, fixed-base timestamp, so
  // the Timeline has a real, deterministic multi-point series rather than a
  // single warm-up point.
  // Drift warms ONLY from the decision-outcome stream (DRIFT_CONFIG windows are
  // sized for those seven records); the command-risk demo records in ALL_MOCKS
  // feed the AuditStore/governance queries, not the drift demo.
  const CHUNKS = 4;
  const chunkSize = Math.max(1, Math.ceil(DECISION_OUTCOME_MOCKS.length / CHUNKS));
  for (let chunk = 0; chunk * chunkSize < DECISION_OUTCOME_MOCKS.length; chunk++) {
    const slice = DECISION_OUTCOME_MOCKS.slice(
      chunk * chunkSize,
      (chunk + 1) * chunkSize,
    );
    for (const record of slice) driftDetector.observe(record);
    const at = new Date(
      DRIFT_TIMELINE_BASE + chunk * DRIFT_TIMELINE_STEP_MS,
    ).toISOString();
    driftHistory.record(driftDetector.snapshot(), at);
  }
  driftDetector.evaluate(); // fires onDrift per crossing (warm-up alerting path)
  if (driftAlerts.length > 0) {
    console.warn(
      `[adjudicate] behavioral-drift warm-up: ${driftAlerts.length} alert(s) across ${[...new Set(driftAlerts.map((a) => a.dimension))].join(", ")}`,
    );
  }
}

// Adapter from the @adjudicate/drift `DriftHistory.view()` to the admin-sdk
// `governance.driftHistory` port: window to the last `limit` entries.
const driftHistoryPort = {
  query(input: DriftHistoryQuery): DriftHistoryResultParsed {
    const view = driftHistory.view();
    return {
      schemaVersion: 1 as const,
      capacity: view.capacity,
      count: view.count,
      dropped: view.dropped,
      entries: view.entries.slice(-input.limit).map((e) => ({
        at: e.at,
        seq: e.seq,
        totalObserved: e.totalObserved,
        maxTvd: e.maxTvd,
        alertCount: e.alertCount,
        dimensions: e.dimensions.map((d) => ({
          dimension: d.dimension,
          tvd: d.tvd,
          alertCount: d.alertCount,
        })),
      })),
    };
  },
};

// Token-budget telemetry (ADR-120, extended ADR-135). The reference console
// does not run an adapter loop, so this is a real `createInMemoryTokenUsageStore`
// seeded via `record(...)` with deterministic demo samples (fixed timestamps)
// spanning two tenants and several sessions; a real deployment feeds the same
// store from the adapter's `onTokenUsage` hook. The store is TELEMETRY, outside
// the determinism boundary — it never feeds a kernel decision.
//
// Caps: 50k per session, 90k per tenant. The seed deliberately crosses BOTH a
// session cap (sess-dep-03 @ 52.3k) AND a tenant cap (acme aggregates past 90k)
// so the exhaustion-event timeline is populated for the demo.
const TOKEN_SESSION_BUDGET = 50_000;
const TOKEN_TENANT_BUDGET = 90_000;
const tokenUsageStore = createInMemoryTokenUsageStore({
  sessionBudget: TOKEN_SESSION_BUDGET,
  perTenantBudget: TOKEN_TENANT_BUDGET,
});
// Deterministic demo samples — fixed timestamps. `total` drives the budget
// counters (unchanged); `prompt`/`completion` carry the split that powers the
// read-time USD Cost column (item 3). Each split sums to its `total`.
const DEMO_TOKEN_SAMPLES: ReadonlyArray<TokenUsageSample> = [
  // acme: two sessions; sess-dep-03 crosses the session cap, and acme's
  // aggregate (18.4k + 47.9k + 52.3k = 118.6k) crosses the 90k tenant cap.
  { sessionId: "sess-pix-01", tenantId: "acme", total: 18_400, prompt: 12_880, completion: 5_520, at: "2026-06-07T09:00:00.000Z" },
  { sessionId: "sess-kyc-02", tenantId: "acme", total: 47_900, prompt: 33_530, completion: 14_370, at: "2026-06-07T09:05:00.000Z" },
  { sessionId: "sess-dep-03", tenantId: "acme", total: 52_300, prompt: 36_610, completion: 15_690, at: "2026-06-07T09:10:00.000Z" },
  // globex: one session, comfortably under both caps.
  { sessionId: "sess-bil-04", tenantId: "globex", total: 12_500, prompt: 8_750, completion: 3_750, at: "2026-06-07T09:12:00.000Z" },
];
for (const s of DEMO_TOKEN_SAMPLES) tokenUsageStore.record(s);

// Display-only reference price table (USD/token) for the Cost column. A real
// deployment configures its own per-model table; price is applied at READ time
// (item 3), never on the stored sample — the store stays clock/RNG/price-free.
const TOKEN_PRICE_TABLE: PriceTable = {
  inputUsdPerToken: 3 / 1_000_000,
  outputUsdPerToken: 15 / 1_000_000,
};
// Config-integrity seal status (ADR-121). Seal the installed pack at startup and
// verify it against itself — a real deployment loads a committed/signed seal.
const sealablePack = deploymentsApprovalPack as unknown as SealablePackInput;
const configSealStatus = verifyConfigSeal(
  sealablePack,
  sealPackConfig(sealablePack),
) as unknown as ConfigSealReportParsed;

// Multi-pack config-integrity seal reports (ADR-131) — the same single-pack
// verify-against-self pattern generalized across PackRegistry.all(). Each entry
// carries the per-pack report plus a derived, structured violations[]
// (`deriveSealViolations`). A real deployment loads committed/signed seals and
// verifies against them; the reference console seals each pack at startup and
// verifies it against itself (so the reference set verifies clean). Packs
// lacking sealable fields (no policy bundle, no intents) are skipped rather than
// throwing — one malformed adapter can't take down the whole list.
function sealReportForPack(pack: unknown): PackConfigSealEntryParsed | null {
  const p = pack as {
    id?: string;
    version?: string;
    contract?: unknown;
    intents?: ReadonlyArray<string>;
    policy?: unknown;
  };
  if (!p.id || !p.version || typeof p.contract !== "string") return null;
  if (!Array.isArray(p.intents) || p.intents.length === 0) return null;
  if (p.policy === undefined || p.policy === null) return null;
  try {
    const sealable = pack as unknown as SealablePackInput;
    const report = verifyConfigSeal(
      sealable,
      sealPackConfig(sealable),
    ) as unknown as ConfigSealReportParsed;
    return {
      packId: p.id,
      packVersion: p.version,
      report,
      violations: deriveSealViolations(report),
    };
  } catch {
    // A pack that throws during seal extraction/verification is skipped.
    return null;
  }
}

const configSealReports: ReadonlyArray<PackConfigSealEntryParsed> = PackRegistry.all()
  .map((adapter) => sealReportForPack(adapter.pack))
  .filter((e): e is PackConfigSealEntryParsed => e !== null);

// Kill-switch activation timeline (ADR-131). Map the emergency/governance event
// history (GovernanceEvent) onto the pure analyzer's KillSwitchEvent[] and run
// `analyzeKillSwitchTimeline` adopter-side; the procedure stays a read.
//
// Mapping note: GovernanceEvent carries previousStatus/newStatus/reason/actor/at
// but NO explicit `source`, so console operator updates map to source
// 'operator'. A DENY_ALL newStatus is a `trip` (state 'active'); any other
// newStatus (i.e. NORMAL) is a `clear` (state 'normal'). The history is
// newest-first; the analyzer is order-sensitive and does NOT sort, so we reverse
// to chronological (oldest-first) before analysis.
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
 * Compute the kill-switch timeline report from the live emergency history. When
 * the history is empty (reference console with no governance events yet) the
 * analyzer returns a `stable`/empty report rather than throwing — feature stays
 * available, not PRECONDITION_FAILED.
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
  const events = [...history]
    .reverse()
    .map(governanceEventToKillSwitchEvent);
  return analyzeKillSwitchTimeline(events) as unknown as KillSwitchTimelineReportParsed;
}

// AI-BOM (ADR-127 / ADR-130). One BOM per installed pack, computed once at
// startup. A SINGLE shared `generatedAt` literal is used for every pack so the
// set is deterministic run-to-run (generatedAt is excluded from bomDigest, but
// a per-pack `new Date()` would make snapshot tests flap — see ADR-130
// Determinism Analysis). The first (deployments) BOM is also kept as the legacy
// single `ctx.aiBom` for the back-compat `pack.aiBom` procedure + summary card.
const AIBOM_GENERATED_AT = "2026-06-06T00:00:00.000Z";

/**
 * Compute the AI-BOM for one installed pack. Returns `null` (skipped) for any
 * pack missing the fields the producer requires — guarding heterogeneous packs
 * so one malformed adapter can't take down the whole list.
 */
function bomForPack(pack: {
  id: string;
  version: string;
  contract?: unknown;
  intents: ReadonlyArray<string>;
  signals?: ReadonlyArray<string>;
  basisCodes?: ReadonlyArray<string>;
}): AiBomParsed | null {
  if (!pack.id || !pack.version || typeof pack.contract !== "string") return null;
  if (!Array.isArray(pack.intents) || pack.intents.length === 0) return null;
  try {
    const conformance = runConformance(pack as never);
    return generateAiBom({
      pack: {
        id: pack.id,
        version: pack.version,
        contract: pack.contract,
        intents: [...pack.intents],
        signals: [...(pack.signals ?? [])],
        basisCodes: [...(pack.basisCodes ?? [])],
      } satisfies PackFingerprintInput,
      manifest: {
        contract: "v0",
        packId: pack.id,
        kernelMinVersion: ">=1 <2",
        intents: [...pack.intents],
      } satisfies PackManifest,
      conformance,
      health: scorePackHealth({
        conformance,
        intentCount: pack.intents.length,
        packId: pack.id,
      }),
      generatedAt: AIBOM_GENERATED_AT,
    }) as unknown as AiBomParsed;
  } catch {
    // A pack that throws during conformance/health is skipped rather than
    // failing module init for every other pack's BOM.
    return null;
  }
}

// One BOM per registered pack, in declaration order, skipping any that lack the
// required producer inputs.
const aiBoms: ReadonlyArray<AiBomParsed> = PackRegistry.all()
  .map((adapter) =>
    bomForPack(
      adapter.pack as unknown as {
        id: string;
        version: string;
        contract?: unknown;
        intents: ReadonlyArray<string>;
        signals?: ReadonlyArray<string>;
        basisCodes?: ReadonlyArray<string>;
      },
    ),
  )
  .filter((b): b is AiBomParsed => b !== null);

// Legacy single BOM for `pack.aiBom` (ADR-127) — the deployments-approval pack,
// preserving the prior behavior. Falls back to the first wired BOM.
const aiBom: AiBomParsed | undefined =
  aiBoms.find((b) => b.packId === deploymentsApprovalPack.id) ?? aiBoms[0];

// Tier-3 policy-coherence report (ADR-125) for the installed pack, computed once
// at startup with REPRESENTATIVE planner probes (see DEPLOYMENT_POLICY_COHERENCE_PROBES
// for why the authenticated case must be covered — Item 11).
const policyCoherence = analyzePolicy({
  pack: deploymentsApprovalPack as never,
  plannerProbes: DEPLOYMENT_POLICY_COHERENCE_PROBES as never,
}) as unknown as PolicyCoherenceReportParsed;

// Approval engine port (ADR-122, extended ADR-136). IMPORTANT — this is a
// DISPLAY-ONLY projection, NOT the authorization mechanism. The reference
// console runs no live adapter agent, so resolve() ONLY records the operator's
// decision into the persisted registry projection (markResolved). It performs
// NONE of the security-critical steps. In production those live in
// `createApprovalEngine.resolve()` → `agent.confirm(token)`:
//   1. single-use `confirmationStore.take()` (token redeemed exactly once),
//   2. timing-safe hash verification of the parked envelope blob,
//   3. kernel re-adjudication via `adjudicateAndAudit`,
//   4. RESUME of the parked deferred intent.
// All four happen in the ADOPTER's adapter process — clicking "Approve" here
// executes none of them and authorizes nothing. The real path is exercised by
// `@adjudicate/approval-engine` tests/engine.test.ts + adapter-core's confirm().
// The amber banner in ApprovalsPanel keeps this honest for the operator.
//
// The registry is PERSISTED: in-memory by default, Redis when REDIS_URL is set
// (mirrors how the emergency state store picks its backend). Redis keeps the
// queue + decision history alive across cold starts. The registry stores ONLY
// display fields — never the authoritative envelope blob.
const approvalRegistry: ApprovalRegistry = process.env.REDIS_URL
  ? createRedisApprovalRegistry({
      redis: createLazyRedisApprovalAdapter(),
      keyPrefix: "adjudicate:console:approval",
    })
  : createInMemoryApprovalRegistry();

// Seeded demo projections so the panel + history + chain render. The PENDING one
// drives the queue; the RESOLVED one (intentHash = the seeded resumed-decision
// AuditRecord's hash) drives Decision history + the audit chain, which joins to
// `deploymentRollbackResumed` in ALL_MOCKS via that hash + its supersession.
const DEMO_APPROVAL: ApprovalRequest = {
  token: "demo-approval-token",
  sessionId: "sess-dep-03",
  intentHash: "0xdemoapproval",
  intentKind: "deployment.rollback.execute",
  prompt: "Confirm rollback of production to a1b2c3d4? This is destructive.",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "pending",
  requestedAt: "2026-06-06T12:00:00.000Z",
};
const DEMO_RESOLVED_APPROVAL: ApprovalRequest = {
  token: "demo-resolved-token",
  sessionId: "sess-dep-03",
  intentHash: DEPLOYMENT_ROLLBACK_RESUMED_HASH,
  intentKind: "deployment.rollback.execute",
  prompt: "Confirm rollback of staging to 9f8e7d6c?",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "approved",
  requestedAt: "2026-06-06T11:55:00.000Z",
  resolvedAt: "2026-06-06T12:05:00.026Z",
  // CLAIMED actor — sourced from forgeable x-adjudicate-actor-* headers in the
  // live path (shared bearer authenticates the console, not the operator).
  resolvedBy: { id: "operator@example.com", displayName: "Demo Operator" },
};
void approvalRegistry.put(DEMO_APPROVAL, 24 * 60 * 60);
void approvalRegistry.put(DEMO_RESOLVED_APPROVAL, 24 * 60 * 60);

const APPROVAL_STATUSES = ["pending", "approved", "declined", "expired"] as const;
type ApprovalStatusLiteral = (typeof APPROVAL_STATUSES)[number];
const asApprovalStatus = (s: string): ApprovalStatusLiteral | undefined =>
  (APPROVAL_STATUSES as readonly string[]).includes(s)
    ? (s as ApprovalStatusLiteral)
    : undefined;

const approvalPort = {
  async list(filter: { status?: string; sessionId?: string; limit?: number }): Promise<ReadonlyArray<ApprovalRequestParsed>> {
    return (await approvalRegistry.list(filter as never)) as unknown as ReadonlyArray<ApprovalRequestParsed>;
  },
  // HONEST resolve: records the operator decision into the persisted registry.
  // It does NOT take the single-use token, verify the parked-blob hash,
  // re-adjudicate, or resume any parked intent — those are the adapter agent's
  // job and the reference console runs no agent. See the block comment above.
  async resolve(input: ApprovalResolveInput, by: { id: string; displayName?: string }): Promise<ApprovalRequestParsed> {
    const resolved = await approvalRegistry.markResolved(
      input.token,
      input.accepted ? "approved" : "declined",
      by,
    );
    if (!resolved) throw new Error(`unknown approval token ${input.token}`);
    return resolved as unknown as ApprovalRequestParsed;
  },
  // Decision history (ADR-136) — resolved/expired projections from the registry.
  // Read-only. `resolvedBy` is a CLAIM (forgeable header until OIDC).
  async history(input: ApprovalHistoryQuery): Promise<ApprovalHistoryResult> {
    const rows = await approvalRegistry.list({
      ...(input.status ? { status: input.status } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      limit: input.limit,
    });
    const resolvedOnly = input.status
      ? rows
      : rows.filter((r) => r.status !== "pending");
    return {
      entries: resolvedOnly.map((r) => ({
        token: r.token,
        sessionId: r.sessionId,
        intentHash: r.intentHash,
        intentKind: r.intentKind,
        status: r.status,
        requestedAt: r.requestedAt,
        ...(r.resolvedAt ? { resolvedAt: r.resolvedAt } : {}),
        ...(r.resolvedBy ? { resolvedBy: r.resolvedBy } : {}),
      })),
    };
  },
  // Audit chain (ADR-136) — request → resolved → resumed, reconstructed by
  // joining the resolved projection (by intentHash) to the resumed-decision
  // AuditRecord in `ctx.store` and walking its FROZEN `supersedes` lineage
  // (confirmation_resolved / defer_resumed). Token PRESENCE only — never value.
  async chain(input: ApprovalChainQuery): Promise<ApprovalChainResult> {
    const resumed = await auditStore.getByIntentHash(input.intentHash);
    const projections = await approvalRegistry.list({ limit: 500 });
    const projection = projections.find((p) => p.intentHash === input.intentHash);

    const steps: ApprovalChainResult["steps"] = [];
    if (projection) {
      steps.push({
        kind: "requested",
        at: projection.requestedAt,
        intentHash: projection.intentHash,
        tokenPresent: projection.token.length > 0,
        status: "pending",
      });
      if (projection.status !== "pending") {
        const resolvedStatus = asApprovalStatus(projection.status);
        steps.push({
          kind: "resolved",
          at: projection.resolvedAt ?? projection.requestedAt,
          intentHash: projection.intentHash,
          tokenPresent: projection.token.length > 0,
          ...(resolvedStatus ? { status: resolvedStatus } : {}),
          ...(projection.resolvedBy ? { actor: projection.resolvedBy } : {}),
        });
      }
    }
    if (resumed?.supersedes) {
      steps.push({
        kind: "resumed",
        at: resumed.at,
        intentHash: resumed.intentHash,
        supersedesReason: resumed.supersedes.reason,
        tokenPresent: resumed.supersedes.token !== undefined,
        status: "approved",
      });
    }
    return { steps };
  },
};

// Session-memory lookup (ADR-126). The reference console seeds a demo memory
// store; a real deployment wires the same store the adapter writes to.
const memoryStore = createInMemoryMemoryStore<Record<string, unknown>>();
void memoryStore.put(
  "sess-dep-03",
  { lastApprovedRegion: "us-west-1", priorEscalations: 2, note: "prefers low-carbon regions" },
  24 * 60 * 60,
);
const memoryLookup = { get: (sessionId: string) => memoryStore.get(sessionId) };

// Token-budget port (ADR-120 + ADR-135). `query` is the session view
// (back-compat); `queryByTenant` is the additive per-tenant + exhaustion-timeline
// view. Both read the same `createInMemoryTokenUsageStore` — two reads of one
// telemetry store, never a kernel input.
const tokenBudget = {
  async query(input: TokenBudgetQuery): Promise<TokenBudgetResult> {
    const sessions = tokenUsageStore
      .sessions({
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.since !== undefined ? { since: input.since } : {}),
      })
      .map((s) => ({
        sessionId: s.sessionId,
        ...(s.tenantId !== undefined ? { tenantId: s.tenantId } : {}),
        consumed: s.consumed,
        ...(s.budget !== undefined ? { budget: s.budget } : {}),
        ...(s.remaining !== undefined ? { remaining: s.remaining } : {}),
        costUsd: applyCostTable(s, TOKEN_PRICE_TABLE).usd,
      }));
    return {
      sessions,
      totalConsumed: tokenUsageStore.totalConsumed(),
    };
  },
  async queryByTenant(
    input: TokenBudgetTenantQuery,
  ): Promise<TokenBudgetByTenantResult> {
    const tenants = tokenUsageStore
      .tenants({
        ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
        ...(input.since !== undefined ? { since: input.since } : {}),
      })
      .map((t) => ({
        tenantId: t.tenantId,
        consumed: t.consumed,
        ...(t.budget !== undefined ? { budget: t.budget } : {}),
        ...(t.remaining !== undefined ? { remaining: t.remaining } : {}),
        sessionCount: t.sessionCount,
        costUsd: applyCostTable(t, TOKEN_PRICE_TABLE).usd,
      }));
    const exhaustionEvents = tokenUsageStore.exhaustionEvents({
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      limit: input.eventLimit,
    });
    return {
      tenants,
      exhaustionEvents,
      totalConsumed: tokenUsageStore.totalConsumed(),
    };
  },
};

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin/trpc",
  requireAuth: requireConsoleAdminAuth,
  createContext: async (req) => ({
    store: auditStore,
    emergencyStore,
    actor: extractActor(req),
    replayer,
    guardFireStats,
    redTeamReport,
    redTeamHistory: redTeamHistoryPort,
    driftDetector: driftDetector as unknown as {
      snapshot(): BehavioralDriftResultParsed;
    },
    driftHistory: driftHistoryPort,
    tokenBudget,
    configSealStatus,
    configSealReports,
    // Recomputed per request from the live emergency history so the timeline
    // reflects the latest governance events (the analyzer itself is pure).
    killSwitchTimeline: await computeKillSwitchTimeline(),
    policyCoherence,
    ...(aiBom ? { aiBom } : {}),
    aiBoms,
    approvalPort,
    memoryLookup,
    ...(policyDescriptor ? { policyDescriptor } : {}),
    ...(policyManifest ? { policyManifest } : {}),
  }),
});
