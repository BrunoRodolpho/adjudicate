import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { ReadOnlyAdminRouter } from "@adjudicate/admin-sdk/trpc";

/**
 * Typed tRPC client for the Adjudicant (Inspector-General) observer app.
 *
 * It is typed against `ReadOnlyAdminRouter` — the admin router MINUS every
 * AUTHORIZE/WEAKEN mutation procedure (PLUS the ONE friction-monotone escalate
 * write, 114) — NOT the full `AdminRouter`. This makes write-isolation a
 * COMPILE-TIME guarantee in this app: `trpc.emergency.update`,
 * `trpc.approval.resolve`, `trpc.governance.recordOutcome`, and `trpc.replay.run`
 * are not members of this client's type, so any attempt to authorize, weaken, or
 * replay-mutate a decision fails the build. The SOLE mutation member is
 * `trpc.escalate.raise` — and it can only RECORD a friction-increasing FACT
 * (pause/review/escalate), never produce a `Decision`. The §B/§G
 * Inspector-General plane observes/investigates/escalates; it NEVER decides.
 *
 * Headers: every request includes `x-adjudicate-actor-id` (and an optional
 * display name). This reference app hardcodes a "demo-observer" placeholder —
 * adopters wiring this for production MUST replace these values with the
 * observer identity resolved by their auth middleware (NextAuth session, Clerk
 * user, IAM-resolved identity, etc.). The SDK trusts whatever is sent; if the
 * route is publicly reachable, anyone can forge these headers — which is why the
 * route is gated by `requireAdjudicantAuth` and `toNextRouteHandler` refuses to
 * mount in prod without it.
 *
 * URL is relative — works for all client-side calls in the browser.
 */
export const trpc = createTRPCClient<ReadOnlyAdminRouter>({
  links: [
    httpBatchLink({
      url: "/api/admin/trpc",
      headers: () => ({
        // TODO(adopter): replace with values resolved from your auth
        // middleware after verifying the session. The SDK trusts these
        // headers — the route handler MUST be gated by auth that
        // populates them.
        "x-adjudicate-actor-id": "demo-observer",
        "x-adjudicate-actor-name": "Demo Observer",
      }),
    }),
  ],
});
