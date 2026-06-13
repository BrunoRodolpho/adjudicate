import { isProductionEnv } from "@/lib/runtime-mode";

/**
 * Reference auth gate shared by every admin surface (the tRPC route and the
 * SSE live-tail stream). The admin SDK REQUIRES a `requireAuth` hook — without
 * one it refuses to mount in production. This reference gate enforces a
 * shared-secret bearer token from `ADMIN_API_TOKEN`; a real deployment swaps in
 * `withClerkAuth` / `withOidcAuth`. It is fail-CLOSED in production: with no
 * token configured every request is rejected rather than trusting the forgeable
 * `x-adjudicate-actor-*` headers. Local dev (non-production, no token) leaves the
 * gate open for convenience — insecure by design, for demos only.
 *
 * Returns a `Response` to short-circuit (401/503) or `undefined` to allow.
 */
export function requireConsoleAdminAuth(req: Request): void | Response {
  const expected = process.env.ADMIN_API_TOKEN;
  if (expected) {
    if (req.headers.get("authorization") !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    return;
  }
  if (isProductionEnv()) {
    // No auth configured in production -> refuse rather than serve the admin API
    // on header-trust alone.
    return new Response(
      "Admin API auth not configured (set ADMIN_API_TOKEN or wire withClerkAuth/withOidcAuth)",
      { status: 503 },
    );
  }
  // Local dev: open gate (documented insecure-by-design).
}
