import { z } from "zod";
import { IsoTimestampSchema } from "./common.js";

/**
 * Wire schemas for token-budget telemetry (ADR-120, extended by ADR-135).
 *
 * Per-session AND per-tenant cumulative token consumption vs the configured
 * budget, plus a budget-exhaustion event timeline — fed by the adapter's
 * `onTokenUsage` hook into an adopter-supplied `TokenUsageStore`
 * (`@adjudicate/adapter-core`).
 *
 * These shapes re-declare the store's read-model as Zod with NO dependency on
 * `@adjudicate/adapter-core` — the same dependency-free posture every other
 * `governance.*` schema takes.
 *
 * DETERMINISM: this is TELEMETRY, outside the determinism boundary. None of
 * these shapes ever feeds a kernel decision — enforcement stays in
 * `createTokenBudgetGuard` (input is adopter state S, not this surface).
 */
export const TokenBudgetQuerySchema = z.object({
  since: IsoTimestampSchema.optional(),
  sessionId: z.string().optional(),
});

export type TokenBudgetQuery = z.infer<typeof TokenBudgetQuerySchema>;

export const TokenBudgetSessionSchema = z.object({
  sessionId: z.string(),
  /** Tenant the session belongs to, when known (ADR-135). Additive optional. */
  tenantId: z.string().optional(),
  consumed: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative().optional(),
  remaining: z.number().int().optional(),
  /**
   * Read-time USD cost (item 3). FLOAT (not .int()) — priced from the token
   * split x an adopter PriceTable in the route handler. Additive optional;
   * absent when no price table is configured.
   */
  costUsd: z.number().nonnegative().optional(),
});

export type TokenBudgetSession = z.infer<typeof TokenBudgetSessionSchema>;

/** CLOSED two-value scope. Widening is MINOR per lifecycle; narrowing MAJOR. */
export const TokenScopeSchema = z.enum(["session", "tenant"]);
export type TokenScope = z.infer<typeof TokenScopeSchema>;

/** Per-tenant cumulative consumption — aggregated across the tenant's sessions. */
export const TokenBudgetTenantSchema = z.object({
  tenantId: z.string(),
  consumed: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative().optional(),
  remaining: z.number().int().optional(),
  sessionCount: z.number().int().nonnegative().optional(),
  /** Read-time USD cost (item 3). FLOAT — see TokenBudgetSessionSchema.costUsd. */
  costUsd: z.number().nonnegative().optional(),
});

export type TokenBudgetTenant = z.infer<typeof TokenBudgetTenantSchema>;

/**
 * One budget-exhaustion crossing — a TELEMETRY read-model, NOT an `AuditRecord`
 * and NOT a `GovernanceEvent` (those taxonomies are unchanged). The actual
 * REFUSE/DEFER produced by `createTokenBudgetGuard` is the audited, replayable
 * kernel Decision; this event is a denormalized read-model for the timeline.
 */
export const TokenExhaustionEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  scope: TokenScopeSchema,
  sessionId: z.string().optional(),
  tenantId: z.string().optional(),
  consumed: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative(),
});

export type TokenExhaustionEvent = z.infer<typeof TokenExhaustionEventSchema>;

/**
 * Per-session result. ADDITIVE OPTIONAL `tenants`/`exhaustionEvents` fields
 * (ADR-135) — old session-only consumers ignore them and the wire stays
 * byte-compatible for callers that never read them.
 */
export const TokenBudgetResultSchema = z.object({
  sessions: z.array(TokenBudgetSessionSchema),
  totalConsumed: z.number().int().nonnegative(),
  // NEW optional fields — additive, never breaking the session-only shape.
  tenants: z.array(TokenBudgetTenantSchema).optional(),
  exhaustionEvents: z.array(TokenExhaustionEventSchema).optional(),
});

export type TokenBudgetResult = z.infer<typeof TokenBudgetResultSchema>;

/** Input for the tenant-scoped sibling query (ADR-135). */
export const TokenBudgetTenantQuerySchema = z.object({
  tenantId: z.string().optional(),
  since: IsoTimestampSchema.optional(),
  eventLimit: z.number().int().positive().max(500).default(100),
});

export type TokenBudgetTenantQuery = z.infer<typeof TokenBudgetTenantQuerySchema>;

/** Tenant-view result: tenants + the (newest-first) exhaustion timeline. */
export const TokenBudgetByTenantResultSchema = z.object({
  tenants: z.array(TokenBudgetTenantSchema),
  exhaustionEvents: z.array(TokenExhaustionEventSchema),
  totalConsumed: z.number().int().nonnegative(),
});

export type TokenBudgetByTenantResult = z.infer<typeof TokenBudgetByTenantResultSchema>;
