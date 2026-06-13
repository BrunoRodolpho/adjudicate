import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IncidentsPage from "./page";
import { useIncidents } from "@/hooks/useIncidents";

vi.mock("@/hooks/useIncidents", () => ({
  useIncidents: vi.fn(),
}));

const mockedIncidents = vi.mocked(useIncidents);

const ready = {
  isLoading: false,
  isError: false,
  data: [
    {
      incidentId: "inc-1",
      severity: "sev2",
      status: "open",
      dependencies: [],
      lastDisposition: "SAFE",
      executed: true,
      pending: null,
      updatedAt: "2026-06-12T09:00:00.000Z",
    },
    {
      incidentId: "inc-3",
      severity: "sev3",
      status: "open",
      dependencies: [{ service: "payments-api", status: "degraded" }],
      lastDisposition: "REVIEW",
      executed: false,
      pending: { kind: "review", prompt: "Confirm remediation?" },
      updatedAt: "2026-06-12T09:10:00.000Z",
    },
  ],
} as never;

beforeEach(() => {
  cleanup();
  mockedIncidents.mockReset();
  mockedIncidents.mockReturnValue(ready);
});

describe("IncidentsPage", () => {
  it("renders incident rows with severity, status, disposition, executed, pending", () => {
    render(<IncidentsPage />);
    const inc1 = screen.getByTestId("incident-row-inc-1");
    expect(inc1.textContent).toContain("inc-1");
    expect(inc1.textContent).toContain("sev2");
    expect(inc1.textContent).toContain("open");
    expect(inc1.textContent).toContain("SAFE");
    expect(inc1.textContent).toContain("yes");

    const inc3 = screen.getByTestId("incident-row-inc-3");
    expect(inc3.textContent).toContain("REVIEW");
    expect(inc3.textContent).toContain("payments-api");
    expect(inc3.textContent).toContain("review");
  });

  it("renders the loading state", () => {
    mockedIncidents.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as never);
    render(<IncidentsPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the empty state when no incidents", () => {
    mockedIncidents.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    render(<IncidentsPage />);
    expect(screen.getAllByText(/No incidents recorded/i).length).toBeGreaterThan(0);
  });

  it("renders the error state when the port is unwired", () => {
    mockedIncidents.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    } as never);
    render(<IncidentsPage />);
    expect(screen.getByText(/Incidents port not configured/i)).toBeDefined();
  });
});
