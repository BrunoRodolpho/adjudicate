import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SessionMemoryPanel } from "./SessionMemoryPanel";
import { useSessionMemory } from "@/hooks/useSessionMemory";

vi.mock("@/hooks/useSessionMemory", () => ({ useSessionMemory: vi.fn() }));
const mocked = vi.mocked(useSessionMemory);

beforeEach(() => {
  cleanup();
  mocked.mockReset();
});

describe("SessionMemoryPanel", () => {
  it("renders not-configured on error", () => {
    mocked.mockReturnValue({ isLoading: false, isError: true, data: undefined } as never);
    render(<SessionMemoryPanel sessionId="s1" />);
    expect(screen.getByText(/not configured/i)).toBeDefined();
  });

  it("renders an absent-memory state", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: { sessionId: "s1", present: false, memory: null, retrievedAt: "x" } } as never);
    render(<SessionMemoryPanel sessionId="s1" />);
    expect(screen.getByText(/No memory for session s1/i)).toBeDefined();
  });

  it("renders the memory JSON when present", () => {
    mocked.mockReturnValue({ isLoading: false, isError: false, data: { sessionId: "s1", present: true, memory: { region: "us-west-1" }, retrievedAt: "x" } } as never);
    render(<SessionMemoryPanel sessionId="s1" />);
    expect(screen.getByText(/us-west-1/)).toBeDefined();
  });
});
