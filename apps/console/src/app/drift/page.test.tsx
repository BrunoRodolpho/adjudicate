import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import DriftPage, { severityBand } from "./page";
import { useBehavioralDrift, useDriftTimeline } from "@/hooks/useDrift";

vi.mock("@/hooks/useDrift", () => ({
  useBehavioralDrift: vi.fn(),
  useDriftTimeline: vi.fn(),
}));

// The embedded operational DriftPanel fetches its own audit data; stub it so the
// page renders in isolation (its own coverage lives with the component).
vi.mock("@/components/dashboard/DriftPanel", () => ({
  DriftPanel: () => <div data-testid="operational-drift-stub" />,
}));

const mockedDrift = vi.mocked(useBehavioralDrift);
const mockedTimeline = vi.mocked(useDriftTimeline);

const snapshotClean = {
  schemaVersion: 1 as const,
  baselineWindow: 3,
  recentWindow: 4,
  alertThreshold: 0.25,
  totalObserved: 8,
  dimensions: [
    { dimension: "decision.kind", baseline: { EXECUTE: 3 }, recent: { EXECUTE: 4 }, tvd: 0, alerts: [] },
    { dimension: "intent.kind", baseline: { a: 3 }, recent: { a: 4 }, tvd: 0, alerts: [] },
    { dimension: "basis", baseline: { business: 3 }, recent: { business: 4 }, tvd: 0, alerts: [] },
  ],
};

const snapshotDrifted = {
  schemaVersion: 1 as const,
  baselineWindow: 3,
  recentWindow: 4,
  alertThreshold: 0.25,
  totalObserved: 8,
  dimensions: [
    {
      dimension: "decision.kind",
      baseline: { EXECUTE: 3 },
      recent: { REFUSE: 4 },
      tvd: 1,
      alerts: [
        { dimension: "decision.kind", signal: "distribution_shift", magnitude: 1, threshold: 0.25, baselineCount: 3, recentCount: 4 },
        { dimension: "decision.kind", signal: "new_category", magnitude: 1, threshold: 0.25, category: "REFUSE", baselineCount: 3, recentCount: 4 },
      ],
    },
    {
      dimension: "intent.kind",
      baseline: { a: 3 },
      recent: { a: 2, b: 2 },
      tvd: 0.3,
      alerts: [
        { dimension: "intent.kind", signal: "proportion_spike", magnitude: 0.3, threshold: 0.25, category: "b", baselineCount: 3, recentCount: 4 },
      ],
    },
    { dimension: "basis", baseline: { business: 3 }, recent: { business: 4 }, tvd: 0, alerts: [] },
  ],
};

const timelinePopulated = {
  schemaVersion: 1 as const,
  capacity: 100,
  count: 4,
  dropped: 0,
  entries: [
    { at: "2026-01-01T00:00:00.000Z", seq: 0, totalObserved: 2, maxTvd: 0, alertCount: 0, dimensions: [] },
    { at: "2026-04-02T00:00:00.000Z", seq: 1, totalObserved: 4, maxTvd: 0.2, alertCount: 0, dimensions: [] },
    { at: "2026-07-02T00:00:00.000Z", seq: 2, totalObserved: 6, maxTvd: 0.6, alertCount: 2, dimensions: [] },
    { at: "2026-10-01T00:00:00.000Z", seq: 3, totalObserved: 8, maxTvd: 1, alertCount: 3, dimensions: [] },
  ],
};

function driftState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: snapshotClean,
    refetch: vi.fn(),
    ...over,
  } as never;
}

function timelineState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: timelinePopulated,
    refetch: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  cleanup();
  mockedDrift.mockReset();
  mockedTimeline.mockReset();
  mockedDrift.mockReturnValue(driftState());
  mockedTimeline.mockReturnValue(timelineState());
});

describe("severityBand", () => {
  it("bands magnitude / threshold into ok / elevated / high", () => {
    expect(severityBand(0.1, 0.25)).toBe("ok"); // ratio 0.4
    expect(severityBand(0.25, 0.25)).toBe("elevated"); // ratio 1.0
    expect(severityBand(0.6, 0.25)).toBe("high"); // ratio 2.4
    // Degenerate threshold: any positive magnitude is high.
    expect(severityBand(0.5, 0)).toBe("high");
    expect(severityBand(0, 0)).toBe("ok");
  });
});

