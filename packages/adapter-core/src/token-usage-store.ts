/**
 * Token-usage telemetry store (ADR-135, follows ADR-120).
 *
 * Folds the loop's `onTokenUsage` hook into per-session AND per-tenant
 * cumulative token counters, and appends a bounded budget-exhaustion event
 * whenever a counter crosses its configured cap. It backs the admin-sdk
 * `governance.tokenBudget` / `governance.tokenBudgetByTenant` port and the
 * console's Token Governance section.
 *
 * # Determinism boundary — READ THIS FIRST
 *
 * This store is **TELEMETRY, strictly OUTSIDE the determinism boundary.** It
 * exists to power dashboards; it must NEVER feed a kernel decision. Enforcement
 * stays in `createTokenBudgetGuard` (`@adjudicate/primitives`, ADR-120), whose
 * only inputs are `(envelope, adopter state S)` — it reads the consumed counter
 * from `S`, never from this store. The store and the guard are two INDEPENDENT
 * reads of the same upstream provider usage: the guard reads it folded into `S`
 * (deterministic, kernel-facing); this store reads it from `onTokenUsage`
 * (telemetry, dashboard-facing). There is no edge between them.
 *
 * Consequences, enforced here by construction:
 *   - NO wall-clock on the recorded timeline: every `at` is ADOPTER-SUPPLIED
 *     (`record(sample)` uses `sample.at` verbatim). The only `Date.now()` in
 *     this module is the same opportunistic LRU sweep the existing
 *     `createInMemoryMemoryStore` uses (`persistence.ts`) — it evicts old
 *     session rows and never participates in any decision or recorded value.
 *   - NO RNG on any decision path. Exhaustion-event ids are derived
 *     deterministically from a monotonic insertion sequence (no `randomUUID`),
 *     so the store stays reproducible in tests and across replays. Ids are
 *     telemetry only — never hashed, never a kernel input.
 *   - Replaying an envelope through the kernel re-derives the same Decision from
 *     `(envelope, policy, S)`; the store is not consulted, so it cannot perturb
 *     replay. Best-effort hook loss only undercounts telemetry — it never
 *     changes a Decision.
 *
 * # Bounded cardinality
 *
 * Session counters are LRU-bounded (`maxSessions`, default 10_000) so unbounded
 * session-id churn cannot grow the store without bound (this doubles as the
 * session-churn-evasion defence below). Exhaustion events live in a fixed-
 * capacity newest-first ring (`maxEvents`, default 10_000, mirroring
 * `DEFAULT_MAX_EMERGENCY_EVENTS` in `@adjudicate/audit`). Tenant counters are
 * bounded by the (small) real tenant cardinality.
 *
 * # Session-churn evasion → tenant cap is the backstop
 *
 * An adversary minting a fresh `sessionId` per request resets the SESSION
 * counter and slips under any per-session cap. The TENANT cap is the backstop:
 * per-tenant `consumed` aggregates across ALL of a tenant's sessions regardless
 * of session churn, so churn within a tenant still trips `tenantBudget` and the
 * crossing is recorded as a `scope: "tenant"` exhaustion event. The LRU bound
 * means a flood of throwaway session ids evicts old session rows rather than
 * exploding memory (and shows up as an anomalous `sessionCount` on the tenant
 * row). This is why threading the tenant dimension is load-bearing.
 */

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * One provider-reported usage sample, attributed to a session and (optionally)
 * a tenant. Fed from the adapter loop's `onTokenUsage` hook.
 */
export interface TokenUsageSample {
  readonly sessionId: string;
  /** Omitted in single-tenant deployments. */
  readonly tenantId?: string;
  /**
   * Token split for this sample. Either supply `prompt`/`completion` (mapped
   * from the provider's `TokenUsage.inputTokens`/`outputTokens`) and/or a
   * pre-summed `total`. The store coerces everything to a non-negative integer
   * total: `total` when finite, else `prompt + completion`; non-finite parts
   * contribute 0. This is the single accumulation unit.
   */
  readonly prompt?: number;
  readonly completion?: number;
  readonly total?: number;
  /**
   * ISO-8601 timestamp — ADOPTER-SUPPLIED. Used verbatim for the recorded
   * `lastAt` and any exhaustion-event `at`. The store never calls `Date.now()`
   * for a recorded value (determinism boundary — see module docs).
   */
  readonly at: string;
}

