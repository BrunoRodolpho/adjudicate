import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import GovernancePage from "./page";
import {
  useGuardFireStats,
  useKillSwitchTimeline,
  useOutcomeDistribution,
  usePolicyDescriptor,
} from "@/hooks/useGovernance";

vi.mock("@/hooks/useGovernance", () => ({
  usePolicyDescriptor: vi.fn(),
  useGuardFireStats: vi.fn(),
  useOutcomeDistribution: vi.fn(),
  useKillSwitchTimeline: vi.fn(),
}));

const mockedPolicy = vi.mocked(usePolicyDescriptor);
const mockedGuards = vi.mocked(useGuardFireStats);
const mockedOutcomes = vi.mocked(useOutcomeDistribution);
const mockedTimeline = vi.mocked(useKillSwitchTimeline);

const ok = (data: unknown) =>
  ({ isLoading: false, isError: false, data, refetch: vi.fn() }) as never;
const featureDetected = () =>
  ({
    isLoading: false,
    isError: true, // PRECONDITION_FAILED surfaces as isError
    data: undefined,
    refetch: vi.fn(),
  }) as never;

beforeEach(() => {
  cleanup();
  mockedPolicy.mockReset();
  mockedGuards.mockReset();
  mockedOutcomes.mockReset();
  mockedTimeline.mockReset();

  // Default happy-path: all three views wired with data.
  mockedPolicy.mockReturnValue(
    ok({
      default: "REFUSE",
      phases: [
        { phase: "state", guards: [{ kind: "anonymous" }] },
        { phase: "taint", guards: [{ kind: "anonymous" }] },
        { phase: "auth", guards: [] },
        { phase: "business", guards: [{ kind: "anonymous" }, { kind: "anonymous" }] },
      ],
    }),
  );
  mockedGuards.mockReturnValue(
    ok({
      buckets: [
        {
          guardName: "amount_within_limit",
          guardPhase: "business",
          decisionKind: "REFUSE",
          day: "2026-06-01",
          count: 4,
        },
      ],
    }),
  );
  mockedOutcomes.mockReturnValue(
    ok({
      buckets: [
        {
          at: "2026-06-01T00:00:00.000Z",
          EXECUTE: 2,
          REFUSE: 1,
          REWRITE: 0,
          DEFER: 0,
          ESCALATE: 3,
          REQUEST_CONFIRMATION: 0,
        },
      ],
    }),
  );
  mockedTimeline.mockReturnValue(
    ok({
      schemaVersion: 1,
      totalEvents: 3,
      trips: 2,
      clears: 1,
      transitions: 3,
      maxTripDensity: 2,
      bySource: { operator: 3, automated: 0, boot: 0, external: 0, unknown: 0 },
      activeDurationMs: 1000,
      stability: "single_incident",
      headline: "Kill switch tripped twice, cleared once.",
    }),
  );
});

afterEach(() => cleanup());

describe("Adjudicant GovernancePage (115)", () => {
  it("mounts the three read-only governance sections", () => {
    render(<GovernancePage />);
    expect(screen.getByTestId("governance-policy")).toBeTruthy();
    expect(screen.getByTestId("governance-dashboards")).toBeTruthy();
    expect(screen.getByTestId("governance-killswitch")).toBeTruthy();
  });

  it("shows the write-isolation framing (observer; never authorize/weaken; kill-switch read-only)", () => {
    render(<GovernancePage />);
    expect(
      screen.getByText(/cannot authorize, weaken, or replay-mutate/i),
    ).toBeTruthy();
    // The kill-switch surface is explicitly READ-status only.
    expect(
      screen.getByText(/the kill-switch WRITE stays on the operator console/i),
    ).toBeTruthy();
  });

  it("renders the policy-version history (default outcome + per-phase guard counts)", () => {
    render(<GovernancePage />);
    expect(screen.getByTestId("policy-default").textContent).toBe("REFUSE");
    const policy = screen.getByTestId("governance-policy");
    expect(within(policy).getByText(/2 guards/i)).toBeTruthy();
  });

  it("renders the outcome distribution summed across buckets", () => {
    render(<GovernancePage />);
    const dist = screen.getByTestId("outcome-distribution");
    // ESCALATE summed to 3 from the single bucket.
    expect(within(dist).getByText("ESCALATE")).toBeTruthy();
    expect(within(dist).getByText("3")).toBeTruthy();
  });

  it("renders the kill-switch read-status timeline (headline + trip/clear stats)", () => {
    render(<GovernancePage />);
    expect(screen.getByTestId("killswitch-headline").textContent).toMatch(
      /tripped twice/i,
    );
  });

  it("renders the PRECONDITION_FAILED feature-detected state for an unwired port", () => {
    // The kill-switch port is NOT wired → PRECONDITION_FAILED → isError.
    mockedTimeline.mockReturnValue(featureDetected());
    render(<GovernancePage />);
    const killswitch = screen.getByTestId("governance-killswitch");
    // The view renders the not-configured error rather than crashing or faking.
    expect(
      within(killswitch).getByText(/PRECONDITION_FAILED/i),
    ).toBeTruthy();
    // No fabricated headline is shown.
    expect(screen.queryByTestId("killswitch-headline")).toBeNull();
  });

  it("renders the policy-history not-configured state when policyDescriptor is unwired", () => {
    mockedPolicy.mockReturnValue(featureDetected());
    render(<GovernancePage />);
    const policy = screen.getByTestId("governance-policy");
    expect(within(policy).getByText(/PRECONDITION_FAILED/i)).toBeTruthy();
    expect(screen.queryByTestId("policy-default")).toBeNull();
  });
});
