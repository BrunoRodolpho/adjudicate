import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LiveTailAnnouncer } from "./LiveTailAnnouncer";
import { useLiveTailContext } from "./LiveTailContext";

vi.mock("./LiveTailContext", () => ({ useLiveTailContext: vi.fn() }));
const mockedCtx = vi.mocked(useLiveTailContext);

function ctx(over: Partial<ReturnType<typeof useLiveTailContext>>) {
  return {
    enabled: true,
    setEnabled: () => {},
    isPaused: false,
    togglePause: () => {},
    lastUpdate: null,
    records: [],
    newHashes: new Set<string>(),
    transport: "connecting" as const,
    ...over,
  } as ReturnType<typeof useLiveTailContext>;
}

beforeEach(() => {
  cleanup();
  mockedCtx.mockReset();
});

describe("LiveTailAnnouncer", () => {
  it("announces freshly-arrived records (pluralized)", () => {
    mockedCtx.mockReturnValue(ctx({ newHashes: new Set(["a", "b"]) }));
    render(<LiveTailAnnouncer />);
    expect(screen.getByText(/2 new audit records\./i)).toBeDefined();
  });

  it("announces a single record in the singular", () => {
    mockedCtx.mockReturnValue(ctx({ newHashes: new Set(["only"]) }));
    render(<LiveTailAnnouncer />);
    expect(screen.getByText(/1 new audit record\./i)).toBeDefined();
  });

  it("announces a transport change to the real-time stream", () => {
    mockedCtx.mockReturnValue(ctx({ transport: "polling" }));
    const { rerender } = render(<LiveTailAnnouncer />);
    // Switching transports announces the new mode.
    mockedCtx.mockReturnValue(ctx({ transport: "sse" }));
    rerender(<LiveTailAnnouncer />);
    expect(screen.getByText(/real-time stream/i)).toBeDefined();
  });

  it("stays silent while the tail is disabled", () => {
    mockedCtx.mockReturnValue(ctx({ enabled: false, newHashes: new Set(["a"]) }));
    render(<LiveTailAnnouncer />);
    expect(screen.queryByText(/new audit/i)).toBeNull();
  });
});