describe("DriftPage — Active Drifts (statistical)", () => {
  it("renders active alerts sorted high -> low with severity bands", () => {
    mockedDrift.mockReturnValue(driftState({ data: snapshotDrifted }));
    render(<DriftPage />);
    const panel = screen.getByTestId("drift-active");
    // The distribution_shift (ratio 4) outranks the proportion_spike (ratio 1.2).
    expect(within(panel).getAllByText(/High/).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Proportion spike/)).toBeDefined();
    expect(within(panel).getByText(/Distribution shift/)).toBeDefined();
    // Category surfaces on the new_category / proportion_spike rows.
    expect(within(panel).getByText("REFUSE")).toBeDefined();
  });

  it("shows the healthy empty state when no alerts fire", () => {
    render(<DriftPage />); // snapshotClean has zero alerts
    const panel = screen.getByTestId("drift-active");
    expect(
      within(panel).getByText(/No active drift\. Distributions are within threshold\./),
    ).toBeDefined();
  });

  it("renders the loading skeleton", () => {
    mockedDrift.mockReturnValue(driftState({ isLoading: true, data: undefined }));
    render(<DriftPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the not-configured error copy on PRECONDITION_FAILED", () => {
    mockedDrift.mockReturnValue(driftState({ isError: true, data: undefined }));
    render(<DriftPage />);
    expect(
      screen.getAllByText(/No behavioral-drift detector configured/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("DriftPage — Dimensions", () => {
  it("renders one row per dimension with TVD + alert count", () => {
    mockedDrift.mockReturnValue(driftState({ data: snapshotDrifted }));
    render(<DriftPage />);
    const panel = screen.getByTestId("drift-dimensions");
    expect(within(panel).getByText("decision.kind")).toBeDefined();
    expect(within(panel).getByText("intent.kind")).toBeDefined();
    expect(within(panel).getByText("basis")).toBeDefined();
    // decision.kind TVD = 1.00.
    expect(within(panel).getByText("1.00")).toBeDefined();
  });

  it("shows the insufficient-observations empty state", () => {
    const sparse = { ...snapshotClean, totalObserved: 1, dimensions: [] };
    mockedDrift.mockReturnValue(driftState({ data: sparse }));
    render(<DriftPage />);
    const panel = screen.getByTestId("drift-dimensions");
    expect(
      within(panel).getByText(/Insufficient observations for a baseline comparison/),
    ).toBeDefined();
  });
});

describe("DriftPage — Timeline", () => {
  it("renders the TimelineChart from history points", () => {
    render(<DriftPage />);
    expect(screen.getByTestId("drift-timeline-chart")).toBeDefined();
    // TimelineChart renders a labelled figure (title appears as both the
    // figcaption and the sr-only data-table caption).
    const panel = screen.getByTestId("drift-timeline");
    expect(
      within(panel).getAllByText(/Max TVD per recorded snapshot/).length,
    ).toBeGreaterThan(0);
  });

  it("flags truncated history when dropped > 0", () => {
    mockedTimeline.mockReturnValue(
      timelineState({ data: { ...timelinePopulated, dropped: 5, capacity: 10 } }),
    );
    render(<DriftPage />);
    const note = screen.getByTestId("drift-timeline-truncated");
    expect(note.textContent).toMatch(/5 older snapshots evicted/);
  });

  it("shows the empty state when no history is recorded yet", () => {
    mockedTimeline.mockReturnValue(
      timelineState({ data: { ...timelinePopulated, count: 0, entries: [] } }),
    );
    render(<DriftPage />);
    const panel = screen.getByTestId("drift-timeline");
    expect(
      within(panel).getByText(/No drift history yet/),
    ).toBeDefined();
  });

  it("renders the timeline error state", () => {
    mockedTimeline.mockReturnValue(timelineState({ isError: true, data: undefined }));
    render(<DriftPage />);
    expect(screen.getByText(/Failed to load drift history/i)).toBeDefined();
  });
});

describe("DriftPage — Operational sub-view", () => {
  it("embeds the operational integrity-code DriftPanel, clearly labelled", () => {
    render(<DriftPage />);
    expect(screen.getByTestId("operational-drift-stub")).toBeDefined();
    const panel = screen.getByTestId("drift-operational");
    expect(
      within(panel).getByText(/Operational \(integrity\) signal/),
    ).toBeDefined();
  });
});
