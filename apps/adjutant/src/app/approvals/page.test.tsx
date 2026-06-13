import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApprovalsPage from "./page";
import { useApprovals, useResolveApproval } from "@/hooks/useApprovals";

vi.mock("@/hooks/useApprovals", () => ({
  useApprovals: vi.fn(),
  useResolveApproval: vi.fn(),
}));

const mockedApprovals = vi.mocked(useApprovals);
const mockedResolve = vi.mocked(useResolveApproval);
const mutate = vi.fn();

const ready = {
  isLoading: false,
  isError: false,
  data: [
    {
      token: "tok-0",
      sessionId: "inc-3",
      intentHash: "0xdef",
      intentKind: "incident.remediation.execute",
      prompt: "Confirm remediation?",
      taint: "TRUSTED",
      channel: "adjutant",
      status: "pending",
      requestedAt: "2026-06-12T09:10:00.000Z",
    },
  ],
} as never;

beforeEach(() => {
  cleanup();
  mockedApprovals.mockReset();
  mockedResolve.mockReset();
  mutate.mockReset();
  mockedApprovals.mockReturnValue(ready);
  mockedResolve.mockReturnValue({ mutate, isPending: false } as never);
});

describe("ApprovalsPage", () => {
  it("renders pending approval rows", () => {
    render(<ApprovalsPage />);
    const row = screen.getByTestId("approval-row-tok-0");
    expect(row.textContent).toContain("tok-0");
    expect(row.textContent).toContain("inc-3");
    expect(row.textContent).toContain("incident.remediation.execute");
    expect(row.textContent).toContain("Confirm remediation?");
  });

  it("fires resolve with {token, accepted:true} on Approve click", () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByTestId("approve-tok-0"));
    expect(mutate).toHaveBeenCalledWith({ token: "tok-0", accepted: true });
  });

  it("fires resolve with {token, accepted:false} on Decline click", () => {
    render(<ApprovalsPage />);
    fireEvent.click(screen.getByTestId("decline-tok-0"));
    expect(mutate).toHaveBeenCalledWith({ token: "tok-0", accepted: false });
  });

  it("renders the loading state", () => {
    mockedApprovals.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as never);
    render(<ApprovalsPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the empty state when no pending approvals", () => {
    mockedApprovals.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    render(<ApprovalsPage />);
    expect(screen.getAllByText(/No pending approvals/i).length).toBeGreaterThan(0);
  });

  it("renders the error state when the port is unwired", () => {
    mockedApprovals.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    } as never);
    render(<ApprovalsPage />);
    expect(screen.getByText(/Approval port not configured/i)).toBeDefined();
  });
});
