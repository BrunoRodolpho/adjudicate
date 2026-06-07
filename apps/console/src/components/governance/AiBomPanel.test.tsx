import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AiBomPanel } from "./AiBomPanel";
import { useAiBom } from "@/hooks/useAiBom";

vi.mock("@/hooks/useAiBom", () => ({ useAiBom: vi.fn() }));
const mocked = vi.mocked(useAiBom);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

const bom = {
  bomVersion: "1.0",
  packId: "pack-x",
  packVersion: "1.2.3",
  fingerprint: "abcdef0123456789aaaa",
  model: { provider: "anthropic", model: "claude-opus-4" },
  conformance: { passed: true, total: 6, passedCount: 6, failedCount: 0, reportDigest: "x" },
  healthTier: "gold",
  healthScore: { score: 12, maxScore: 12 },
  frameworks: ["eu-ai-act", "nist-ai-rmf"],
};

describe("AiBomPanel", () => {
  it("renders the not-configured empty state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<AiBomPanel />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders the BOM summary + download button", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: bom } as never);
    render(<AiBomPanel />);
    expect(screen.getByText("pack-x@1.2.3")).toBeDefined();
    expect(screen.getByText(/anthropic\/claude-opus-4/i)).toBeDefined();
    expect(screen.getByText(/gold/i)).toBeDefined();
    expect(screen.getByText(/Download JSON/i)).toBeDefined();
  });
});
