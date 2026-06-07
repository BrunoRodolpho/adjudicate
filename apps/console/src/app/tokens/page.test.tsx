import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TokensPage from "./page";
import {
  useTokenBudgetByTenant,
  useTokenSessions,
} from "@/hooks/useTokenGovernance";

vi.mock("@/hooks/useTokenGovernance", () => ({
  useTokenBudgetByTenant: vi.fn(),
  useTokenSessions: vi.fn(),
}));

const mockedTenant = vi.mocked(useTokenBudgetByTenant);
const mockedSessions = vi.mocked(useTokenSessions);

const tenantReady = {
  isLoading: false,
  isError: false,
  data: {
    tenants: [
      // over budget
      { tenantId: "acme", consumed: 118_600, budget: 90_000, remaining: -28_600, sessionCount: 3 },
      // within budget
      { tenantId: "globex", consumed: 12_500, budget: 90_000, remaining: 77_500, sessionCount: 1 },
    ],
    exhaustionEvents: [
      { id: "evt:2", at: "2026-06-07T09:10:00.000Z", scope: "tenant", tenantId: "acme", consumed: 118_600, budget: 90_000 },
      { id: "evt:1", at: "2026-06-07T09:10:00.000Z", scope: "session", sessionId: "sess-dep-03", tenantId: "acme", consumed: 52_300, budget: 50_000 },
    ],
    totalConsumed: 131_100,
  },
} as never;

const sessionsReady = {
  isLoading: false,
  isError: false,
  data: {
    sessions: [
      { sessionId: "sess-pix-01", tenantId: "acme", consumed: 18_400, budget: 50_000, remaining: 31_600 },
      { sessionId: "sess-dep-03", tenantId: "acme", consumed: 52_300, budget: 50_000, remaining: -2_300 },
      { sessionId: "sess-bil-04", tenantId: "globex", consumed: 12_500, budget: 50_000, remaining: 37_500 },
    ],
    totalConsumed: 83_200,
  },
} as never;

beforeEach(() => {
  cleanup();
  mockedTenant.mockReset();
  mockedSessions.mockReset();
  mockedTenant.mockReturnValue(tenantReady);
  mockedSessions.mockReturnValue(sessionsReady);
});

describe("TokensPage", () => {
  it("renders tenant rows with consumed/budget/remaining/sessions", () => {
    render(<TokensPage />);
    const acme = screen.getByTestId("tenant-row-acme");
    expect(acme.textContent).toContain("acme");
    expect(acme.textContent).toContain("118,600");
    expect(acme.textContent).toContain("90,000");
    expect(acme.textContent).toContain("-28,600");
    const globex = screen.getByTestId("tenant-row-globex");
    expect(globex.textContent).toContain("globex");
  });

  it("highlights the over-budget tenant via data-band + a text/icon fallback (not colour alone)", () => {
    render(<TokensPage />);
    expect(screen.getByTestId("tenant-row-acme").getAttribute("data-band")).toBe("over");
    expect(screen.getByTestId("tenant-row-globex").getAttribute("data-band")).toBe("ok");
    // Burn bar carries a numeric aria-label, never colour-only.
    const overBar = screen.getByLabelText(/tenant acme: 118,600 of 90,000 tokens, 132%, over budget/i);
    expect(overBar).toBeDefined();
  });

  it("renders session rows with a tenant chip", () => {
    render(<TokensPage />);
    const over = screen.getByTestId("session-row-sess-dep-03");
    expect(over.getAttribute("data-band")).toBe("over");
    expect(over.textContent).toContain("acme");
    expect(over.textContent).toContain("-2,300");
    expect(screen.getByTestId("session-row-sess-pix-01").getAttribute("data-band")).toBe("ok");
  });

  it("renders the exhaustion timeline newest-first with scope badges", () => {
    render(<TokensPage />);
    const timeline = screen.getByTestId("exhaustion-timeline");
    expect(timeline.textContent).toContain("tenant");
    expect(timeline.textContent).toContain("session");
    expect(screen.getByTestId("exhaustion-event-evt:2")).toBeDefined();
    expect(screen.getByTestId("exhaustion-event-evt:1")).toBeDefined();
  });

  it("filters the exhaustion timeline by scope", () => {
    render(<TokensPage />);
    fireEvent.change(screen.getByRole("combobox", { name: /Scope/i }), {
      target: { value: "tenant" },
    });
    expect(screen.getByTestId("exhaustion-event-evt:2")).toBeDefined();
    expect(screen.queryByTestId("exhaustion-event-evt:1")).toBeNull();
  });

  it("renders the loading state for the tenant view", () => {
    mockedTenant.mockReturnValue({ isLoading: true, isError: false, data: undefined } as never);
    render(<TokensPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the honest 'not configured' error state when the tenant store is unwired", () => {
    mockedTenant.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<TokensPage />);
    expect(
      screen.getByText(/Tenant token-budget store not configured/i),
    ).toBeDefined();
  });

  it("renders the healthy empty timeline state (neutral, not an error)", () => {
    mockedTenant.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { tenants: [], exhaustionEvents: [], totalConsumed: 0 },
    } as never);
    render(<TokensPage />);
    expect(
      screen.getAllByText(/No budget exhaustions recorded/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the empty session state when no session usage recorded", () => {
    mockedSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { sessions: [], totalConsumed: 0 },
    } as never);
    render(<TokensPage />);
    expect(screen.getAllByText(/No session usage recorded/i).length).toBeGreaterThan(0);
  });
});
