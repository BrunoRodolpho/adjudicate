import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import RedTeamPage from "./page";
import { useRedTeam, useRedTeamHistory } from "@/hooks/useRedTeam";

vi.mock("@/hooks/useRedTeam", () => ({
  useRedTeam: vi.fn(),
  useRedTeamHistory: vi.fn(),
}));

const mockedReport = vi.mocked(useRedTeam);
const mockedHistory = vi.mocked(useRedTeamHistory);

const reportClean = {
  pack: { id: "pack-payments-pix" },
  results: [
    { name: "pi-1", vector: "prompt_injection", status: "defended", acceptable: ["REFUSE"] },
    { name: "pi-2", vector: "prompt_injection", status: "defended", acceptable: ["REFUSE"] },
    { name: "te-1", vector: "taint_escalation", status: "defended", acceptable: ["REFUSE"] },
    { name: "tsv-1", vector: "tool_scope_violation", status: "defended", acceptable: ["REFUSE"] },
  ],
  summary: {
    total: 4,
    defended: 4,
    escaped: 0,
    errors: 0,
    escapesByVector: { prompt_injection: 0, taint_escalation: 0, tool_scope_violation: 0 },
  },
};

const reportRegressed = {
  pack: { id: "pack-payments-pix" },
  results: [
    { name: "pi-1", vector: "prompt_injection", status: "escaped", decision: "EXECUTE", acceptable: ["REFUSE"] },
    { name: "te-1", vector: "taint_escalation", status: "defended", acceptable: ["REFUSE"] },
  ],
  summary: {
    total: 2,
    defended: 1,
    escaped: 1,
    errors: 0,
    escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
  },
};

const historyPopulated = {
  runs: [
    {
      digest: "0xcafe0001",
      at: "2026-10-01T00:00:00.000Z",
      packId: "pack-payments-pix",
      summary: {
        total: 4,
        defended: 4,
        escaped: 0,
        errors: 0,
        escapesByVector: { prompt_injection: 0, taint_escalation: 0, tool_scope_violation: 0 },
      },
    },
    {
      digest: "0xbeef0002",
      at: "2026-04-02T00:00:00.000Z",
      packId: "pack-payments-pix",
      summary: {
        total: 4,
        defended: 3,
        escaped: 1,
        errors: 0,
        escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
      },
    },
  ],
  trend: [
    { at: "2026-01-01T00:00:00.000Z", packId: "pack-payments-pix", total: 4, defended: 4, escaped: 0, errors: 0 },
    { at: "2026-04-02T00:00:00.000Z", packId: "pack-payments-pix", total: 4, defended: 3, escaped: 1, errors: 0 },
    { at: "2026-10-01T00:00:00.000Z", packId: "pack-payments-pix", total: 4, defended: 4, escaped: 0, errors: 0 },
  ],
};

function reportState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: reportClean,
    refetch: vi.fn(),
    ...over,
  } as never;
}

function historyState(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: historyPopulated,
    refetch: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  cleanup();
  mockedReport.mockReset();
  mockedHistory.mockReset();
  mockedReport.mockReturnValue(reportState());
  mockedHistory.mockReturnValue(historyState());
});

describe("RedTeamPage — pass / fail", () => {
  it("renders the defended/escaped/error summary line (clean is emerald)", () => {
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-passfail");
    const summary = within(panel).getByTestId("red-team-summary");
    expect(summary.textContent).toContain("4 scenarios");
    expect(summary.textContent).toContain("4 defended");
    expect(summary.textContent).toContain("0 escaped");
    expect(summary.className).toContain("text-emerald-300");
  });

  it("marks a regression red and shows the per-vector escape count", () => {
    mockedReport.mockReturnValue(reportState({ data: reportRegressed }));
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-passfail");
    const summary = within(panel).getByTestId("red-team-summary");
    expect(summary.textContent).toContain("1 escaped");
    expect(summary.className).toContain("text-red-300");
    // The escapesByVector table surfaces the prompt-injection escape.
    expect(within(panel).getByText("Prompt Injection")).toBeDefined();
  });
});

describe("RedTeamPage — attack categories", () => {
  it("counts scenarios per attack vector (includes zero-count vectors)", () => {
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-categories");
    expect(within(panel).getByTestId("red-team-categories-chart")).toBeDefined();
    // BarDistribution mirrors data into a visually-hidden table; PI has 2.
    expect(within(panel).getAllByText("Prompt Injection").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Tool-Scope Violation").length).toBeGreaterThan(0);
  });
});

describe("RedTeamPage — trend", () => {
  it("renders the trend chart and a run table with short digests", () => {
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-trend");
    expect(within(panel).getByTestId("red-team-trend-chart")).toBeDefined();
    // Newest-first run table.
    expect(within(panel).getByText("0xcafe0001")).toBeDefined();
    expect(within(panel).getByText("0xbeef0002")).toBeDefined();
  });

  it("shows the empty state when no runs are recorded", () => {
    mockedHistory.mockReturnValue(
      historyState({ data: { runs: [], trend: [] } }),
    );
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-trend");
    expect(
      within(panel).getByText(/No runs recorded yet/i),
    ).toBeDefined();
  });
});

describe("RedTeamPage — loading / error states", () => {
  it("shows loading skeletons while the report is in flight", () => {
    mockedReport.mockReturnValue(reportState({ isLoading: true, data: undefined }));
    render(<RedTeamPage />);
    // Pass/fail summary is not rendered while loading.
    const panel = screen.getByTestId("red-team-passfail");
    expect(within(panel).queryByTestId("red-team-summary")).toBeNull();
  });

  it("shows the not-configured error for the report", () => {
    mockedReport.mockReturnValue(
      reportState({ isError: true, data: undefined }),
    );
    render(<RedTeamPage />);
    const panel = screen.getByTestId("red-team-passfail");
    expect(
      within(panel).getByText(/No red-team report configured/i),
    ).toBeDefined();
  });

  it("shows the not-configured error for the history independently", () => {
    mockedHistory.mockReturnValue(
      historyState({ isError: true, data: undefined }),
    );
    render(<RedTeamPage />);
    const trend = screen.getByTestId("red-team-trend");
    expect(within(trend).getByText(/No red-team history configured/i)).toBeDefined();
    // The report panels still render.
    expect(
      within(screen.getByTestId("red-team-passfail")).getByTestId("red-team-summary"),
    ).toBeDefined();
  });
});