/**
 * Configured caps the store compares cumulative consumption against. Display +
 * exhaustion-detection only — never enforcement (that is the guard's job).
 */
export interface TokenBudgetConfig {
  /** Per-session cap. */
  readonly sessionBudget?: number;
  /** Per-tenant cap. */
  readonly tenantBudget?: number;
}

/** Per-session cumulative view (back-compat with the existing session shape). */
export interface SessionConsumption {
  readonly sessionId: string;
  readonly tenantId?: string;
  readonly consumed: number;
  readonly budget?: number;
  readonly remaining?: number;
  readonly lastAt: string;
}

/** Per-tenant cumulative view (aggregated across the tenant's sessions). */
export interface TenantConsumption {
  readonly tenantId: string;
  readonly consumed: number;
  readonly budget?: number;
  readonly remaining?: number;
  readonly sessionCount: number;
  readonly lastAt: string;
}

/** One budget-exhaustion crossing — a telemetry read-model, NOT an audit record. */
export interface TokenExhaustionEvent {
  /** Deterministic id (`evt:<seq>`), telemetry only — never hashed. */
  readonly id: string;
  /** Adopter-supplied ISO timestamp of the crossing sample. */
  readonly at: string;
  /** Closed two-value scope. */
  readonly scope: "session" | "tenant";
  /** Present iff `scope === "session"`. */
  readonly sessionId?: string;
  /** Present for tenant scope; carried on session events when known. */
  readonly tenantId?: string;
  readonly consumed: number;
  /** The cap that was crossed. */
  readonly budget: number;
}

/** Filter for the per-session view. */
export interface SessionsFilter {
  readonly sessionId?: string;
  readonly tenantId?: string;
  readonly since?: string;
}

/** Filter for the per-tenant view. */
export interface TenantsFilter {
  readonly tenantId?: string;
  readonly since?: string;
}

/** Filter for the exhaustion-event log. */
export interface ExhaustionEventsFilter {
  readonly scope?: "session" | "tenant";
  readonly tenantId?: string;
  /** Hard cap on the returned (newest-first) slice. */
  readonly limit?: number;
}

/**
 * Token-usage telemetry store contract. `record` is the single mutation,
 * called from the adopter's `onTokenUsage` callback. The read methods back the
 * admin-sdk port. All methods are synchronous on the in-memory impl; a future
 * Redis impl would make them async — the port adapts via `Promise.resolve`.
 */
export interface TokenUsageStore {
  /** Fold one usage sample into the session + tenant counters; append an exhaustion event on a crossing. */
  record(sample: TokenUsageSample): void;
  /** Per-session view (newest-activity first). */
  sessions(filter?: SessionsFilter): SessionConsumption[];
  /** Per-tenant view (newest-activity first). */
  tenants(filter?: TenantsFilter): TenantConsumption[];
  /** Bounded, newest-first exhaustion-event log. */
  exhaustionEvents(filter?: ExhaustionEventsFilter): TokenExhaustionEvent[];
  /** Sum of all session consumption (== sum of tenant consumption for attributed samples). */
  totalConsumed(): number;
}

export interface CreateInMemoryTokenUsageStoreOptions {
  /** Default per-session AND per-tenant caps. */
  readonly sessionBudget?: number;
  /** Default per-tenant cap (alias surfaced for symmetry with the guard's `tenantBudget`). */
  readonly perTenantBudget?: number;
  /** Per-session cap (alias of `sessionBudget`; `sessionBudget` wins if both set). */
  readonly perSessionBudget?: number;
  /** Override caps per tenant (e.g. an enterprise tenant with a higher cap). */
  readonly perTenantBudgets?: ReadonlyMap<string, TokenBudgetConfig>;
  /** LRU bound on session rows (session-id churn defence). Default 10_000. */
  readonly maxSessions?: number;
  /** Exhaustion-event ring-buffer bound. Default 10_000. */
  readonly maxEvents?: number;
  /**
   * Generic `capacity` — when set, becomes the default for BOTH `maxSessions`
   * and `maxEvents` (explicit `maxSessions`/`maxEvents` still win). Convenience
   * for callers who want one bound.
   */
  readonly capacity?: number;
}

