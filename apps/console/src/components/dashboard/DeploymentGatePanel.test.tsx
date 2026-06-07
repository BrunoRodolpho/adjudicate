import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeploymentGatePanel } from "./DeploymentGatePanel";
import { useAuditQuery } from "@/hooks/useAuditQuery";

vi.mock("@/hooks/useAuditQuery", () => ({ useAuditQuery: vi.fn() }));
const mocked = vi.mocked(useAuditQuery);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

function rec(kind: string, decisionKind: string) {
  return { envelope: { kind }, decision: { kind: decisionKind } };
}

describe("DeploymentGatePanel", () => {
  it("renders gate rows", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: { records: [] } } as never);
    render(<DeploymentGatePanel />);
    expect(screen.getByText(/Carbon-budget region rewrites/i)).toBeDefined();
  });

  it("counts deployment gate outcomes, ignoring non-deployment records", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        records: [
          rec("deployment.approval.request", "ESCALATE"),
          rec("deployment.approval.request", "REWRITE"),
          rec("deployment.approval.request", "REWRITE"),
          rec("pix.charge.refund", "REWRITE"), // ignored
        ],
      },
    } as never);
    render(<DeploymentGatePanel />);
    // 2 carbon rewrites rendered.
    expect(screen.getByText("2")).toBeDefined();
  });
});
