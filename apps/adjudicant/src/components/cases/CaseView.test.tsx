import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CaseView } from "./CaseView";
import type { CorrelatedCase } from "@/lib/case-correlation";

afterEach(() => cleanup());

const member = (opts: {
  intentHash: string;
  reason: CorrelatedCase["members"][number]["reason"];
  decision: string;
  kind?: string;
  verified?: boolean;
  supersedesReason?: string;
}) =>
  ({
    record: {
      intentHash: opts.intentHash,
      at: "2026-06-19T00:00:00.000Z",
      decision: { kind: opts.decision },
      envelope: { kind: opts.kind ?? "test.k" },
      ...(opts.supersedesReason
        ? {
            supersedes: {
              predecessorIntentHash: "p".repeat(64),
              reason: opts.supersedesReason,
            },
          }
        : {}),
    },
    verification:
      opts.verified === undefined
        ? undefined
        : opts.verified
          ? { verified: true }
          : { verified: false, reason: "tampered", derived: "x", stored: "y" },
    reason: opts.reason,
  }) as unknown as CorrelatedCase["members"][number];

describe("CaseView — read-only correlated case timeline (113)", () => {
  it("renders one timeline row per case member with its decision kind", () => {
    const caseData: CorrelatedCase = {
      seedIntentHash: "a".repeat(64),
      sessionId: "s1",
      seedFound: true,
      members: [
        member({ intentHash: "a".repeat(64), reason: "seed", decision: "REFUSE" }),
        member({
          intentHash: "b".repeat(64),
          reason: "same_session",
          decision: "EXECUTE",
        }),
      ],
    };
    render(<CaseView caseData={caseData} />);
    const rows = screen.getAllByTestId("case-member");
    expect(rows).toHaveLength(2);
    const kinds = screen
      .getAllByTestId("case-decision-kind")
      .map((e) => e.textContent);
    expect(kinds).toContain("REFUSE");
    expect(kinds).toContain("EXECUTE");
  });

  it("shows the correlated session id and member count", () => {
    const caseData: CorrelatedCase = {
      seedIntentHash: "a".repeat(64),
      sessionId: "sess-42",
      seedFound: true,
      members: [member({ intentHash: "a".repeat(64), reason: "seed", decision: "REFUSE" })],
    };
    render(<CaseView caseData={caseData} />);
    expect(screen.getByTestId("case-session").textContent).toBe("sess-42");
    expect(screen.getByTestId("case-member-count").textContent).toMatch(/1 record/);
  });

  it("tags each member with its correlation reason", () => {
    const caseData: CorrelatedCase = {
      seedIntentHash: "a".repeat(64),
      sessionId: "s1",
      seedFound: true,
      members: [
        member({ intentHash: "a".repeat(64), reason: "seed", decision: "REFUSE" }),
        member({
          intentHash: "d".repeat(64),
          reason: "lineage_predecessor",
          decision: "REQUEST_CONFIRMATION",
        }),
      ],
    };
    render(<CaseView caseData={caseData} />);
    const reasons = screen
      .getAllByTestId("case-link-reason")
      .map((e) => e.textContent);
    expect(reasons).toContain("seed");
    expect(reasons).toContain("predecessor");
  });

  it("renders a DENY-BY-DEFAULT tamper badge for a tampered member", () => {
    const caseData: CorrelatedCase = {
      seedIntentHash: "a".repeat(64),
      sessionId: "s1",
      seedFound: true,
      members: [
        member({
          intentHash: "a".repeat(64),
          reason: "seed",
          decision: "EXECUTE",
          verified: false,
        }),
      ],
    };
    render(<CaseView caseData={caseData} />);
    const badge = screen.getByTestId("integrity-badge");
    expect(badge.getAttribute("data-verdict")).toBe("tampered");
  });

  it("renders the seed-not-found empty state when the seed is missing", () => {
    const caseData: CorrelatedCase = {
      seedIntentHash: "a".repeat(64),
      sessionId: undefined,
      seedFound: false,
      members: [],
    };
    render(<CaseView caseData={caseData} />);
    expect(screen.getByText(/No case found/i)).toBeTruthy();
    expect(screen.queryByTestId("case-timeline")).toBeNull();
  });
});
