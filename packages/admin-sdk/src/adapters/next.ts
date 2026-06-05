import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { AdminContext, AdminRouter } from "../trpc/index.js";

export interface NextAdapterOptions {
  readonly router: AdminRouter;
  readonly endpoint: string;
  readonly createContext: (
    req: Request,
  ) => AdminContext | Promise<AdminContext>;
  /**
   * Authentication gate (AuthReviewer-007 / ConfigReviewer-004). Runs before
   * every request reaches the tRPC handler. Return normally to allow the
   * request; **throw** to reject it (→ HTTP 401); or **return a `Response`** to
   * reject with a custom status/body.
   *
   * This is REQUIRED in production. Without it the route trusts forgeable
   * `x-adjudicate-actor-*` headers (see `extractActor`), so anyone can pose as
   * any operator — `toNextRouteHandler` THROWS at construction when
   * `NODE_ENV==="production"` and `requireAuth` is absent, and warns otherwise.
   *
   * Recipes (wrap your IdP's session check):
   * ```ts
   * // withClerkAuth — reject unless a verified Clerk session is present.
   * const withClerkAuth = (req: Request) => {
   *   const { userId } = getAuth(req);              // @clerk/nextjs/server
   *   if (!userId) return new Response("Unauthorized", { status: 401 });
   * };
   * // withOidcAuth — verify a Bearer JWT against your OIDC JWKS.
   * const withOidcAuth = async (req: Request) => {
   *   await verifyOidcBearer(req.headers.get("authorization")); // throws on bad token
   * };
   * export const { GET, POST } = toNextRouteHandler({ ..., requireAuth: withClerkAuth });
   * ```
   * The gate authenticates; `createContext` still derives the actor from the
   * (now-trusted) headers via `extractActor`.
   */
  readonly requireAuth?: (
    req: Request,
  ) => void | Response | Promise<void | Response>;
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Next.js Route Handler adapter.
 *
 * Returns a `{ GET, POST }` object suitable for direct export from a
 * Route Handler file. Both verbs route to the same tRPC handler — tRPC
 * uses GET for queries and POST for mutations on the wire.
 *
 *   // app/api/admin/[trpc]/route.ts
 *   import { adminRouter, toNextRouteHandler, createInMemoryAuditStore }
 *     from "@adjudicate/admin-sdk";
 *   const store = createInMemoryAuditStore({ records: myRecords });
 *   export const { GET, POST } = toNextRouteHandler({
 *     router: adminRouter,
 *     endpoint: "/api/admin",
 *     createContext: () => ({ store }),
 *   });
 */
export function toNextRouteHandler(opts: NextAdapterOptions) {
  if (opts.requireAuth === undefined) {
    const warning =
      "toNextRouteHandler: no `requireAuth` supplied — the admin tRPC route " +
      "trusts forgeable `x-adjudicate-actor-*` headers, so anyone reaching it " +
      "can pose as any operator. Pass `requireAuth` (see the withClerkAuth / " +
      "withOidcAuth recipes in the JSDoc).";
    if (isProductionEnv()) {
      throw new Error(`${warning} requireAuth is REQUIRED in production.`);
    }
    console.warn(`[admin-sdk] ${warning}`);
  }
  const handle = async (req: Request): Promise<Response> => {
    if (opts.requireAuth !== undefined) {
      try {
        const rejection = await opts.requireAuth(req);
        // A returned Response is an explicit rejection (custom status/body).
        if (rejection instanceof Response) return rejection;
      } catch {
        // A thrown gate is an authentication failure → 401, before any handler.
        return new Response("Unauthorized", { status: 401 });
      }
    }
    return fetchRequestHandler({
      endpoint: opts.endpoint,
      req,
      router: opts.router,
      createContext: () => opts.createContext(req),
    });
  };
  return { GET: handle, POST: handle };
}
