import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import type { AuditRecord } from "@adjudicate/core";
import { useLiveTail } from "./useLiveTail";
import { gateway } from "@/lib/gateway/client";

vi.mock("@/lib/gateway/client", () => ({
  gateway: { queryAudit: vi.fn() },
}));
const mockedQuery = vi.mocked(gateway.queryAudit);

/** Minimal AuditRecord — the hook only reads `intentHash`. */
function rec(hash: string): AuditRecord {
  return { intentHash: hash } as unknown as AuditRecord;
}

beforeEach(() => {
  cleanup();
  mockedQuery.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLiveTail", () => {
  it("falls back to polling when the stream endpoint is unavailable (501)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no bus", { status: 501 })),
    );
    mockedQuery.mockResolvedValue({ records: [rec("0xpoll")] } as never);

    const { result, unmount } = renderHook(() => useLiveTail({ enabled: true }));

    await waitFor(() => {
      expect(result.current.transport).toBe("polling");
      expect(result.current.records.map((r) => r.intentHash)).toContain("0xpoll");
    });
    expect(mockedQuery).toHaveBeenCalled();
    unmount();
  });

  it("streams records over SSE when the bus is available", async () => {
    const frame = `data: ${JSON.stringify(rec("0xsse"))}\n\n`;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`: connected\nretry: 3000\n\n`));
        controller.enqueue(new TextEncoder().encode(frame));
        // Intentionally left open — a live SSE connection stays open.
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );

    const { result, unmount } = renderHook(() => useLiveTail({ enabled: true }));

    await waitFor(() => {
      expect(result.current.transport).toBe("sse");
      expect(result.current.records.map((r) => r.intentHash)).toContain("0xsse");
    });
    // SSE path must NOT poll.
    expect(mockedQuery).not.toHaveBeenCalled();
    unmount();
  });

  it("does nothing while disabled (no fetch, no poll)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLiveTail({ enabled: false }));
    expect(result.current.records).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