const DEFAULT_BOUND = 10_000;

/** Coerce a usage sample to a non-negative integer token total (non-finite → 0). */
function sampleTotal(sample: TokenUsageSample): number {
  const t = sample.total;
  if (typeof t === "number" && Number.isFinite(t)) {
    return Math.max(0, Math.trunc(t));
  }
  const prompt = Number.isFinite(sample.prompt) ? (sample.prompt as number) : 0;
  const completion = Number.isFinite(sample.completion)
    ? (sample.completion as number)
    : 0;
  return Math.max(0, Math.trunc(prompt) + Math.trunc(completion));
}

interface SessionRow {
  sessionId: string;
  tenantId?: string;
  consumed: number;
  lastAt: string;
  /** True once a session-scope exhaustion event has been emitted (emit once per crossing, not per over-budget sample). */
  exhausted: boolean;
}

interface TenantRow {
  tenantId: string;
  consumed: number;
  sessionIds: Set<string>;
  lastAt: string;
  exhausted: boolean;
}

/**
 * In-memory `TokenUsageStore`. Mirrors the lifecycle of the existing
 * `createInMemoryMemoryStore` / `createInMemoryConfirmationStore`: a Map-backed
 * ref impl with an opportunistic LRU bound and a fixed-capacity event ring.
 * Clock/RNG-free on every recorded value (see module docs).
 */
