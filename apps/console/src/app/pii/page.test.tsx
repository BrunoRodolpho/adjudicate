import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PiiEventsPage from "./page";
import { usePiiEvents } from "@/hooks/usePiiEvents";
import { usePiiClassification } from "@/hooks/usePiiClassification";

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

vi.mock("@/hooks/usePiiEvents", () => ({
  usePiiEvents: vi.fn(),
}));
vi.mock("@/hooks/usePiiClassification", () => ({
  usePiiClassification: vi.fn(),
}));

const mockedEvents = vi.mocked(usePiiEvents);
const mockedStats = vi.mocked(usePiiClassification);

/** Stats result with one detection per disposition so the panels render. */
const statsReady = {
  isLoading: false,
  isError: false,
  data: {
    buckets: [
      { sensitivityLevel: "critical", disposition: "blocked", count: 2 },
      { sensitivityLevel: "high", disposition: "redacted", count: 5 },
    ],
  },
} as never;

const oneEvent = {
  intentHash: "abc123hash",
  at: "2026-06-06T00:00:00.000Z",
  intentKind: "send_email",
  decisionKind: "REWRITE",
  sensitivityLevel: "high",
  disposition: "redacted",
};

beforeEach(() => {
  cleanup();
  mockedEvents.mockReset();
  mockedStats.mockReset();
  // Default both hooks to a benign ready state; individual tests override.
  mockedStats.mockReturnValue(statsReady);
  mockedEvents.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { events: [], truncated: false },
  } as never);
});

describe("PiiEventsPage", () => {
  it("renders the loading state for the events table", () => {
    mockedEvents.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as never);
    render(<PiiEventsPage />);
    // AsyncBoundary loading fallback is the <Skeleton/> busy region.
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders an empty state when no events match", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { events: [], truncated: false },
    } as never);
    render(<PiiEventsPage />);
    expect(screen.getByText(/No PII events match/i)).toBeDefined();
  });

  it("renders a row linking to the decision detail by intentHash", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { events: [oneEvent], truncated: false },
    } as never);
    render(<PiiEventsPage />);

    expect(screen.getByText("send_email")).toBeDefined();
    expect(screen.getByText("REWRITE")).toBeDefined();

    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/decisions/abc123hash");
    expect(link).toBeDefined();
  });

  it("passes the selected filters into the events query args", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { events: [], truncated: false },
    } as never);
    render(<PiiEventsPage />);

    // Initial render: no sensitivity/disposition filter in the args.
    const firstCall = mockedEvents.mock.calls[0]?.[0];
    expect(firstCall?.sensitivityLevel).toBeUndefined();
    expect(firstCall?.disposition).toBeUndefined();

    fireEvent.change(screen.getByRole("combobox", { name: /Sensitivity/i }), {
      target: { value: "critical" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Disposition/i }), {
      target: { value: "blocked" },
    });

    const lastCall = mockedEvents.mock.calls.at(-1)?.[0];
    expect(lastCall?.sensitivityLevel).toBe("critical");
    expect(lastCall?.disposition).toBe("blocked");
  });

  it("shows the truncated note when the result is capped", () => {
    mockedEvents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { events: [oneEvent], truncated: true },
    } as never);
    render(<PiiEventsPage />);
    expect(screen.getByTestId("truncated-note")).toBeDefined();
    expect(screen.getByText(/truncated/i)).toBeDefined();
  });

  it("renders the sensitivity breakdown and disposition totals from stats", () => {
    render(<PiiEventsPage />);
    // Disposition totals: redacted=5, blocked=2 (from statsReady).
    const totals = screen.getByTestId("disposition-totals");
    expect(totals.textContent).toContain("5");
    expect(totals.textContent).toContain("2");
  });
});
