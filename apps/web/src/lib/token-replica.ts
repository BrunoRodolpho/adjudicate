/**
 * token-replica — ILLUSTRATIVE operator-detail fixtures for the /console/tokens
 * Token Governance replica (mirrors apps/console's tokens page, ADR-135).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It exists ONLY to drive the clearly-labeled
 * "Illustrative replica of the operator console" surface under /console, behind
 * the ConsoleChrome honesty boundary. apps/web is a public, unauthenticated
 * marketing surface with NO database/redis/admin credentials and no kernel
 * runtime — this committed fixture is the ONLY data the replica ever renders.
 *
 * The PUBLIC /transparency token view renders the aggregate-only, coarsened
 * `token-burndown-transparency` projection (a single id-free consumed/budget
 * pair). This module is the OPERATOR replica's detail surface: it carries the
 * per-tenant + per-session rows and the exhaustion timeline that the operator
 * console shows — using SYNTHETIC ANONYMOUS ids (`tenant-demo`, `sess-alpha`)
 * that map to no real customer. It MUST NEVER be projected to /transparency.
 *
 * DETERMINISM: every timestamp below is a FIXED literal — no wall-clock
 * (`Date.now()` / `new Date()`) and no random source is ever called, so the
 * surface renders identically across builds and machines.
 *
 * BANDING: the ok / near / over band is conveyed by ICON + LABEL, never colour
 * alone (a11y). `bandFor` is the single source of truth, shared by the replica.
 */

/** Near-budget threshold (amber "near") as a fraction of the cap. */
export const NEAR_BUDGET_FRACTION = 0.8;

/** Coarse banding of budget pressure — ok / near / over. */
export type TokenBand = "ok" | "near" | "over";

/** Human label for a band — used for the sr-only / icon text alternative. */
export const TOKEN_BAND_LABEL: Record<TokenBand, string> = {
  ok: "within budget",
  near: "near budget",
  over: "over budget",
};

/**
 * Pure banding helper. A non-positive / undefined budget is treated as "ok"
 * (no cap configured → never alarm). Shared by the tenant + session tables so
 * the band can never drift between them.
 */
export function bandFor(consumed: number, budget?: number): TokenBand {
  if (budget === undefined || budget <= 0) return "ok";
  const pct = consumed / budget;
  if (pct >= 1) return "over";
  if (pct >= NEAR_BUDGET_FRACTION) return "near";
  return "ok";
}

/** A per-tenant token budget row. `budget`/`remaining` omitted ⇒ no cap. */
export interface TokenTenantRow {
  /** Synthetic anonymous tenant id — maps to no real customer. */
  readonly tenantId: string;
  readonly consumed: number;
  readonly budget?: number;
  readonly remaining?: number;
  /** Sessions seen under this tenant in the window. */
  readonly sessionCount: number;
}

/** A per-session token budget row, optionally tagged to its tenant. */
export interface TokenSessionRow {
  /** Synthetic anonymous session id. */
  readonly sessionId: string;
  /** Owning synthetic tenant id (for the tenant chip). */
  readonly tenantId?: string;
  readonly consumed: number;
  readonly budget?: number;
  readonly remaining?: number;
}

/** A budget-exhaustion crossing — newest-first in the feed below. */
export interface TokenExhaustionEvent {
  /** Stable synthetic id (used as the React key). */
  readonly id: string;
  /** Which scope crossed its cap. */
  readonly scope: "session" | "tenant";
  /** FIXED literal ISO timestamp — no wall-clock. */
  readonly at: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly consumed: number;
  readonly budget: number;
}

/**
 * Illustrative per-tenant burn-down. Three synthetic tenants span the three
 * bands so the replica exercises ok / near / over (icon + label, not colour
 * alone): `tenant-demo` is comfortably within budget, `tenant-pilot` is near
 * (≥80%), and `tenant-stress` is over its cap. `tenant-uncapped` carries no
 * budget at all (the "no cap configured" path).
 */
export const TOKEN_REPLICA_TENANTS: readonly TokenTenantRow[] = [
  {
    tenantId: "tenant-demo",
    consumed: 412_000,
    budget: 1_500_000,
    remaining: 1_088_000,
    sessionCount: 4,
  },
  {
    tenantId: "tenant-pilot",
    consumed: 770_000,
    budget: 900_000,
    remaining: 130_000,
    sessionCount: 3,
  },
  {
    tenantId: "tenant-stress",
    consumed: 118_600,
    budget: 90_000,
    remaining: -28_600,
    sessionCount: 2,
  },
  {
    tenantId: "tenant-uncapped",
    consumed: 56_400,
    sessionCount: 1,
  },
] as const;

/**
 * Illustrative per-session burn-down, tagged to its synthetic tenant. The
 * over-budget `sess-omega` rolls up under the over-budget `tenant-stress`, and
 * `sess-gamma` sits in the near band, so the session table exercises all three
 * bands too.
 */
export const TOKEN_REPLICA_SESSIONS: readonly TokenSessionRow[] = [
  {
    sessionId: "sess-alpha",
    tenantId: "tenant-demo",
    consumed: 142_000,
    budget: 400_000,
    remaining: 258_000,
  },
  {
    sessionId: "sess-beta",
    tenantId: "tenant-demo",
    consumed: 96_500,
    budget: 400_000,
    remaining: 303_500,
  },
  {
    sessionId: "sess-gamma",
    tenantId: "tenant-pilot",
    consumed: 338_000,
    budget: 400_000,
    remaining: 62_000,
  },
  {
    sessionId: "sess-omega",
    tenantId: "tenant-stress",
    consumed: 84_300,
    budget: 60_000,
    remaining: -24_300,
  },
  {
    sessionId: "sess-solo",
    consumed: 56_400,
  },
] as const;

/**
 * Illustrative budget-exhaustion timeline, NEWEST-FIRST. Two crossings: the
 * over-budget session, then its over-budget tenant — the believable order in
 * which a runaway session trips first the session cap, then the tenant cap.
 */
export const TOKEN_REPLICA_EXHAUSTION_EVENTS: readonly TokenExhaustionEvent[] = [
  {
    id: "exh-2",
    scope: "tenant",
    at: "2026-06-06T14:32:10.000Z",
    tenantId: "tenant-stress",
    consumed: 118_600,
    budget: 90_000,
  },
  {
    id: "exh-1",
    scope: "session",
    at: "2026-06-06T14:18:44.000Z",
    tenantId: "tenant-stress",
    sessionId: "sess-omega",
    consumed: 84_300,
    budget: 60_000,
  },
] as const;

/** Window total consumed across all synthetic tenants (header figure). */
export const TOKEN_REPLICA_TOTAL_CONSUMED: number =
  TOKEN_REPLICA_TENANTS.reduce((sum, t) => sum + t.consumed, 0);
