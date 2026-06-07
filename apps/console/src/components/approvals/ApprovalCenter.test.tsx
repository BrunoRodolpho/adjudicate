import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { ApprovalHistoryView } from "./ApprovalHistoryView";
import { ApprovalChainView } from "./ApprovalChainView";
import {
  useApprovals,
  useResolveApproval,
  useApprovalHistory,
  useApprovalChain,
} from "@/hooks/useApprovals";

vi.mock("@/hooks/useApprovals", () => ({
  useApprovals: vi.fn(),
  useResolveApproval: vi.fn(),
  useApprovalHistory: vi.fn(),
  useApprovalChain: vi.fn(),
}));
// next/link renders an <a> — stub to a plain anchor for the test renderer.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockedList = vi.mocked(useApprovals);
const mockedResolve = vi.mocked(useResolveApproval);
const mockedHistory = vi.mocked(useApprovalHistory);
const mockedChain = vi.mocked(useApprovalChain);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
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

const historyEntry = {
  token: "tr1",
  sessionId: "s1",
  intentHash: "abcdef1234567890",
  intentKind: "deployment.rollback.execute",
  status: "approved" as const,
  requestedAt: "2026-06-06T11:55:00.000Z",
  resolvedAt: "2026-06-06T12:05:00.026Z",
  resolvedBy: { id: "operator@example.com", displayName: "Demo Operator" },
};

const chainSteps = [
  {
    kind: "requested" as const,
    at: "2026-06-06T11:55:00.000Z",
    intentHash: "parkedhash",
    tokenPresent: true,
    status: "pending" as const,
  },
  {
    kind: "resolved" as const,
    at: "2026-06-06T12:05:00.026Z",
    intentHash: "abcdef1234567890",
    tokenPresent: true,
    status: "approved" as const,
    actor: { id: "operator@example.com", displayName: "Demo Operator" },
  },
  {
    kind: "resumed" as const,
    at: "2026-06-06T12:05:00.026Z",
    intentHash: "abcdef1234567890",
    supersedesReason: "confirmation_resolved" as const,
    tokenPresent: true,
    status: "approved" as const,
  },
];

describe("ApprovalsPanel — honest banner retained", () => {
  it("renders the display-only reference banner (not the real authorization gate)", () => {
    mockedList.mockReturnValue({ isLoading: false, isError: false, data: [pending] } as never);
    render(<ApprovalsPanel />);
    const note = screen.getByTestId("approvals-display-only-note");
    expect(note.textContent).toMatch(/reference projection/i);
    expect(note.textContent).toMatch(/confirm\(\)/i);
  });
});

describe("ApprovalHistoryView (ADR-136)", () => {
  it("renders the not-configured state on error", () => {
    mockedHistory.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<ApprovalHistoryView />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders the empty state when there are no resolved approvals", () => {
    mockedHistory.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { entries: [] },
    } as never);
    render(<ApprovalHistoryView />);
    expect(screen.getByText(/history populates after the first resolve/i)).toBeDefined();
  });

  it("renders the loading state", () => {
    mockedHistory.mockReturnValue({ isLoading: true, isError: false, data: undefined } as never);
    render(<ApprovalHistoryView />);
    expect(screen.getByText(/loading decision history/i)).toBeDefined();
  });

  it("renders a resolved row and labels the actor as CLAIMED", () => {
    mockedHistory.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { entries: [historyEntry] },
    } as never);
    render(<ApprovalHistoryView />);
    expect(screen.getByText("deployment.rollback.execute")).toBeDefined();
    expect(screen.getByText("Demo Operator")).toBeDefined();
    // "claimed" labeling must be present so an operator never mistakes the
    // forgeable-header attribution for a verified identity.
    expect(screen.getAllByText(/claimed/i).length).toBeGreaterThan(0);
  });

  it("selecting a row raises the chosen intentHash", () => {
    const onSelect = vi.fn();
    mockedHistory.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { entries: [historyEntry] },
    } as never);
    render(<ApprovalHistoryView onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("approval-history-row"));
    expect(onSelect).toHaveBeenCalledWith("abcdef1234567890");
  });
});

describe("ApprovalChainView (ADR-136)", () => {
  it("prompts to select a row when no intentHash is given", () => {
    mockedChain.mockReturnValue({ isLoading: false, isError: false, data: undefined } as never);
    render(<ApprovalChainView />);
    expect(screen.getByText(/select a resolved approval/i)).toBeDefined();
  });

  it("renders the 3-step request → resolved → resumed lineage", () => {
    mockedChain.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { steps: chainSteps },
    } as never);
    render(<ApprovalChainView intentHash="abcdef1234567890" />);
    const steps = screen.getAllByTestId("approval-chain-step");
    expect(steps).toHaveLength(3);
    expect(screen.getByText(/confirmation requested/i)).toBeDefined();
    expect(screen.getByText(/operator resolved/i)).toBeDefined();
    expect(screen.getByText(/kernel re-adjudicated/i)).toBeDefined();
    expect(screen.getByText("confirmation_resolved")).toBeDefined();
  });

  it("surfaces token PRESENCE via a labeled lock — never the token value", () => {
    mockedChain.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { steps: chainSteps },
    } as never);
    const { container } = render(<ApprovalChainView intentHash="abcdef1234567890" />);
    expect(screen.getAllByLabelText(/confirmation token present/i).length).toBe(3);
    // No raw token value anywhere in the rendered DOM.
    expect(container.innerHTML).not.toMatch(/demo-approval-token|demo-resolved-token/);
  });

  it("deep-links each ledger-backed step to Decision Detail", () => {
    mockedChain.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { steps: chainSteps },
    } as never);
    render(<ApprovalChainView intentHash="abcdef1234567890" />);
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/decisions/abcdef1234567890")).toBe(true);
  });

  it("renders the empty state when the chain has no steps", () => {
    mockedChain.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { steps: [] },
    } as never);
    render(<ApprovalChainView intentHash="abcdef1234567890" />);
    expect(screen.getByText(/never resolved through the kernel/i)).toBeDefined();
  });
});
