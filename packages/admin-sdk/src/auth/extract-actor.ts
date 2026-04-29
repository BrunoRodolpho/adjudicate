import type { Actor } from "../schemas/emergency.js";

/**
 * Extracts operator identity from request headers.
 *
 * **Trust contract**: this function does NOT authenticate. It assumes
 * the adopter has gated the route handler with auth middleware that
 * populates these headers AFTER verifying an OIDC/SAML/Clerk session.
 * If the route is mounted publicly, anyone can forge
 * `x-adjudicate-actor-id` and pose as any user. This is the SDK's
 * single most important security boundary; document it loudly in the
 * adopter's deployment runbook.
 *
 * Header contract:
 *   x-adjudicate-actor-id    (REQUIRED for mutations) — stable user id
 *   x-adjudicate-actor-name  (optional) — display name for governance
 *                                          event log
 *
 * Returns `null` when the id header is missing or empty. Mutating
 * procedures reject `null` actor with UNAUTHORIZED; query procedures
 * tolerate `null` because read-only access typically lives behind the
 * same middleware regardless of who's calling.
 */
export function extractActor(req: Request): Actor | null {
  const id = req.headers.get("x-adjudicate-actor-id");
  if (!id || id.length === 0) return null;
  const displayName = req.headers.get("x-adjudicate-actor-name") ?? undefined;
  return {
    id,
    ...(displayName !== undefined ? { displayName } : {}),
  };
}
