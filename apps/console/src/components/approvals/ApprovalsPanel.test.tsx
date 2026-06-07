import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { useApprovals, useResolveApproval } from "@/hooks/useApprovals";

vi.mock("@/hooks/useApprovals", () => ({
  useApprovals: vi.fn(),
  useResolveApproval: vi.fn(),
}));
const mockedList = vi.mocked(useApprovals);
const mockedResolve = vi.mocked(useResolveApproval);

beforeEach(() => {
  cleanup();
  mockedList.mockReset();
  mockedResolve.mockReset();
  mockedResolve.mockReturnValue({ mutate: vi.fn() } as never);
});

const pending = {
  token: "t1",
  sessionId: "s1",
  intentHash: "0x1",
  intentKind: "deployment.rollback.execute",
  prompt: "Confirm rollback?",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "pending",
  requestedAt: "2026-06-06T12:00:00.000Z",
};

describe("ApprovalsPanel", () => {
  it("renders the not-configured empty state on error", () => {
    mockedList.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<ApprovalsPanel />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders a pending approval with approve/decline buttons", () => {
    mockedList.mockReturnValue({ isLoading: false, isError: false, data: [pending] } as never);
    render(<ApprovalsPanel />);
    expect(screen.getByText("Confirm rollback?")).toBeDefined();
    expect(screen.getByText("Approve")).toBeDefined();
    expect(screen.getByText("Decline")).toBeDefined();
  });

  it("shows the display-only reference banner (not the real authorization gate)", () => {
    mockedList.mockReturnValue({ isLoading: false, isError: false, data: [pending] } as never);
    render(<ApprovalsPanel />);
    const note = screen.getByTestId("approvals-display-only-note");
    expect(note.textContent).toMatch(/reference projection/i);
    expect(note.textContent).toMatch(/confirm\(\)/i);
  });

  it("approve fires the resolve mutation with accepted:true", () => {
    const mutate = vi.fn();
    mockedResolve.mockReturnValue({ mutate } as never);
    mockedList.mockReturnValue({ isLoading: false, isError: false, data: [pending] } as never);
    render(<ApprovalsPanel />);
    fireEvent.click(screen.getByText("Approve"));
    expect(mutate).toHaveBeenCalledWith({ token: "t1", accepted: true });
  });
});
