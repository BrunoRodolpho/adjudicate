import { isProductionEnv } from "@/lib/runtime-mode";

/**
 * Reference auth gate for the Adjudicant (Inspector-General) observer plane. The
 * admin SDK REQUIRES a `requireAuth` hook — without one `toNextRouteHandler`
 * refuses to mount in production (it would otherwise trust the forgeable
 * `x-adjudicate-actor-*` headers). This reference gate enforces a shared-secret
 * bearer token from `ADJUDICANT_API_TOKEN` (falling back to the shared
 * `ADMIN_API_TOKEN` so a single deployment secret can gate every plane); a real
 * deployment swaps in `withClerkAuth` / `withOidcAuth`.
 *
 * It is fail-CLOSED in production: with no token configured every request is
 * rejected (503) rather than trusting headers. Local dev (non-production, no
 * token) leaves the gate open for convenience — insecure by design, demos only.
 *
 * NOTE on the separation of powers: this gate authenticates the OBSERVER. Even
 * a fully-authenticated observer can only reach the READ-ONLY router this app
 * mounts — there is NO authorize/weaken mutation on the wire, so auth here gates
 * READ access, never a decision-changing write.
 *
 * Returns a `Response` to short-circuit (401/503) or `undefined` to allow.
 */
export function requireAdjudicantAuth(req: Request): void | Response {
  const expected =
    process.env.ADJUDICANT_API_TOKEN ?? process.env.ADMIN_API_TOKEN;
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
      "Adjudicant API auth not configured (set ADJUDICANT_API_TOKEN / ADMIN_API_TOKEN or wire withClerkAuth/withOidcAuth)",
      { status: 503 },
    );
  }
  // Local dev: open gate (documented insecure-by-design).
}
