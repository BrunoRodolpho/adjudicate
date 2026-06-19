import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readOnlyAdminRouter } from "@adjudicate/admin-sdk/trpc";

/**
 * 111 + 114 — write-isolation acceptance for the Adjudicant (Inspector-General)
 * app.
 *
 * The OBSERVER plane mounts the admin SDK's READ-ONLY router. These tests
 * structurally prove that mounting it exposes ZERO AUTHORIZE/WEAKEN mutations on
 * the wire, and that the app's route handler does NOT reference any of them.
 *
 * 114 adds the ONE friction-monotone write the observer plane permits:
 * `escalate.raise`. That mutation IS present on the mounted router (and the
 * route wires its sink) — it is safe precisely because it can only RECORD a
 * friction-increasing FACT (pause/review/escalate), never authorize, weaken, or
 * produce a `Decision`. So the invariant is "reads + the single friction-monotone
 * escalate write" — the 4 authorize/weaken mutations remain structurally absent.
 */

// This test file lives in src/app/api/admin/trpc/; the route handler lives in
// the nested `[trpc]/` segment. The `[`/`]` are URL-special, so build the path
// via node:path joins rather than a `new URL(...)` parse.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = join(HERE, "[trpc]", "route.ts");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

/**
 * Strip block comments (`/* … *\/`) and line comments (`// …`) so the
 * mutation-wiring grep targets EXECUTABLE code only. The route handler's
 * docstring deliberately NAMES the excluded mutations to explain WHY they are
 * excluded (separation of powers); naming them in prose is the opposite of
 * wiring them. The §8 acceptance is "no mutation WIRING" — so we check the code,
 * not the comments.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const routeCode = stripComments(routeSource);

const MUTATION_TOKENS = [
  "emergency.update",
  "approval.resolve",
  "governance.recordOutcome",
  "replay.run",
];

describe("apps/adjudicant route — mounts the READ-ONLY router (write-isolation)", () => {
  it("the route handler mounts `readOnlyAdminRouter`, NOT the full `adminRouter`", () => {
    expect(routeCode).toContain("readOnlyAdminRouter");
    // The full router must not be mounted on the observer plane.
    expect(routeCode).not.toMatch(/router:\s*adminRouter\b/);
  });

  it("the route handler's EXECUTABLE CODE does NOT wire any authorize/weaken mutation", () => {
    // The §8 grep, as a guard: no mutation-procedure call site in the route's
    // code (comments that NAME the excluded mutations are not wiring).
    for (const token of MUTATION_TOKENS) {
      expect(routeCode.includes(token)).toBe(false);
    }
  });

  it("the route handler passes a mandatory `requireAuth` gate (cannot mount in prod without auth)", () => {
    expect(routeCode).toMatch(/requireAuth:\s*requireAdjudicantAuth/);
  });

  it("the mounted read-only router exposes EXACTLY the one friction-monotone escalate mutation", () => {
    const procs = readOnlyAdminRouter._def.procedures as Record<
      string,
      { _def: { type: string } }
    >;
    const mutations = Object.entries(procs)
      .filter(([, p]) => p._def.type === "mutation")
      .map(([k]) => k);
    // 114 — the ONLY mutation the observer plane carries is escalate.raise.
    expect(mutations).toEqual(["escalate.raise"]);
  });

  it("each of the four authorize/weaken procedures is ABSENT from the mounted router", () => {
    const names = Object.keys(readOnlyAdminRouter._def.procedures);
    for (const mutation of MUTATION_TOKENS) {
      expect(names).not.toContain(mutation);
    }
  });

  it("the route handler wires the escalation sink (114's single write port)", () => {
    // The escalate mutation feature-detects `escalationSink`; the observer route
    // MUST wire it (else escalate.raise would PRECONDITION_FAILED). It is the
    // ONLY write port on the wire.
    expect(routeCode).toContain("escalationSink");
  });
});
