import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AdminRouter } from "@adjudicate/admin-sdk/trpc";

/**
 * Typed tRPC client for the console.
 *
 * The `AdminRouter` import is type-only — any procedure-signature change
 * in @adjudicate/admin-sdk breaks console compilation. That's the
 * type-safe boundary the framework promised: edit the SDK schema, the
 * console fails to build.
 *
 * Headers: every request includes `x-adjudicate-actor-id` (and an
 * optional display name). The reference console hardcodes a
 * "demo-operator" placeholder — adopters wiring this for production
 * MUST replace these values with the operator identity resolved by
 * their auth middleware (NextAuth session, Clerk user, IAM-resolved
 * identity, etc.). The SDK trusts whatever is sent; if your route is
 * publicly reachable, anyone can forge these headers.
 *
 * URL is relative — works for all client-side calls in the browser.
 * SSR is not used in this console; if it ever is, the URL needs to
 * become absolute server-side.
 */
export const trpc = createTRPCClient<AdminRouter>({
  links: [
    httpBatchLink({
      url: "/api/admin/trpc",
      headers: () => ({
        // TODO(adopter): replace with values resolved from your auth
        // middleware after verifying the session. The SDK trusts these
        // headers — the route handler MUST be gated by auth that
        // populates them.
        "x-adjudicate-actor-id": "demo-operator",
        "x-adjudicate-actor-name": "Demo Operator",
      }),
    }),
  ],
});