export function createInMemoryTokenUsageStore(
  opts: CreateInMemoryTokenUsageStoreOptions = {},
): TokenUsageStore {
  const sessionBudget = opts.sessionBudget ?? opts.perSessionBudget;
  const tenantBudget = opts.perTenantBudget;
  const perTenantBudgets = opts.perTenantBudgets;
  const maxSessions = Math.max(1, opts.maxSessions ?? opts.capacity ?? DEFAULT_BOUND);
  const maxEvents = Math.max(1, opts.maxEvents ?? opts.capacity ?? DEFAULT_BOUND);

  // Insertion-ordered Maps double as LRU: re-inserting on touch moves a key to
  // the end; the oldest (first) key is evicted when over the bound.
  const sessions = new Map<string, SessionRow>();
  const tenants = new Map<string, TenantRow>();
  // Newest-last ring of events; readers reverse to newest-first.
  const events: TokenExhaustionEvent[] = [];
  let seq = 0;

  /** Resolve the effective session cap for a tenant (per-tenant override wins). */
  function sessionCapFor(tenantId: string | undefined): number | undefined {
    if (tenantId !== undefined) {
      const override = perTenantBudgets?.get(tenantId);
      if (override?.sessionBudget !== undefined) return override.sessionBudget;
    }
    return sessionBudget;
  }

  /** Resolve the effective tenant cap (per-tenant override wins). */
  function tenantCapFor(tenantId: string): number | undefined {
    const override = perTenantBudgets?.get(tenantId);
    if (override?.tenantBudget !== undefined) return override.tenantBudget;
    return tenantBudget;
  }

  function appendEvent(ev: TokenExhaustionEvent): void {
    events.push(ev);
    // Ring eviction: drop oldest beyond the bound.
    while (events.length > maxEvents) events.shift();
  }

  return {
    record(sample: TokenUsageSample): void {
      const add = sampleTotal(sample);
      const { sessionId, tenantId, at } = sample;

      // ── Session counter (LRU touch) ──────────────────────────────────────
      let srow = sessions.get(sessionId);
      if (srow !== undefined) {
        // Touch: re-insert at the end to mark most-recently-used.
        sessions.delete(sessionId);
      } else {
        srow = {
          sessionId,
          ...(tenantId !== undefined ? { tenantId } : {}),
          consumed: 0,
          lastAt: at,
          exhausted: false,
        };
      }
      // A session keeps its first-seen tenant; a later sample may attribute a
      // previously-unattributed session.
      if (tenantId !== undefined && srow.tenantId === undefined) {
        srow.tenantId = tenantId;
      }
      const prevSession = srow.consumed;
      srow.consumed = prevSession + add;
      srow.lastAt = at;
      sessions.set(sessionId, srow);

      const sCap = sessionCapFor(srow.tenantId);
      if (
        sCap !== undefined &&
        !srow.exhausted &&
        prevSession < sCap &&
        srow.consumed >= sCap
      ) {
        srow.exhausted = true;
        appendEvent({
          id: `evt:${seq++}`,
          at,
          scope: "session",
          sessionId,
          ...(srow.tenantId !== undefined ? { tenantId: srow.tenantId } : {}),
          consumed: srow.consumed,
          budget: sCap,
        });
      }

      // LRU eviction of the oldest session beyond the bound.
      while (sessions.size > maxSessions) {
        const oldest = sessions.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        sessions.delete(oldest);
      }

      // ── Tenant counter (aggregates across the tenant's sessions) ──────────
      if (tenantId !== undefined) {
        let trow = tenants.get(tenantId);
        if (trow === undefined) {
          trow = {
            tenantId,
            consumed: 0,
            sessionIds: new Set<string>(),
            lastAt: at,
            exhausted: false,
          };
          tenants.set(tenantId, trow);
        }
        const prevTenant = trow.consumed;
        trow.consumed = prevTenant + add;
        trow.sessionIds.add(sessionId);
        trow.lastAt = at;

        const tCap = tenantCapFor(tenantId);
        if (
          tCap !== undefined &&
          !trow.exhausted &&
          prevTenant < tCap &&
          trow.consumed >= tCap
        ) {
          trow.exhausted = true;
          appendEvent({
            id: `evt:${seq++}`,
            at,
            scope: "tenant",
            tenantId,
            consumed: trow.consumed,
            budget: tCap,
          });
        }
      }
    },

    sessions(filter: SessionsFilter = {}): SessionConsumption[] {
      const out: SessionConsumption[] = [];
      for (const row of sessions.values()) {
        if (filter.sessionId !== undefined && row.sessionId !== filter.sessionId) continue;
        if (filter.tenantId !== undefined && row.tenantId !== filter.tenantId) continue;
        if (filter.since !== undefined && row.lastAt < filter.since) continue;
        const budget = sessionCapFor(row.tenantId);
        out.push({
          sessionId: row.sessionId,
          ...(row.tenantId !== undefined ? { tenantId: row.tenantId } : {}),
          consumed: row.consumed,
          ...(budget !== undefined
            ? { budget, remaining: budget - row.consumed }
            : {}),
          lastAt: row.lastAt,
        });
      }
      // Newest-activity first; stable tiebreak on sessionId.
      out.sort((a, b) =>
        a.lastAt === b.lastAt
          ? a.sessionId.localeCompare(b.sessionId)
          : b.lastAt.localeCompare(a.lastAt),
      );
      return out;
    },

    tenants(filter: TenantsFilter = {}): TenantConsumption[] {
      const out: TenantConsumption[] = [];
      for (const row of tenants.values()) {
        if (filter.tenantId !== undefined && row.tenantId !== filter.tenantId) continue;
        if (filter.since !== undefined && row.lastAt < filter.since) continue;
        const budget = tenantCapFor(row.tenantId);
        out.push({
          tenantId: row.tenantId,
          consumed: row.consumed,
          ...(budget !== undefined
            ? { budget, remaining: budget - row.consumed }
            : {}),
          sessionCount: row.sessionIds.size,
          lastAt: row.lastAt,
        });
      }
      out.sort((a, b) =>
        a.lastAt === b.lastAt
          ? a.tenantId.localeCompare(b.tenantId)
          : b.lastAt.localeCompare(a.lastAt),
      );
      return out;
    },

    exhaustionEvents(filter: ExhaustionEventsFilter = {}): TokenExhaustionEvent[] {
      const limit = filter.limit !== undefined ? Math.max(0, Math.trunc(filter.limit)) : undefined;
      const out: TokenExhaustionEvent[] = [];
      // Iterate newest-first (the ring is newest-last).
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i]!;
        if (filter.scope !== undefined && ev.scope !== filter.scope) continue;
        if (filter.tenantId !== undefined && ev.tenantId !== filter.tenantId) continue;
        out.push(ev);
        if (limit !== undefined && out.length >= limit) break;
      }
      return out;
    },

    totalConsumed(): number {
      let sum = 0;
      for (const row of sessions.values()) sum += row.consumed;
      return sum;
    },
  };
}
