import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import ConfigurationIntegrityPage from "./page";
import {
  useConfigSealStatusAll,
  useKillSwitchTimeline,
} from "@/hooks/useConfigIntegrity";

vi.mock("@/hooks/useConfigIntegrity", () => ({
  useConfigSealStatusAll: vi.fn(),
  useKillSwitchTimeline: vi.fn(),
}));

// The embedded raw governance log fetches its own data; stub it so the page
// renders in isolation (its own coverage lives elsewhere).
vi.mock("@/components/control/EmergencyHistoryList", () => ({
  EmergencyHistoryList: () => <div data-testid="emergency-history-stub" />,
}));

const mockedSeals = vi.mocked(useConfigSealStatusAll);
const mockedTimeline = vi.mocked(useKillSwitchTimeline);

const cleanReport = {
  verified: true,
  digestMatch: "match" as const,
  computedDigest: "a".repeat(64),
  expectedDigest: "a".repeat(64),
  signatureVerification: { verified: null, reason: "not_required" as const },
  errors: [] as string[],
};

const driftReport = {
  verified: false,
  digestMatch: "mismatch" as const,
  computedDigest: "b".repeat(64),
  expectedDigest: "a".repeat(64),
  signatureVerification: { verified: null, reason: "not_required" as const },
  errors: [`config digest mismatch: expected ${"a".repeat(64)}, got ${"b".repeat(64)}`],
};

const entriesClean = [
  { packId: "pack-pix", packVersion: "1.0.0", report: cleanReport, violations: [] },
  { packId: "pack-kyc", packVersion: "2.1.0", report: cleanReport, violations: [] },
];

const entriesWithDrift = [
  { packId: "pack-pix", packVersion: "1.0.0", report: cleanReport, violations: [] },
  {
    packId: "pack-kyc",
    packVersion: "2.1.0",
    report: driftReport,
    violations: [
      {
        kind: "digest_mismatch" as const,
        message: driftReport.errors[0]!,
        basisCode: "seal_mismatch" as const,
      },
    ],
  },
];

const stableTimeline = {
  schemaVersion: 1 as const,
  totalEvents: 0,
  trips: 0,
  clears: 0,
  transitions: 0,
  maxTripDensity: 0,
  bySource: { operator: 0, automated: 0, boot: 0, external: 0, unknown: 0 },
  activeDurationMs: 0,
  stability: "stable" as const,
  headline: "kill-switch timeline: stable, 0 trips",
};

const stormTimeline = {
  ...stableTimeline,
  totalEvents: 12,
  trips: 7,
  clears: 5,
  transitions: 11,
  maxTripDensity: 6,
  bySource: { operator: 12, automated: 0, boot: 0, external: 0, unknown: 0 },
  activeDurationMs: 42_000,
  stability: "storm" as const,
  headline: "kill-switch timeline: STORM (7 trips, 11 transitions, 42s engaged) — investigate",
};

function sealsState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: { entries: entriesClean },
    refetch: vi.fn(),
    ...over,
  } as never;
}

function timelineState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: stableTimeline,
    refetch: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  cleanup();
  mockedSeals.mockReset();
  mockedTimeline.mockReset();
  mockedSeals.mockReturnValue(sealsState());
  mockedTimeline.mockReturnValue(timelineState());
});

