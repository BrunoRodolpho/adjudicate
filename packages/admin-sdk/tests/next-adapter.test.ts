/**
 * toNextRouteHandler auth gate (AuthReviewer-007 / ConfigReviewer-004).
 *
 * The admin tRPC route trusts forgeable `x-adjudicate-actor-*` headers, so the
 * adapter must FORCE the adopter to supply a `requireAuth` gate: refuse to mount
 * in production without one, warn otherwise, and run it (401 on reject) before
 * the tRPC handler.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { toNextRouteHandler } from "../src/adapters/next.js";
import type { AdminContext, AdminRouter } from "../src/trpc/index.js";

// The gate tests reject before the tRPC handler runs, so a dummy router/context
// suffices — fetchRequestHandler is never reached on the 401 paths.
const dummyRouter = {} as AdminRouter;
const dummyContext = {} as AdminContext;
const baseOpts = {
  router: dummyRouter,
  endpoint: "/api/admin/trpc",
  createContext: () => dummyContext,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("toNextRouteHandler — requireAuth gate", () => {
  it("THROWS at construction in production when requireAuth is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => toNextRouteHandler(baseOpts)).toThrow(/requireAuth/i);
  });

  it("does NOT throw in non-production when requireAuth is absent (warns instead)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = toNextRouteHandler(baseOpts);
    expect(handler.GET).toBeTypeOf("function");
    expect(handler.POST).toBeTypeOf("function");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/requireAuth/i));
  });

  it("does NOT throw or warn in production when requireAuth IS supplied", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      toNextRouteHandler({ ...baseOpts, requireAuth: () => {} }),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns 401 when requireAuth throws (rejects before the tRPC handler)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { POST } = toNextRouteHandler({
      ...baseOpts,
      requireAuth: () => {
        throw new Error("no session");
      },
    });
    const res = await POST(new Request("https://x/api/admin/trpc/x"));
    expect(res.status).toBe(401);
  });

  it("returns the Response requireAuth yields (custom rejection)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { GET } = toNextRouteHandler({
      ...baseOpts,
      requireAuth: () => new Response("forbidden", { status: 403 }),
    });
    const res = await GET(new Request("https://x/api/admin/trpc/x"));
    expect(res.status).toBe(403);
  });

  it("runs requireAuth on every request before reaching the handler", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const seen: string[] = [];
    const { POST } = toNextRouteHandler({
      ...baseOpts,
      requireAuth: (req) => {
        seen.push(new URL(req.url).pathname);
        // Reject so we don't depend on the dummy router executing.
        return new Response("unauth", { status: 401 });
      },
    });
    await POST(new Request("https://x/api/admin/trpc/governance.describePolicy"));
    expect(seen).toEqual(["/api/admin/trpc/governance.describePolicy"]);
  });
});
