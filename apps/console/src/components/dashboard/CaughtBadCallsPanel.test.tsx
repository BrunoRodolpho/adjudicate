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
  it("sums the REWRITE bucket + out-of-plan catches into one headline", () => {
    mocked.mockReturnValue({
      isError: false,
      data: { total: 3, byReason: { out_of_plan: 3 }, byTool: [] },
    } as never);
    render(<CaughtBadCallsPanel rewriteCount={5} />);
    expect(screen.getByTestId("caught-total").textContent).toBe("8");
    expect(screen.getByTestId("caught-rewrite").textContent).toBe("5");
    expect(screen.getByTestId("caught-out-of-plan").textContent).toBe("3");
  });

  it("treats a catch-store error as 0 out-of-plan (still shows the REWRITE bucket)", () => {
    mocked.mockReturnValue({ isError: true, data: undefined } as never);
    render(<CaughtBadCallsPanel rewriteCount={2} />);
    expect(screen.getByTestId("caught-total").textContent).toBe("2");
    expect(screen.getByTestId("caught-out-of-plan").textContent).toBe("0");
  });

  it("shows 0 when nothing has been caught", () => {
    mocked.mockReturnValue({
      isError: false,
      data: { total: 0, byReason: {}, byTool: [] },
    } as never);
    render(<CaughtBadCallsPanel rewriteCount={0} />);
    expect(screen.getByTestId("caught-total").textContent).toBe("0");
  });
});
