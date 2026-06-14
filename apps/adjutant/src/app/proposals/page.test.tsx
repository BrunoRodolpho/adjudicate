import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProposalsPage from "./page";
import { useProposals } from "@/hooks/useProposals";

vi.mock("@/hooks/useProposals", () => ({
  useProposals: vi.fn(),
}));

const mockedProposals = vi.mocked(useProposals);

const ready = {
  isLoading: false,
  isError: false,
  data: [
    {
      proposalId: "sig-inc1-safe",
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 50,
      disposition: "SAFE",
      status: "executed",
      intentHash: "0xabc",
      createdAt: "2026-06-12T09:00:00.000Z",
      updatedAt: "2026-06-12T09:00:00.000Z",
    },
    {
      proposalId: "sig-inc3-review",
      incidentId: "inc-3",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      status: "pending_review",
      approvalToken: "tok-0",
      intentHash: "0xdef",
      createdAt: "2026-06-12T09:10:00.000Z",
      updatedAt: "2026-06-12T09:10:00.000Z",
    },
  ],
} as never;

beforeEach(() => {
  cleanup();
  mockedProposals.mockReset();
  mockedProposals.mockReturnValue(ready);
});

describe("ProposalsPage", () => {
  it("renders proposal rows with action, blastRadius, disposition, status", () => {
    render(<ProposalsPage />);
    const executed = screen.getByTestId("proposal-row-sig-inc1-safe");
    expect(executed.textContent).toContain("inc-1");
    expect(executed.textContent).toContain("rollback");
    expect(executed.textContent).toContain("50");
    expect(executed.textContent).toContain("SAFE");
    expect(executed.textContent).toContain("executed");

    const review = screen.getByTestId("proposal-row-sig-inc3-review");
    expect(review.textContent).toContain("patch");
    expect(review.textContent).toContain("12");
    expect(review.textContent).toContain("REVIEW");
    expect(review.textContent).toContain("pending review");
  });

  it("renders the loading state", () => {
    mockedProposals.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as never);
    render(<ProposalsPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the empty state when no proposals", () => {
    mockedProposals.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    render(<ProposalsPage />);
    expect(
      screen.getAllByText(/No remediation proposals recorded/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the error state when the port is unwired", () => {
    mockedProposals.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    } as never);
    render(<ProposalsPage />);
    expect(screen.getByText(/Proposals port not configured/i)).toBeDefined();
  });
});
