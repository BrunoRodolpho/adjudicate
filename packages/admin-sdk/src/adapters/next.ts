import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { AdminContext, AdminRouter } from "../trpc/index.js";

export interface NextAdapterOptions {
  readonly router: AdminRouter;
  readonly endpoint: string;
  readonly createContext: (
    req: Request,
  ) => AdminContext | Promise<AdminContext>;
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
  const handle = (req: Request) =>
    fetchRequestHandler({
      endpoint: opts.endpoint,
      req,
      router: opts.router,
      createContext: () => opts.createContext(req),
    });
  return { GET: handle, POST: handle };
}
