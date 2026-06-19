import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import InvestigationsPage from "./page";
import { useCase } from "@/hooks/useCase";

vi.mock("@/hooks/useCase", () => ({ useCase: vi.fn() }));

const mockedCase = vi.mocked(useCase);

beforeEach(() => {
  cleanup();
  mockedCase.mockReset();
  mockedCase.mockReturnValue({
    isLoading: false,
    isError: false,
    data: undefined,
    refetch: vi.fn(),
  } as never);
});

afterEach(() => cleanup());

describe("Adjudicant InvestigationsPage (113)", () => {
  it("mounts the read-only Investigations surface", () => {
    render(<InvestigationsPage />);
    expect(
      screen.getByText(/Investigations · inspector-general/i),
    ).toBeTruthy();
    // The write-isolation framing copy is present (observer, never authorize).
    expect(
      screen.getByText(/cannot authorize, weaken, or replay-mutate/i),
    ).toBeTruthy();
  });

  it("prompts for a seed hash before a case is opened", () => {
    render(<InvestigationsPage />);
    expect(screen.getByText(/No case open/i)).toBeTruthy();
    // The hook is NOT engaged with a hash until the operator submits one.
    expect(mockedCase).toHaveBeenCalledWith("");
  });

  it("opens a case for the submitted intent hash", () => {
    const seed = "a".repeat(64);
    mockedCase.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        seedIntentHash: seed,
        sessionId: "s1",
        seedFound: true,
        members: [
          {
            record: {
              intentHash: seed,
              at: "2026-06-19T00:00:00.000Z",
              decision: { kind: "REFUSE" },
              envelope: { kind: "test.k" },
            },
            verification: { verified: true },
            reason: "seed",
          },
        ],
      },
      refetch: vi.fn(),
    } as never);

    render(<InvestigationsPage />);
    fireEvent.change(screen.getByTestId("case-seed-input"), {
      target: { value: seed },
    });
    fireEvent.click(screen.getByTestId("case-seed-submit"));

    // The case timeline renders for the submitted hash.
    expect(screen.getByTestId("case-view")).toBeTruthy();
    expect(screen.getByTestId("case-session").textContent).toBe("s1");
  });
});
