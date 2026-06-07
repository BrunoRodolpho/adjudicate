import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedTeamPanel } from "./RedTeamPanel";
import { useRedTeam } from "@/hooks/useRedTeam";

vi.mock("@/hooks/useRedTeam", () => ({ useRedTeam: vi.fn() }));
const mocked = vi.mocked(useRedTeam);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

const report = {
  pack: { id: "pack-x" },
  results: [],
  summary: {
    total: 9,
    defended: 9,
    escaped: 0,
    errors: 0,
    escapesByVector: { prompt_injection: 0, taint_escalation: 0, tool_scope_violation: 0 },
  },
};

describe("RedTeamPanel", () => {
  it("renders the not-configured empty state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<RedTeamPanel />);
    expect(screen.getByText(/No red-team report configured/i)).toBeDefined();
  });

  it("renders the defended summary and per-vector table", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: report } as never);
    render(<RedTeamPanel />);
    expect(screen.getByText(/9 defended/i)).toBeDefined();
    expect(screen.getByText(/Prompt Injection/i)).toBeDefined();
  });

  it("highlights escapes when present", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...report,
        summary: {
          ...report.summary,
          defended: 8,
          escaped: 1,
          escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
        },
      },
    } as never);
    render(<RedTeamPanel />);
    expect(screen.getByText(/1 escaped/i)).toBeDefined();
  });
});
