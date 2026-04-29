import { createGateway } from "./index";

/**
 * Module-level gateway singleton.
 *
 * Always backed by the tRPC client — the server route handles the
 * `mock` vs `live` distinction via `process.env.DATABASE_URL` (see
 * `app/api/admin/trpc/[trpc]/route.ts`). This is the post-Phase-5
 * "Bundle Seal" shape: the client never imports kernel runtime code,
 * so `node:crypto` (transitively pulled by `buildEnvelope` /
 * `buildAuditRecord`) never reaches the browser bundle.
 *
 * Pages and hooks bind to the `AuditGateway` interface; the underlying
 * tRPC URL is fixed in `lib/trpc-client.ts`.
 */
export const gateway = createGateway();
