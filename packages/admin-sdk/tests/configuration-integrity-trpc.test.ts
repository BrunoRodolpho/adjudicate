import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  ConfigSealReportSchema,
  ConfigSealStatusAllResultSchema,
  PackConfigSealEntrySchema,
  deriveSealViolations,
  type ConfigSealReportParsed,
  type PackConfigSealEntryParsed,
} from "../src/schemas/config-seal.js";
import {
  KillSwitchTimelineReportSchema,
  type KillSwitchTimelineReportParsed,
} from "../src/schemas/kill-switch-timeline.js";

/**
 * tRPC-level + schema coverage for the Configuration Integrity surface
 * (ADR-131): `governance.configSealStatusAll` (multi-pack entries +
 * derived violations) and `governance.killSwitchTimeline` (exposes the
 * pre-computed, adopter-side analyzer report). Both follow the established
 * context-read posture — PRECONDITION_FAILED is the runtime feature-detection
 * signal when the context field is absent. The existing single-pack
 * `governance.configSealStatus` must keep working (no regression).
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(
  ctx: Partial<Parameters<typeof createAdminCaller>[0]>,
) {
  return createAdminCaller({
    store,
    emergencyStore,
    actor: null,
    ...ctx,
  });
}

/** A verified (clean) single-pack seal report. */
function cleanReport(): ConfigSealReportParsed {
  return {
    verified: true,
    digestMatch: "match",
    computedDigest: "a".repeat(64),
    expectedDigest: "a".repeat(64),
    signatureVerification: { verified: null, reason: "not_required" },
    errors: [],
  };
}

/** A report with a digest mismatch (the canonical seal-drift case). */
function digestMismatchReport(): ConfigSealReportParsed {
  return {
    verified: false,
    digestMatch: "mismatch",
    computedDigest: "b".repeat(64),
    expectedDigest: "a".repeat(64),
    signatureVerification: { verified: null, reason: "not_required" },
    errors: [`config digest mismatch: expected ${"a".repeat(64)}, got ${"b".repeat(64)}`],
  };
}

function entry(
  packId: string,
  report: ConfigSealReportParsed,
  packVersion?: string,
): PackConfigSealEntryParsed {
  return {
    packId,
    ...(packVersion ? { packVersion } : {}),
    report,
    violations: deriveSealViolations(report),
  };
}

/** A producer-shaped (analyzeKillSwitchTimeline) report — built by hand so the
 * test carries no @adjudicate/audit dependency, exactly like the schema. */
function timelineReport(
  overrides: Partial<KillSwitchTimelineReportParsed> = {},
): KillSwitchTimelineReportParsed {
  return {
    schemaVersion: 1,
    totalEvents: 0,
    trips: 0,
    clears: 0,
    transitions: 0,
    maxTripDensity: 0,
    bySource: { operator: 0, automated: 0, boot: 0, external: 0, unknown: 0 },
    activeDurationMs: 0,
    stability: "stable",
    headline: "kill-switch timeline: stable, 0 trips",
    ...overrides,
  };
}

describe("deriveSealViolations (ADR-131)", () => {
  it("emits no violations for a clean, verified report", () => {
    expect(deriveSealViolations(cleanReport())).toEqual([]);
  });

  it("maps a digest mismatch to digest_mismatch with the seal_mismatch basisCode", () => {
    const v = deriveSealViolations(digestMismatchReport());
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe("digest_mismatch");
    expect(v[0]!.basisCode).toBe("seal_mismatch");
    expect(v[0]!.message).toContain("digest mismatch");
  });

  it("maps a failed signature to signature_failed (no kernel linkage)", () => {
    const report: ConfigSealReportParsed = {
      verified: false,
      digestMatch: "match",
      computedDigest: "a".repeat(64),
      expectedDigest: "a".repeat(64),
      signatureVerification: { verified: false, reason: "bad signature" },
      errors: ["config seal signature failed: bad signature"],
    };
    const v = deriveSealViolations(report);
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe("signature_failed");
    expect(v[0]!.basisCode).toBeNull();
  });

  it("maps not_supplied under require_signature to signature_missing", () => {
    const report: ConfigSealReportParsed = {
      verified: false,
      digestMatch: "match",
      computedDigest: "a".repeat(64),
      expectedDigest: "a".repeat(64),
      signatureVerification: { verified: null, reason: "not_supplied" },
      errors: ["config seal policy require_signature requires signature + publicKeyPem"],
    };
    const v = deriveSealViolations(report);
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe("signature_missing");
    expect(v[0]!.basisCode).toBeNull();
  });

  it("classifies residual errors as policy_error without double-counting", () => {
    const report: ConfigSealReportParsed = {
      verified: false,
      digestMatch: "mismatch",
      computedDigest: "b".repeat(64),
      expectedDigest: "a".repeat(64),
      errors: [
        `config digest mismatch: expected ${"a".repeat(64)}, got ${"b".repeat(64)}`,
        "some other policy failure",
      ],
      signatureVerification: { verified: null, reason: "not_required" },
    };
    const v = deriveSealViolations(report);
    expect(v.map((x) => x.kind)).toEqual(["digest_mismatch", "policy_error"]);
    // The digest-mismatch error string is consumed once, not re-emitted.
    expect(v.filter((x) => x.message.includes("digest mismatch"))).toHaveLength(1);
  });
});

