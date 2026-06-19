import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

/**
 * Route-handler conformance for POST /api/playground/adjudicate (plan 132 · T3).
 *
 * The handler's validation branches (`invalid_json` / `invalid_body` 400s) and
 * its happy path were never exercised in CI — `find apps/web/src/app/api -name
 * "*.test.*"` returned nothing. This pins the route CONTRACT the client depends
 * on (132 §3): a 400 with a stable `error` discriminant on bad input, and a
 * 200 carrying a full `PlaygroundResponse` on a valid body.
 */

const URL = "http://localhost/api/playground/adjudicate";

/** Build a request whose body is raw text (so we can send unparseable JSON). */
function rawRequest(body: string): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function jsonRequest(body: unknown): NextRequest {
  return rawRequest(JSON.stringify(body));
}

describe("POST /api/playground/adjudicate", () => {
  it("returns 400 invalid_json on an unparseable body", async () => {
    const res = await POST(rawRequest("this is not json {"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 invalid_body when intentKind is not a string", async () => {
    const res = await POST(jsonRequest({ intentKind: 42, payload: {} }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_body");
  });

  it("returns 400 invalid_body when payload is missing / not an object", async () => {
    const res = await POST(
      jsonRequest({ intentKind: "support.ticket.create", payload: "nope" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_body");
  });

  it("returns 400 invalid_body when payload is null", async () => {
    const res = await POST(
      jsonRequest({ intentKind: "support.ticket.create", payload: null }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_body");
  });

  it("returns 200 with a PlaygroundResponse on a valid body", async () => {
    const res = await POST(
      jsonRequest({
        intentKind: "support.ticket.create",
        payload: {
          subject: "Feature request",
          body: "please add a dark mode to the dashboard",
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      decision?: { kind?: string };
      record?: { auditHash?: string };
      packId?: string;
      packName?: string;
      trace?: unknown[];
    };
    // A clean ticket EXECUTEs; the full PlaygroundResponse shape is present.
    expect(json.decision?.kind).toBe("EXECUTE");
    expect(typeof json.record?.auditHash).toBe("string");
    expect(json.packId).toBe("pack-pii-demo");
    expect(typeof json.packName).toBe("string");
    expect(Array.isArray(json.trace)).toBe(true);
  });

  it("returns 400 with the thrown message when no Pack handles the intent", async () => {
    const res = await POST(
      jsonRequest({ intentKind: "no.such.intent", payload: {} }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toContain("No installed Pack");
  });
});
