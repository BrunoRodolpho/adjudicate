import { describe, expect, it } from "vitest";
import { createIncidentProjection, type RemediationOutcome } from "../src/index.js";

const outcome = (over: Partial<RemediationOutcome> = {}): RemediationOutcome => ({
  disposition: "SAFE",
  decisions: [],
  records: [],
  executedEnvelope: null,
  executed: false,
  executorResult: undefined,
  pending: null,
  ...over,
});

describe("createIncidentProjection", () => {
  it("records and reads back a per-incident entry (passes = decision count)", () => {
    const proj = createIncidentProjection();
    proj.record(
      "inc-1",
      outcome({
        disposition: "SAFE",
        executed: true,
        decisions: [{ kind: "REWRITE" } as never, { kind: "EXECUTE" } as never],
      }),
      "2026-06-07T00:00:00.000Z",
    );
    expect(proj.get("inc-1")).toMatchObject({
      incidentId: "inc-1",
      lastDisposition: "SAFE",
      executed: true,
      passes: 2,
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
  });

  it("lists newest-updated first (re-recording moves an incident to the front)", () => {
    const proj = createIncidentProjection();
    proj.record("a", outcome(), "t1");
    proj.record("b", outcome(), "t2");
    proj.record("a", outcome({ executed: true }), "t3");
    expect(proj.list().map((e) => e.incidentId)).toEqual(["a", "b"]);
  });

  it("returns null for an unknown incident", () => {
    expect(createIncidentProjection().get("nope")).toBeNull();
  });
});
