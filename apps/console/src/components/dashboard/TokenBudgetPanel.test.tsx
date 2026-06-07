import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TokenBudgetPanel } from "./TokenBudgetPanel";
import { useTokenBudget } from "@/hooks/useTokenBudget";

vi.mock("@/hooks/useTokenBudget", () => ({ useTokenBudget: vi.fn() }));
const mocked = vi.mocked(useTokenBudget);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

describe("TokenBudgetPanel", () => {
  it("renders the not-configured empty state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<TokenBudgetPanel />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders session rows with consumed/budget/remaining", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        totalConsumed: 60_000,
        sessions: [
          { sessionId: "sess-a", consumed: 10_000, budget: 50_000, remaining: 40_000 },
          { sessionId: "sess-b", consumed: 52_000, budget: 50_000, remaining: -2_000 },
        ],
      },
    } as never);
    render(<TokenBudgetPanel />);
    expect(screen.getByText("sess-a")).toBeDefined();
    expect(screen.getByText("sess-b")).toBeDefined();
    expect(screen.getByText("-2,000")).toBeDefined();
  });
});
