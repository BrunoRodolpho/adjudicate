import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AuditExplorerPage from "./page";
import { useAuditRecords } from "@/hooks/useAuditRecords";
import { useAuditRecord } from "@/hooks/useAuditRecord";

vi.mock("@/hooks/useAuditRecords", () => ({ useAuditRecords: vi.fn() }));
vi.mock("@/hooks/useAuditRecord", () => ({ useAuditRecord: vi.fn() }));

const mockedList = vi.mocked(useAuditRecords);
const mockedDetail = vi.mocked(useAuditRecord);

beforeEach(() => {
  cleanup();
  mockedList.mockReset();
  mockedDetail.mockReset();
  mockedList.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { records: [], verifications: [], chainIntegrity: { checked: 0, breaks: [] } },
    refetch: vi.fn(),
  } as never);
  mockedDetail.mockReturnValue({
    isLoading: false,
    isError: false,
    data: null,
    refetch: vi.fn(),
  } as never);
});

afterEach(() => cleanup());

describe("Adjudicant AuditExplorerPage", () => {
  it("mounts the read-only Audit Explorer surface", () => {
    render(<AuditExplorerPage />);
    expect(screen.getByText(/Audit Explorer · inspector-general/i)).toBeTruthy();
    // The write-isolation framing copy is present (observer, never authorize).
    expect(
      screen.getByText(/cannot\s+authorize, weaken, or replay-mutate/i),
    ).toBeTruthy();
  });
});
