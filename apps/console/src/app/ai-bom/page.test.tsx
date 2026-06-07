import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import AiBomExplorerPage from "./page";
import { useAiBomById, useAiBomList } from "@/hooks/useAiBomExplorer";

vi.mock("@/hooks/useAiBomExplorer", () => ({
  useAiBomList: vi.fn(),
  useAiBomById: vi.fn(),
}));

const mockedList = vi.mocked(useAiBomList);
const mockedById = vi.mocked(useAiBomById);

const summaryPix = {
  packId: "pack-pix",
  packVersion: "1.0.0",
  bomVersion: "1.0",
  healthTier: "gold",
  healthScore: { score: 6, maxScore: 6 },
  conformance: { passed: true, passedCount: 4, total: 4 },
  fingerprint: "f".repeat(64),
  bomDigest: "c".repeat(64),
  frameworks: ["eu-ai-act"],
  generatedAt: "2026-06-06T00:00:00.000Z",
  signed: false,
};

const summaryKyc = {
  ...summaryPix,
  packId: "pack-kyc",
  packVersion: "2.1.0",
  healthTier: "silver",
  signed: true,
  bomDigest: "d".repeat(64),
};

const fullPix = {
  bomVersion: "1.0",
  packId: "pack-pix",
  packVersion: "1.0.0",
  contract: "v0",
  kernelMinVersion: ">=1 <2",
  fingerprint: "f".repeat(64),
  model: { provider: "anthropic", model: "claude-sonnet" },
  intents: ["pix.charge.create"],
  signals: ["amount_centavos"],
  basisCodes: ["pix.limit.exceeded"],
  tools: [{ name: "pix.charge.create", description: "Create a charge" }],
  rag: [{ name: "kb-pix", kind: "vector" }],
  promptHashes: [{ id: "system", sha256: "a".repeat(64) }],
  guardrails: [{ basisCode: "pix.limit.exceeded", category: "pix" }],
  conformance: {
    passed: true,
    total: 4,
    passedCount: 4,
    failedCount: 0,
    reportDigest: "b".repeat(64),
  },
  healthTier: "gold",
  healthScore: { score: 6, maxScore: 6 },
  frameworks: ["eu-ai-act", "nist-ai-rmf"],
  bomDigest: "c".repeat(64),
  generatedAt: "2026-06-06T00:00:00.000Z",
};

beforeEach(() => {
  cleanup();
  mockedList.mockReset();
  mockedById.mockReset();
  mockedList.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { boms: [summaryPix, summaryKyc] },
    refetch: vi.fn(),
  } as never);
  mockedById.mockReturnValue({
    isLoading: false,
    isError: false,
    data: fullPix,
    refetch: vi.fn(),
  } as never);
});

describe("AiBomExplorerPage", () => {
  it("renders the rail with one option per pack", () => {
    render(<AiBomExplorerPage />);
    const rail = screen.getByTestId("aibom-rail");
    expect(rail).toBeDefined();
    expect(within(rail).getByText("pack-pix")).toBeDefined();
    expect(within(rail).getByText("pack-kyc")).toBeDefined();
    expect(within(rail).getAllByRole("option")).toHaveLength(2);
  });

  it("shows the signed/unsigned badge per pack", () => {
    render(<AiBomExplorerPage />);
    const rail = screen.getByTestId("aibom-rail");
    expect(within(rail).getByText("unsigned")).toBeDefined();
    expect(within(rail).getByText("signed")).toBeDefined();
  });

  it("renders detail fields for the selected pack", () => {
    render(<AiBomExplorerPage />);
    const detail = screen.getByTestId("aibom-detail");
    expect(detail).toBeDefined();
    // Model.
    expect(screen.getByText("anthropic/claude-sonnet")).toBeDefined();
    // Tool name + rag store + prompt id surfaced.
    expect(screen.getByText("Create a charge")).toBeDefined();
    expect(screen.getByText("kb-pix")).toBeDefined();
    expect(screen.getByText("system")).toBeDefined();
    // Full fingerprint surfaced (not truncated) in the detail header.
    expect(screen.getByTestId("field-code-fingerprint").textContent).toBe(
      "f".repeat(64),
    );
  });

  it("selecting a rail row queries that pack by id", () => {
    render(<AiBomExplorerPage />);
    const rail = screen.getByTestId("aibom-rail");
    fireEvent.click(within(rail).getByText("pack-kyc"));
    // The last call to useAiBomById should target the selected pack.
    const lastCall = mockedById.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("pack-kyc");
  });

  it("renders the empty state when no BOMs are wired", () => {
    mockedList.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { boms: [] },
      refetch: vi.fn(),
    } as never);
    render(<AiBomExplorerPage />);
    expect(screen.getByText(/AI-BOM not configured/i)).toBeDefined();
  });

  it("renders the loading state for the rail", () => {
    mockedList.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never);
    render(<AiBomExplorerPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders per-section 'None declared' when arrays are empty", () => {
    mockedById.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...fullPix,
        model: undefined,
        tools: [],
        rag: [],
        promptHashes: [],
        guardrails: [],
      },
      refetch: vi.fn(),
    } as never);
    render(<AiBomExplorerPage />);
    expect(screen.getByText(/No declared prompt templates/i)).toBeDefined();
    // Model "Not declared" + at least one "None declared" section present.
    expect(screen.getByText(/Not declared/i)).toBeDefined();
    expect(screen.getAllByText(/None declared/i).length).toBeGreaterThan(0);
  });
});
