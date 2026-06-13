import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CaughtBadCallsPanel } from "./CaughtBadCallsPanel";
import { useCatches } from "@/hooks/useCatches";

vi.mock("@/hooks/useCatches", () => ({ useCatches: vi.fn() }));
const mocked = vi.mocked(useCatches);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

describe("CaughtBadCallsPanel", () => {
  it("shows the two catch sources as separate, window-scoped figures (not summed)", () => {
    mocked.mockReturnValue({
      isError: false,
      data: { total: 3, byReason: { out_of_plan: 3 }, byTool: [] },
    } as never);
    render(<CaughtBadCallsPanel rewriteCount={5} />);
    // No combined total across windows.
    expect(screen.queryByTestId("caught-total")).toBeNull();
    expect(screen.getByTestId("caught-rewrite").textContent).toBe("5");
    expect(screen.getByTestId("caught-out-of-plan").textContent).toBe("3");
  });

  it("treats a catch-store error as 0 out-of-plan (still shows the REWRITE figure)", () => {
    mocked.mockReturnValue({ isError: true, data: undefined } as never);
    render(<CaughtBadCallsPanel rewriteCount={2} />);
    expect(screen.getByTestId("caught-rewrite").textContent).toBe("2");
    expect(screen.getByTestId("caught-out-of-plan").textContent).toBe("0");
  });

  it("shows 0 when nothing has been caught", () => {
    mocked.mockReturnValue({
      isError: false,
      data: { total: 0, byReason: {}, byTool: [] },
    } as never);
    render(<CaughtBadCallsPanel rewriteCount={0} />);
    expect(screen.getByTestId("caught-out-of-plan").textContent).toBe("0");
    expect(screen.getByTestId("caught-rewrite").textContent).toBe("0");
  });
});
