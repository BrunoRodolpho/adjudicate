import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PolicyCoherencePanel } from "./PolicyCoherencePanel";
import { usePolicyCoherence } from "@/hooks/usePolicyCoherence";

vi.mock("@/hooks/usePolicyCoherence", () => ({ usePolicyCoherence: vi.fn() }));
const mocked = vi.mocked(usePolicyCoherence);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

const report = (diagnostics: unknown[]) => ({
  isLoading: false,
  isError: false,
  data: { packId: "p", diagnostics, summary: { error: 0, warning: 0, note: 0 }, passed: true, analyzedAt: "x" },
});

describe("PolicyCoherencePanel", () => {
  it("renders not-configured on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<PolicyCoherencePanel />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders the clean state when no diagnostics", () => {
    mocked.mockReturnValue(report([]) as never);
    render(<PolicyCoherencePanel />);
    expect(screen.getByText(/No coherence issues/i)).toBeDefined();
  });

  it("renders AJD-301 diagnostics with severity + rule", () => {
    mocked.mockReturnValue(
      report([
        { code: "AJD-301", severity: "warning", message: "Intent x.never is never offered.", detail: { rule: "unreachable_intent" } },
      ]) as never,
    );
    render(<PolicyCoherencePanel />);
    expect(screen.getByText(/unreachable_intent/i)).toBeDefined();
    expect(screen.getByText(/never offered/i)).toBeDefined();
  });
});
