/**
 * Runtime mode for the console.
 *
 * The mode is determined once at build time via the
 * `NEXT_PUBLIC_ADJUDICATE_MODE` environment variable. Next.js inlines
 * `NEXT_PUBLIC_*` env vars at build time, so this is effectively a
 * compile-time decision in the client bundle — no per-request branching,
 * no hydration mismatch.
 *
 *   - "mock" (default): client-side gateway reads ALL_MOCKS in-process.
 *     No HTTP, no server route involvement. Static demo, fast iteration.
 *   - "live": client-side gateway hits /api/admin/trpc via the SDK's
 *     tRPC client. The server route mounts adminRouter — proves the
 *     wire contract round-trips correctly through Zod validation.
 *
 * Default is "mock" so the console works out of the box without any
 * server configuration. An adopter forking this console and pointing
 * the server route at their real AuditStore would set MODE=live in
 * production.
 */

export type GatewayMode = "mock" | "live";

export function getClientGatewayMode(): GatewayMode {
  const env = process.env.NEXT_PUBLIC_ADJUDICATE_MODE;
  return env === "live" ? "live" : "mock";
}

export function modeLabel(mode: GatewayMode): string {
  return mode === "live" ? "LIVE (SDK)" : "MOCK (Local)";
}

/**
 * Emergency coordination mode — separate from the audit gateway mode.
 *
 *   - "in-memory": live state lives in this Console process only. The
 *     kernel's DistributedKillSwitch (Redis-polled) does NOT see
 *     toggles. Honest disclaimer in the panel.
 *   - "redis": live state is written to the same Redis key the kernel
 *     polls. Toggles propagate to every replica within ~1s.
 *
 * Driven by `NEXT_PUBLIC_ADJUDICATE_EMERGENCY_COORDINATION` (mirror of
 * the server-side `EMERGENCY_REDIS_KEY` setting). Set together as a
 * deployment checklist item; a future tRPC procedure can replace the
 * env-var mirror with runtime-fetched capabilities.
 */
export type EmergencyCoordinationMode = "in-memory" | "redis";

export function getEmergencyCoordinationMode(): EmergencyCoordinationMode {
  const env = process.env.NEXT_PUBLIC_ADJUDICATE_EMERGENCY_COORDINATION;
  return env === "redis" ? "redis" : "in-memory";
}

export function coordinationLabel(mode: EmergencyCoordinationMode): string {
  return mode === "redis" ? "Live · synced with kernel" : "In-memory · not coordinated";
}
