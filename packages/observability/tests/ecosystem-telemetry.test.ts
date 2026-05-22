import { describe, expect, it } from "vitest";
import {
  basis,
  buildEnvelope,
  buildAuditRecord,
  classify,
  decisionExecute,
  decisionRefuse,
  refuse,
} from "@adjudicate/core";
import {
  SEMCONV,
  classifyReplayFailure,
  createEcosystemTelemetry,
  serializeEcosystemSnapshot,
} from "../src/index.js";

const at = "2026-05-21T00:00:00.000Z";

function envelope(kind: string, nonce: string) {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce,
    createdAt: at,
  });
}

describe("ecosystem-telemetry", () => {
  it("aggregates Pack installations and contracts deterministically", () => {
    const t = createEcosystemTelemetry();
    t.observePackInstallation("pack-payments-pix", "v0");
    t.observePackInstallation("pack-identity-kyc", "v0");
    t.observePackInstallation("pack-payments-pix", "v0"); // duplicate; no double-count
    t.observePackManifest("gold");
    t.observePackManifest("gold");
    t.observePackManifest(null);
    t.observePackSignature("ed25519");
    t.observePackTrust("ok");
    t.observePackTrust("missing");

    const snap = t.snapshot();
    expect(snap.pack.packsByContract).toEqual({ v0: 2 });
    expect(snap.pack.qualityTiers).toEqual({ gold: 2, unset: 1 });
    expect(snap.pack.signatureAlgorithms).toEqual({ ed25519: 1 });
    expect(snap.pack.trustOutcomes).toEqual({ missing: 1, ok: 1 });
  });

  it("bucketizes Decision outcomes and basis categories without recording values", () => {
    const t = createEcosystemTelemetry();
    t.observeDecision(decisionExecute([basis("BUSINESS_RULE", "ok", "all good")]));
    t.observeDecision(
      decisionRefuse(refuse("AUTH", "auth.denied", "no perms"), [
        basis("AUTH", "denied", "no perms"),
      ]),
    );
    t.observeDecision(
      decisionRefuse(
        refuse("BUSINESS_RULE", "pto.insufficient_balance", "no balance"),
        [basis("BUSINESS_RULE", "insufficient_balance", "x")],
      ),
    );

    const snap = t.snapshot();
    expect(snap.decisions.byKind).toEqual({ EXECUTE: 1, REFUSE: 2 });
    // Refusal codes (closed bucket) and basis categories present, but no payloads.
    expect(snap.decisions.refusalByCode).toEqual({
      "auth.denied": 1,
      "pto.insufficient_balance": 1,
    });
    expect(snap.decisions.basisByCategory).toEqual({ AUTH: 1, BUSINESS_RULE: 2 });
  });

  it("classifies replay mismatches into the closed ReplayFailureClass taxonomy", () => {
    const dExec = decisionExecute([basis("BUSINESS_RULE", "ok", "ok")]);
    const dRef = decisionRefuse(refuse("BUSINESS_RULE", "code.a", "x"), [
      basis("BUSINESS_RULE", "code.a", "x"),
    ]);
    const kindMis = classify("h", dExec, dRef);
    expect(kindMis).not.toBeNull();
    expect(classifyReplayFailure(kindMis!)).toBe("decision_kind_changed");

    const refMis = classify(
      "h",
      decisionRefuse(refuse("BUSINESS_RULE", "code.a", "x"), [
        basis("BUSINESS_RULE", "code.a", "x"),
      ]),
      decisionRefuse(refuse("BUSINESS_RULE", "code.b", "y"), [
        basis("BUSINESS_RULE", "code.a", "x"),
      ]),
    );
    expect(classifyReplayFailure(refMis!)).toBe("refusal_code_changed");

    const basisAdded = classify(
      "h",
      decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
      decisionExecute([
        basis("BUSINESS_RULE", "ok", "x"),
        basis("STATE", "pending", "y"),
      ]),
    );
    expect(classifyReplayFailure(basisAdded!)).toBe("basis_added");

    const basisRemoved = classify(
      "h",
      decisionExecute([
        basis("BUSINESS_RULE", "ok", "x"),
        basis("STATE", "pending", "y"),
      ]),
      decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
    );
    expect(classifyReplayFailure(basisRemoved!)).toBe("basis_removed");

    const basisSwapped = classify(
      "h",
      decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
      decisionExecute([basis("STATE", "pending", "y")]),
    );
    expect(classifyReplayFailure(basisSwapped!)).toBe("basis_swapped");
  });

  it("aggregates analyzer triage by diagnostic code", () => {
    const t = createEcosystemTelemetry();
    t.observeAnalyzerTriage("AJD-101", "true_positive");
    t.observeAnalyzerTriage("AJD-101", "true_positive");
    t.observeAnalyzerTriage("AJD-102", "false_positive");

    const snap = t.snapshot();
    expect(snap.analyzerTriage.totals).toEqual({
      true_positive: 2,
      false_positive: 1,
      by_design: 0,
      wont_fix: 0,
      deferred: 0,
    });
    expect(snap.analyzerTriage.byDiagnosticCode["AJD-101"]).toMatchObject({
      true_positive: 2,
    });
    expect(snap.analyzerTriage.byDiagnosticCode["AJD-102"]).toMatchObject({
      false_positive: 1,
    });
  });

  it("counts semconv attributes and flags unknown attributes by bucket only", () => {
    const t = createEcosystemTelemetry();
    const known = new Set(Object.values(SEMCONV) as string[]);
    t.observeSemconvEmission(SEMCONV.INTENT_KIND, known);
    t.observeSemconvEmission(SEMCONV.DECISION_KIND, known);
    t.observeSemconvEmission("adjudicate.custom.attr", known);
    t.observeSemconvEmission("adjudicate.custom.attr", known);

    const snap = t.snapshot();
    expect(snap.semconvAdoption.emissionsByAttribute[SEMCONV.INTENT_KIND]).toBe(1);
    expect(snap.semconvAdoption.emissionsByAttribute["adjudicate.custom.attr"]).toBe(2);
    expect(snap.semconvAdoption.unknownAttributeCount).toBe(2);
  });

  it("aggregates codemod outcomes and incidents", () => {
    const t = createEcosystemTelemetry();
    t.observeCodemod("nameGuardToWithMetadata", "visited");
    t.observeCodemod("nameGuardToWithMetadata", "modified");
    t.observeCodemod("nameGuardToWithMetadata", "noop");
    t.observeIncident("kill_switch_storm");
    t.observeIncident("integrity_failure");
    t.observeIncident("kill_switch_storm");

    const snap = t.snapshot();
    expect(snap.migrationPain.codemodVisits["nameGuardToWithMetadata"]).toBe(1);
    expect(snap.migrationPain.codemodModifications["nameGuardToWithMetadata"]).toBe(1);
    expect(snap.migrationPain.codemodNoops["nameGuardToWithMetadata"]).toBe(1);
    expect(snap.incidents.total).toBe(3);
    expect(snap.incidents.byClass.kill_switch_storm).toBe(2);
    expect(snap.incidents.byClass.integrity_failure).toBe(1);
  });

  it("bounds cardinality: over-cap keys land in __overflow__", () => {
    const t = createEcosystemTelemetry({ maxRefusalCodes: 2 });
    t.observeRefusal(refuse("BUSINESS_RULE", "code.a", "a"));
    t.observeRefusal(refuse("BUSINESS_RULE", "code.b", "b"));
    t.observeRefusal(refuse("BUSINESS_RULE", "code.c", "c"));
    t.observeRefusal(refuse("BUSINESS_RULE", "code.d", "d"));

    const snap = t.snapshot();
    // Two original keys + the overflow bucket; no leakage of c/d as keys.
    expect(Object.keys(snap.decisions.refusalByCode).sort()).toEqual([
      "__overflow__",
      "code.a",
      "code.b",
    ]);
    expect(snap.decisions.refusalByCode["__overflow__"]).toBe(2);
  });

  it("snapshots are deterministic: same input sequence → byte-identical canonical JSON", () => {
    const seed = (): ReturnType<typeof createEcosystemTelemetry> => {
      const t = createEcosystemTelemetry();
      t.observePackInstallation("p1", "v0");
      t.observePackInstallation("p2", "v0");
      t.observeDecision(decisionExecute([basis("BUSINESS_RULE", "ok", "x")]));
      t.observeAnalyzerTriage("AJD-101", "true_positive");
      t.observeIncident("kill_switch_storm");
      return t;
    };
    const a = serializeEcosystemSnapshot(seed().snapshot());
    const b = serializeEcosystemSnapshot(seed().snapshot());
    expect(a).toBe(b);
  });

  it("observeAuditRecord and observeDecision aggregate identically", () => {
    const e = envelope("vacation.request", "n-1");
    const record = buildAuditRecord({
      envelope: e,
      decision: decisionRefuse(refuse("BUSINESS_RULE", "x.y", "z"), [
        basis("BUSINESS_RULE", "x.y", "z"),
      ]),
      durationMs: 1,
      at,
    });
    const a = createEcosystemTelemetry();
    a.observeAuditRecord(record);
    const b = createEcosystemTelemetry();
    b.observeDecision(record.decision);
    expect(a.snapshot().decisions).toEqual(b.snapshot().decisions);
  });

  it("reset() restores the aggregator to an empty snapshot", () => {
    const t = createEcosystemTelemetry();
    t.observeIncident("kill_switch_storm");
    t.reset();
    const snap = t.snapshot();
    expect(snap.incidents.total).toBe(0);
  });

  it("snapshot is JSON-serialisable end-to-end", () => {
    const t = createEcosystemTelemetry();
    t.observePackInstallation("p", "v0");
    t.observeDecision(decisionExecute([]));
    const snap = t.snapshot();
    const json = JSON.stringify(snap);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(snap.schemaVersion).toBe(1);
  });
});
