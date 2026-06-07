import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CommandRiskPage from "./page";
import { useCommandRisk } from "@/hooks/useCommandRisk";
import { useCommandRiskEvents } from "@/hooks/useCommandRiskEvents";

// next/link → a plain anchor so we can assert the href the row links to.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/useCommandRisk", () => ({
  useCommandRisk: vi.fn(),
}));
vi.mock("@/hooks/useCommandRiskEvents", () => ({
  useCommandRiskEvents: vi.fn(),
}));

const mockedStats = vi.mocked(useCommandRisk);
const mockedEvents = vi.mocked(useCommandRiskEvents);

/** Aggregate result spanning all three categories + dispositions. */
const statsReady = {
  isLoading: false,
  isError: false,
  data: {
    buckets: [
      { category: "destructive", disposition: "refuse", count: 2 },
      { category: "destructive", disposition: "rewrite", count: 1 },
      { category: "credential", disposition: "confirm", count: 3 },
      { category: "network", disposition: "confirm", count: 4 },
    ],
  },
} as never;

/**
 * A blocked event. Note: the event carries ONLY non-sensitive metadata — there
 * is intentionally NO `command` field here, mirroring the wire contract.
 */
const oneBlocked = {
  intentHash: "blockedhash123",
  at: "2026-06-06T00:00:00.000Z",
  intentKind: "shell.exec",
  decisionKind: "REFUSE",
  category: "destructive",
  disposition: "refuse",
};

beforeEach(() => {
  cleanup();
  mockedStats.mockReset();
  mockedEvents.mockReset();
  mockedStats.mockReturnValue(statsReady);
  mockedEvents.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { events: [], truncated: false },
  } as never);
});

describe("CommandRiskPage", () => {
  it("renders the category distribution from the aggregate", () => {
    render(<CommandRiskPage />);
    // BarDistribution mirrors its data into a visually-hidden table.
    const tables = screen.getAllByTestId("chart-data-table");
    const text = tables.map((t) => t.textContent).join(" ");
    expect(text).toContain("destructive");
    expect(text).toContain("credential");
    expect(text).toContain("network");
  });

  it("renders disposition totals and the Approval Center cross-link", () => {
    render(<CommandRiskPage />);
    const totals = screen.getByTestId("disposition-totals");
    // refuse=2, rewrite=1; confirm total = 3+4 = 7.
    expect(totals.textContent).toContain("2");
    expect(totals.textContent).toContain("1");

    const crosslink = screen.getByTestId("confirm-queue-crosslink");
    expect(crosslink.textContent).toContain("7");
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/approvals");
    expect(link).toBeDefined();
  });

  it("renders the blocked-commands list WITHOUT any command text", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { events: [oneBlocked], truncated: false },
    } as never);
    const { container } = render(<CommandRiskPage />);

    // The row renders its metadata and links to the Decision Detail.
    expect(screen.getByText("shell.exec")).toBeDefined();
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/decisions/blockedhash123");
    expect(link).toBeDefined();

    // No command text columns/headers exist — redaction by construction.
    expect(screen.queryByText(/^command$/i)).toBeNull();
    // Defense-in-depth: a representative live secret never appears in the DOM
    // (the page has no path that could surface command text at all).
    expect(container.textContent).not.toContain("rm -rf");
    expect(container.textContent).not.toContain("AWS_SECRET");
  });

  it("filters the blocked list by category", () => {
    render(<CommandRiskPage />);
    // Initial render: refuse disposition, no category filter.
    const firstCall = mockedEvents.mock.calls[0]?.[0];
    expect(firstCall?.disposition).toBe("refuse");
    expect(firstCall?.category).toBeUndefined();

    fireEvent.change(screen.getByRole("combobox", { name: /Category/i }), {
      target: { value: "credential" },
    });
    const lastCall = mockedEvents.mock.calls.at(-1)?.[0];
    expect(lastCall?.category).toBe("credential");
    expect(lastCall?.disposition).toBe("refuse");
  });

  it("renders the empty state when no risky commands in window", () => {
    mockedStats.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { buckets: [] },
    } as never);
    render(<CommandRiskPage />);
    expect(screen.getAllByText(/No risky commands in this window/i).length).toBeGreaterThan(0);
  });

  it("renders the loading state for the blocked list", () => {
    mockedEvents.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as never);
    render(<CommandRiskPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the error state when the blocked drill-down fails", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    } as never);
    render(<CommandRiskPage />);
    expect(screen.getByText(/Blocked commands unavailable/i)).toBeDefined();
  });
});
