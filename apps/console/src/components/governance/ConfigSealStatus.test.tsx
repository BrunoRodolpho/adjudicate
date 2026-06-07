import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ConfigSealStatus } from "./ConfigSealStatus";
import { useConfigSealStatus } from "@/hooks/useConfigSealStatus";

vi.mock("@/hooks/useConfigSealStatus", () => ({ useConfigSealStatus: vi.fn() }));
const mocked = vi.mocked(useConfigSealStatus);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

describe("ConfigSealStatus", () => {
  it("renders the not-configured empty state on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<ConfigSealStatus />);
    expect(screen.getByText(/No config seal configured/i)).toBeDefined();
  });

  it("renders the sealed state when verified", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        verified: true,
        digestMatch: "match",
        computedDigest: "abcdef0123456789aaaa",
        expectedDigest: "abcdef0123456789aaaa",
        signatureVerification: { verified: null, reason: "not_required" },
        errors: [],
      },
    } as never);
    render(<ConfigSealStatus />);
    expect(screen.getByText(/config matches/i)).toBeDefined();
  });

  it("renders drift + errors when verification fails", () => {
    mocked.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        verified: false,
        digestMatch: "mismatch",
        computedDigest: "1111111111111111aaaa",
        expectedDigest: "2222222222222222bbbb",
        signatureVerification: { verified: null, reason: "not_required" },
        errors: ["config digest mismatch: expected 2222…, got 1111…"],
      },
    } as never);
    render(<ConfigSealStatus />);
    expect(screen.getByText(/Config drift detected/i)).toBeDefined();
    expect(screen.getByText(/expected 2222…, got 1111…/i)).toBeDefined();
  });
});
