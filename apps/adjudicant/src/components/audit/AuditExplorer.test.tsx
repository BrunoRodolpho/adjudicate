import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AuditExplorer } from "./AuditExplorer";
import { useAuditRecords } from "@/hooks/useAuditRecords";
import { useAuditRecord } from "@/hooks/useAuditRecord";

vi.mock("@/hooks/useAuditRecords", () => ({ useAuditRecords: vi.fn() }));
vi.mock("@/hooks/useAuditRecord", () => ({ useAuditRecord: vi.fn() }));

const mockedList = vi.mocked(useAuditRecords);
const mockedDetail = vi.mocked(useAuditRecord);

const row = (intentHash: string, kind: string) => ({
  intentHash,
  at: "2026-06-19T00:00:00.000Z",
  envelope: { kind: "test.k" },
  decision: { kind },
});

beforeEach(() => {
  cleanup();
  mockedList.mockReset();
  mockedDetail.mockReset();
  mockedList.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      records: [row("a".repeat(64), "EXECUTE"), row("b".repeat(64), "REFUSE")],
      verifications: [
        { verified: true },
        { verified: false, reason: "tampered", derived: "x", stored: "y" },
      ],
      chainIntegrity: { checked: 1, breaks: [] },
    },
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

describe("AuditExplorer — read-only browse + integrity (112)", () => {
  it("renders one row per audit record with its decision kind", () => {
    render(<AuditExplorer />);
    const rows = screen.getAllByTestId("audit-record-row");
    expect(rows).toHaveLength(2);
    const kinds = screen.getAllByTestId("decision-kind").map((e) => e.textContent);
    expect(kinds).toContain("EXECUTE");
    expect(kinds).toContain("REFUSE");
  });

  it("surfaces a per-row integrity badge index-aligned with verifications", () => {
    render(<AuditExplorer />);
    const badges = screen.getAllByTestId("integrity-badge");
    // Two list rows → two badges (the by-hash detail is not shown yet).
    expect(badges).toHaveLength(2);
    expect(badges[0]!.getAttribute("data-verdict")).toBe("verified");
    // The tampered record renders a tamper badge — never as authoritative.
    expect(badges[1]!.getAttribute("data-verdict")).toBe("tampered");
  });

  it("renders the chain-verify status (intact)", () => {
    render(<AuditExplorer />);
    expect(screen.getByTestId("chain-status").getAttribute("data-state")).toBe(
      "intact",
    );
  });

  it("filters by a six-outcome decision kind via the SDK query (no extra kind)", () => {
    render(<AuditExplorer />);
    fireEvent.change(screen.getByTestId("decision-filter"), {
      target: { value: "REFUSE" },
    });
    // The hook is re-invoked with the decisionKind filter threaded through.
    const lastCall = mockedList.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ decisionKind: "REFUSE" });
  });

  it("does NOT fire a by-hash lookup until a hash is submitted (enabled-gated)", () => {
    render(<AuditExplorer />);
    // Initial render: the detail hook is called with the empty hash (disabled).
    expect(mockedDetail).toHaveBeenCalledWith("");
  });

  it("inspects a record by hash and shows its integrity verdict", () => {
    mockedDetail.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        record: row("c".repeat(64), "ESCALATE"),
        verification: { verified: false, reason: "tampered", derived: "x", stored: "y" },
      },
      refetch: vi.fn(),
    } as never);
    render(<AuditExplorer />);
    fireEvent.change(screen.getByTestId("byhash-input"), {
      target: { value: "c".repeat(64) },
    });
    fireEvent.click(screen.getByTestId("byhash-submit"));
    const result = screen.getByTestId("byhash-result");
    expect(result.textContent).toContain("ESCALATE");
    // The by-hash result carries an integrity badge inside it (tampered).
    const badgeInResult = result.querySelector('[data-testid="integrity-badge"]');
    expect(badgeInResult?.getAttribute("data-verdict")).toBe("tampered");
  });
});
