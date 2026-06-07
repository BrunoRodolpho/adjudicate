import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BehavioralDriftPanel } from "./BehavioralDriftPanel";
import { useBehavioralDrift } from "@/hooks/useBehavioralDrift";

vi.mock("@/hooks/useBehavioralDrift", () => ({ useBehavioralDrift: vi.fn() }));
const mocked = vi.mocked(useBehavioralDrift);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

const snapshot = {
  schemaVersion: 1,
  baselineWindow: 500,
  recentWindow: 100,
  alertThreshold: 0.25,
  totalObserved: 600,
  dimensions: [
    { dimension: "decision.kind", baseline: { EXECUTE: 500 }, recent: { REFUSE: 100 }, tvd: 1, alerts: [
      { dimension: "decision.kind", signal: "distribution_shift", magnitude: 1, threshold: 0.25, baselineCount: 500, recentCount: 100 },
    ] },
    { dimension: "intent.kind", baseline: { a: 500 }, recent: { a: 100 }, tvd: 0, alerts: [] },
  ],
};

describe("BehavioralDriftPanel", () => {
  it("renders the not-configured empty state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<BehavioralDriftPanel />);
    expect(screen.getByText(/No behavioral-drift detector configured/i)).toBeDefined();
  });

  it("renders per-dimension TVD + alert counts", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: snapshot } as never);
    render(<BehavioralDriftPanel />);
    expect(screen.getByText("decision.kind")).toBeDefined();
    expect(screen.getByText("1.00")).toBeDefined();
    expect(screen.getByText(/600 observed/i)).toBeDefined();
  });
});
