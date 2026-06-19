import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OverviewPage from "./page";
import { useAuditRecords } from "@/hooks/useAuditRecords";
import { useKillSwitchStatus } from "@/hooks/useKillSwitchStatus";

vi.mock("@/hooks/useAuditRecords", () => ({ useAuditRecords: vi.fn() }));
vi.mock("@/hooks/useKillSwitchStatus", () => ({ useKillSwitchStatus: vi.fn() }));

const mockedAudit = vi.mocked(useAuditRecords);
const mockedKillSwitch = vi.mocked(useKillSwitchStatus);

beforeEach(() => {
  cleanup();
  mockedAudit.mockReset();
  mockedKillSwitch.mockReset();
  mockedAudit.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { records: [{ intentHash: "a" }, { intentHash: "b" }, { intentHash: "c" }] },
  } as never);
  mockedKillSwitch.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { status: "NORMAL" },
  } as never);
});

describe("Adjudicant OverviewPage", () => {
  it("renders the recent audit-record count and the read-only kill-switch status", () => {
    render(<OverviewPage />);
    // 3 audit records from the mocked read.
    expect(screen.getByTestId("stat-audit-records").textContent).toContain("3");
    // Kill-switch READ status surfaced (read-only — never a toggle).
    expect(screen.getByTestId("stat-kill-switch").textContent).toContain("NORMAL");
  });

  it("shows the write-isolation framing copy (observer plane, never authorize/weaken)", () => {
    render(<OverviewPage />);
    expect(
      screen.getByText(/cannot authorize, weaken, or replay-mutate/i),
    ).toBeTruthy();
  });
});
