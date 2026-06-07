import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Taint } from "@adjudicate/core";
import { incidentResponsePack, rehydrateIncidentState, type Incident } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";

function incident(over: Partial<Incident> = {}): Incident {
  return { id: "inc-1", severity: "sev2", status: "open", dependencies: [], createdAt: at, ...over };
}

function run(
  kind: string,
  payload: unknown,
  taint: Taint,
  incidents: Record<string, Incident> = { "inc-1": incident() },
) {
  const env = buildEnvelope({
    kind,
    payload,
    actor: { principal: taint === "TRUSTED" ? "user" : "llm", sessionId: "s" },
    taint,
    nonce: `n-${Math.random()}`,
    createdAt: at,
  });
  return adjudicate(env, rehydrateIncidentState({ incidents }), incidentResponsePack.policy);
}

describe("pack-incident-response — six outcomes", () => {
  it("EXECUTE: small in-bounds auto remediation", () => {
    expect(run("incident.remediation.execute", { incidentId: "inc-1", action: "restart", blastRadius: 3 }, "UNTRUSTED").kind).toBe("EXECUTE");
  });
  it("EXECUTE: TRUSTED monitor callback", () => {
    expect(run("incident.monitor.callback", { incidentId: "inc-1", probeId: "p", observedStatus: "open", observedAt: at }, "TRUSTED").kind).toBe("EXECUTE");
  });
  it("REFUSE: unknown incident", () => {
    expect(run("incident.remediation.execute", { incidentId: "nope", action: "x", blastRadius: 3 }, "UNTRUSTED", {}).kind).toBe("REFUSE");
  });
  it("REFUSE: invalid blast radius", () => {
    expect(run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: -1 }, "UNTRUSTED").kind).toBe("REFUSE");
  });
  it("DEFER: dependency down", () => {
    const d = run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: 3 }, "UNTRUSTED", {
      "inc-1": incident({ dependencies: [{ service: "db", status: "down" }] }),
    });
    expect(d.kind).toBe("DEFER");
    if (d.kind === "DEFER") expect(d.signal).toBe("incident.dependency.restored");
  });
  it("REWRITE: UNTRUSTED over-scope clamps blastRadius to the cap", () => {
    const d = run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: 50 }, "UNTRUSTED");
    expect(d.kind).toBe("REWRITE");
    if (d.kind === "REWRITE") {
      expect((d.rewritten.payload as { blastRadius: number }).blastRadius).toBe(5);
      expect(d.rewritten.taint).toBe("UNTRUSTED"); // taint preserved
    }
  });
  it("REQUEST_CONFIRMATION: TRUSTED operator mid-blast", () => {
    expect(run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: 15 }, "TRUSTED").kind).toBe("REQUEST_CONFIRMATION");
  });
  it("ESCALATE: TRUSTED operator large blast → supervisor", () => {
    const d = run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: 30 }, "TRUSTED");
    expect(d.kind).toBe("ESCALATE");
    if (d.kind === "ESCALATE") expect(d.to).toBe("supervisor");
  });
});

describe("pack-incident-response — taint security (adversarial)", () => {
  it("UNTRUSTED monitor callback is refused at the taint gate", () => {
    const d = run("incident.monitor.callback", { incidentId: "inc-1", probeId: "p", observedStatus: "open", observedAt: at }, "UNTRUSTED");
    expect(d.kind).toBe("REFUSE");
    if (d.kind === "REFUSE") expect(d.refusal.kind).toBe("SECURITY");
  });
  it("UNTRUSTED huge-blast remediation can never reach EXECUTE (clamped)", () => {
    expect(run("incident.remediation.execute", { incidentId: "inc-1", action: "x", blastRadius: 999 }, "UNTRUSTED").kind).toBe("REWRITE");
  });
});
