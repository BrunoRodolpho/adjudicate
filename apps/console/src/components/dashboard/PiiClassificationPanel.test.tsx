import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PiiClassificationPanel } from "./PiiClassificationPanel";
import { usePiiClassification } from "@/hooks/usePiiClassification";

vi.mock("@/hooks/usePiiClassification", () => ({
  usePiiClassification: vi.fn(),
}));

const mocked = vi.mocked(usePiiClassification);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

describe("PiiClassificationPanel", () => {
  it("renders the loading state", () => {
    mocked.mockReturnValue({ isLoading: true, isError: false, data: undefined } as never);
    render(<PiiClassificationPanel since="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText(/Loading PII stats/i)).toBeDefined();
  });

  it("renders an empty state when there are no detections", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: { buckets: [] } } as never);
    render(<PiiClassificationPanel since="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText(/No PII detections/i)).toBeDefined();
  });

  it("renders redacted/blocked counts bucketed by sensitivity tier", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        buckets: [
          { sensitivityLevel: "critical", disposition: "blocked", count: 3 },
          { sensitivityLevel: "high", disposition: "redacted", count: 7 },
        ],
      },
    } as never);
    render(<PiiClassificationPanel since="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    // Both tier rows render.
    expect(screen.getByText(/critical/i)).toBeDefined();
    expect(screen.getByText(/high/i)).toBeDefined();
  });

  it("renders the unavailable state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<PiiClassificationPanel since="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});