describe("ConfigurationIntegrityPage — Active seals (Panel A)", () => {
  it("renders one row per pack with status + digest", () => {
    render(<ConfigurationIntegrityPage />);
    const panel = screen.getByTestId("integrity-seals");
    expect(within(panel).getByText(/pack-pix/)).toBeDefined();
    expect(within(panel).getByText(/pack-kyc/)).toBeDefined();
    expect(within(panel).getAllByText(/Sealed/).length).toBeGreaterThan(0);
  });

  it("shows a Drift status for a non-verified pack", () => {
    mockedSeals.mockReturnValue(sealsState({ data: { entries: entriesWithDrift } }));
    render(<ConfigurationIntegrityPage />);
    const panel = screen.getByTestId("integrity-seals");
    expect(within(panel).getByText("Drift")).toBeDefined();
  });

  it("renders the empty state when no seals are wired", () => {
    mockedSeals.mockReturnValue(sealsState({ data: { entries: [] } }));
    render(<ConfigurationIntegrityPage />);
    expect(screen.getAllByText(/No config seals configured/i).length).toBeGreaterThan(0);
  });

  it("renders the loading skeleton", () => {
    mockedSeals.mockReturnValue(sealsState({ isLoading: true, data: undefined }));
    render(<ConfigurationIntegrityPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the error state", () => {
    mockedSeals.mockReturnValue(sealsState({ isError: true, data: undefined }));
    render(<ConfigurationIntegrityPage />);
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});

describe("ConfigurationIntegrityPage — Seal violations (Panel B)", () => {
  it("shows the positive empty state when every pack verifies", () => {
    render(<ConfigurationIntegrityPage />);
    expect(screen.getByTestId("integrity-violations-empty")).toBeDefined();
  });

  it("lists a structured violation chip + audit linkage for a drifted pack", () => {
    mockedSeals.mockReturnValue(sealsState({ data: { entries: entriesWithDrift } }));
    render(<ConfigurationIntegrityPage />);
    const list = screen.getByTestId("integrity-violations-list");
    expect(within(list).getByText("Digest mismatch")).toBeDefined();
    // basisCode === seal_mismatch surfaces the audit linkage.
    expect(within(list).getByText(/View audit linkage/i)).toBeDefined();
  });

  it("omits the audit linkage for non-enforcement violations", () => {
    const sigFail = {
      packId: "pack-x",
      packVersion: "1.0.0",
      report: { ...cleanReport, verified: false },
      violations: [
        { kind: "signature_failed" as const, message: "config seal signature failed: bad", basisCode: null },
      ],
    };
    mockedSeals.mockReturnValue(sealsState({ data: { entries: [sigFail] } }));
    render(<ConfigurationIntegrityPage />);
    const list = screen.getByTestId("integrity-violations-list");
    expect(within(list).getByText("Signature failed")).toBeDefined();
    expect(within(list).queryByText(/View audit linkage/i)).toBeNull();
  });
});

describe("ConfigurationIntegrityPage — Kill-switch timeline (Panel C)", () => {
  it("renders a stable stability badge + headline", () => {
    render(<ConfigurationIntegrityPage />);
    const badge = screen.getByTestId("integrity-stability-badge");
    expect(badge.textContent).toMatch(/Stable/);
    // Color-independent: the accessible label carries the class + headline.
    expect(badge.getAttribute("aria-label")).toMatch(/stable/i);
    expect(screen.getByText(/stable, 0 trips/)).toBeDefined();
  });

  it("renders a storm badge with the storm headline + stat tiles", () => {
    mockedTimeline.mockReturnValue(timelineState({ data: stormTimeline }));
    render(<ConfigurationIntegrityPage />);
    const badge = screen.getByTestId("integrity-stability-badge");
    expect(badge.textContent).toMatch(/Storm/);
    expect(screen.getByText(/STORM/)).toBeDefined();
    const summary = screen.getByTestId("integrity-timeline-summary");
    // The trips stat tile shows the value.
    expect(within(summary).getByText("7")).toBeDefined();
  });

  it("degrades to the raw event log when the timeline query errors", () => {
    mockedTimeline.mockReturnValue(timelineState({ isError: true, data: undefined }));
    render(<ConfigurationIntegrityPage />);
    // The roll-up shows an error, but the embedded raw log still renders.
    expect(screen.getByTestId("emergency-history-stub")).toBeDefined();
    expect(screen.getByText(/timeline unavailable/i)).toBeDefined();
  });

  it("cross-links to the Control page for engage/restore", () => {
    render(<ConfigurationIntegrityPage />);
    expect(screen.getByRole("link", { name: /Control/i })).toBeDefined();
  });
});
