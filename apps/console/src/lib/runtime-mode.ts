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

/**
 * True when the build/deploy is targeting production. Checked against both
 * `ADJUDICATE_ENV` (the framework's explicit env switch) and the standard
 * `NODE_ENV` so either signal trips the guard. `next build` sets
 * NODE_ENV=production, so a production bundle that forgot to set
 * NEXT_PUBLIC_ADJUDICATE_MODE=live is caught here rather than silently
 * shipping the in-process ALL_MOCKS gateway to real operators.
 */
export function isProductionEnv(): boolean {
  return (
    process.env.ADJUDICATE_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function getClientGatewayMode(): GatewayMode {
  const env = process.env.NEXT_PUBLIC_ADJUDICATE_MODE;
  const mode: GatewayMode = env === "live" ? "live" : "mock";
  // Production guard: "mock" is the dev-only default. Resolving to "mock" in
  // a production environment means the client-side gateway would read the
  // static ALL_MOCKS fixtures instead of hitting the real AuditStore — a
  // misconfiguration that silently serves fake governance data. Fail loudly
  // so the deploy is caught, never a live operator. "mock" stays the default
  // everywhere else (local dev, tests, CI).
  if (mode === "mock" && isProductionEnv()) {
    throw new Error(
      "[runtime-mode] Gateway resolved to MOCK in a production environment. " +
        "The mock gateway serves static ALL_MOCKS fixtures, not real audit " +
        "data. Set NEXT_PUBLIC_ADJUDICATE_MODE=live for production builds, or " +
        "unset ADJUDICATE_ENV/NODE_ENV=production for a local mock demo.",
    );
  }
  return mode;
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
