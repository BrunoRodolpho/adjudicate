import type { AuditRecord } from "@adjudicate/core";
import type { AuditQuery, AuditQueryResult } from "@/types/adjudicate";
import { createTrpcGateway } from "./trpc-gateway";

/**
 * Data gateway abstraction.
 *
 * The console never imports a sink, queries Postgres, or builds an
 * `AuditRecord` directly from a client component — it goes through this
 * gateway, which always speaks tRPC to `/api/admin/trpc`. The server
 * route (`apps/console/src/app/api/admin/trpc/[trpc]/route.ts`) decides
 * whether to back the store with Postgres (when `DATABASE_URL` is set)
 * or the in-memory `ALL_MOCKS` fixtures.
 *
 * # Why tRPC even in mock mode
 *
 * Phase 1 shipped a client-side `createMockGateway` that imported
 * `ALL_MOCKS` directly. Each fixture used `buildEnvelope`/
 * `buildAuditRecord`, which transitively imported `packages/core/src/hash.ts`'s
 * `node:crypto` call into the browser bundle. Webpack rejected the
 * `node:` URL, breaking `next dev` and `next build` outright. The
 * client/server boundary was never enforced — the abstraction *let*
 * crypto leak.
 *
 * Phase 5's "Bundle Seal" pulls the boundary tight: client code holds
 * only TYPES from `@adjudicate/core` (already the convention for every
 * component in `src/components/`); any RUNTIME import lives behind the
 * tRPC route. The `mock` vs `live` distinction is a server-side
 * concern, gated by `process.env.DATABASE_URL` in the route handler.
 */
export interface AuditGateway {
  queryAudit(q: AuditQuery): Promise<AuditQueryResult>;
  getDecision(intentHash: string): Promise<AuditRecord | null>;

  // Phase 2 surfaces — declared here so the contract is stable; not yet
  // implemented in any gateway shipped today.
  runReplay?(range: { since: string; until: string }): Promise<unknown>;
  killSwitchState?(): Promise<{
    active: boolean;
    reason: string;
    toggledAt: string;
  }>;
}

/**
 * Single gateway implementation. The `mode` parameter is preserved as a
 * label for callers that want to surface the active backend in the UI;
 * routing-wise both modes go through the same tRPC client.
 */
export type GatewayMode = "mock" | "trpc";

export function createGateway(_mode: GatewayMode = "trpc"): AuditGateway {
  return createTrpcGateway();
}