describe("schema round-trips + closed-enum guards (ADR-131)", () => {
  it("PackConfigSealEntrySchema round-trips a verified entry", () => {
    const parsed = PackConfigSealEntrySchema.parse(
      entry("pack-pix", cleanReport(), "1.0.0"),
    );
    expect(parsed.packId).toBe("pack-pix");
    expect(parsed.report.verified).toBe(true);
  });

  it("ConfigSealStatusAllResultSchema round-trips multiple entries", () => {
    const result = ConfigSealStatusAllResultSchema.parse({
      entries: [entry("pack-pix", cleanReport()), entry("pack-kyc", digestMismatchReport())],
    });
    expect(result.entries.map((e) => e.packId)).toEqual(["pack-pix", "pack-kyc"]);
  });

  it("KillSwitchTimelineReportSchema round-trips one report per stability class", () => {
    for (const stability of ["stable", "single_incident", "recurring_incidents", "storm"] as const) {
      expect(
        KillSwitchTimelineReportSchema.safeParse(timelineReport({ stability })).success,
      ).toBe(true);
    }
  });

  it("KillSwitchTimelineReportSchema rejects an unknown stability value", () => {
    const bad = { ...timelineReport(), stability: "meltdown" };
    expect(KillSwitchTimelineReportSchema.safeParse(bad).success).toBe(false);
  });

  it("ConfigSealReportSchema (re-used verbatim) still parses", () => {
    expect(ConfigSealReportSchema.safeParse(cleanReport()).success).toBe(true);
  });
});

describe("governance.configSealStatusAll (ADR-131)", () => {
  it("returns one entry per wired pack, no actor required", async () => {
    const caller = callerWith({
      configSealReports: [entry("pack-pix", cleanReport(), "1.0.0"), entry("pack-kyc", digestMismatchReport(), "2.1.0")],
    });
    const result = await caller.governance.configSealStatusAll();
    expect(result.entries.map((e) => e.packId)).toEqual(["pack-pix", "pack-kyc"]);
    // The drifted pack carries a structured digest_mismatch violation.
    const kyc = result.entries.find((e) => e.packId === "pack-kyc")!;
    expect(kyc.violations.map((v) => v.kind)).toContain("digest_mismatch");
  });

  it("PRECONDITION_FAILED when no multi-pack reports are wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.configSealStatusAll()).rejects.toThrow(/not configured/i);
  });

  it("does not regress the single-pack governance.configSealStatus", async () => {
    const caller = callerWith({ configSealStatus: cleanReport() });
    const report = await caller.governance.configSealStatus();
    expect(report.verified).toBe(true);
    // The single-pack procedure is independent of configSealReports.
    await expect(caller.governance.configSealStatusAll()).rejects.toThrow(/not configured/i);
  });
});

describe("governance.killSwitchTimeline (ADR-131)", () => {
  it("returns the threaded report when wired", async () => {
    const report = timelineReport({
      totalEvents: 4,
      trips: 2,
      clears: 2,
      transitions: 3,
      stability: "recurring_incidents",
      bySource: { operator: 4, automated: 0, boot: 0, external: 0, unknown: 0 },
      headline: "kill-switch timeline: recurring (2 trips, 3 transitions, 0s engaged)",
    });
    const caller = callerWith({ killSwitchTimeline: report });
    const out = await caller.governance.killSwitchTimeline();
    expect(out.stability).toBe("recurring_incidents");
    expect(out.trips).toBe(2);
    expect(out.bySource.operator).toBe(4);
  });

  it("PRECONDITION_FAILED when no timeline report is wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.killSwitchTimeline()).rejects.toThrow(/not configured/i);
  });
});
