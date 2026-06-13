import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OverviewPage from "./page";
import { useIncidents } from "@/hooks/useIncidents";
import { useProposals } from "@/hooks/useProposals";
import { useApprovals } from "@/hooks/useApprovals";

vi.mock("@/hooks/useIncidents", () => ({ useIncidents: vi.fn() }));
vi.mock("@/hooks/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("@/hooks/useApprovals", () => ({
  useApprovals: vi.fn(),
  useResolveApproval: vi.fn(),
}));

const mockedIncidents = vi.mocked(useIncidents);
const mockedProposals = vi.mocked(useProposals);
const mockedApprovals = vi.mocked(useApprovals);

beforeEach(() => {
  cleanup();
  mockedIncidents.mockReset();
  mockedProposals.mockReset();
  mockedApprovals.mockReset();
  mockedIncidents.mockReturnValue({
    isLoading: false,
    isError: false,
    data: [
      { incidentId: "inc-1", status: "open" },
      { incidentId: "inc-2", status: "investigating" },
      { incidentId: "inc-3", status: "open" },
    ],
  } as never);
  mockedProposals.mockReturnValue({
    isLoading: false,
    isError: false,
    data: [
      { proposalId: "p1", status: "executed" },
      { proposalId: "p2", status: "pending_review" },
      { proposalId: "p3", status: "pending_escalation" },
    ],
  } as never);
  mockedApprovals.mockReturnValue({
    isLoading: false,
    isError: false,
    data: [{ token: "tok-0", status: "pending" }],
  } as never);
});

describe("OverviewPage", () => {
  it("renders counts of open incidents / pending proposals / pending approvals", () => {
    render(<OverviewPage />);
    // 2 open incidents (inc-1, inc-3)
    expect(screen.getByTestId("stat-open-incidents").textContent).toContain("2");
    // 2 pending proposals (pending_review + pending_escalation)
    expect(
      screen.getByTestId("stat-pending-proposals").textContent,
    ).toContain("2");
    // 1 pending approval
    expect(
      screen.getByTestId("stat-pending-approvals").textContent,
    ).toContain("1");
  });
});
