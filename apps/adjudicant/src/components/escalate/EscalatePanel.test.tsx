import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EscalatePanel } from "./EscalatePanel";
import { useRaiseEscalation } from "@/hooks/useRaiseEscalation";

vi.mock("@/hooks/useRaiseEscalation", () => ({
  useRaiseEscalation: vi.fn(),
}));

const mockedHook = vi.mocked(useRaiseEscalation);
const mutate = vi.fn();
const reset = vi.fn();

function idle() {
  return {
    mutate,
    reset,
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
  } as never;
}

beforeEach(() => {
  cleanup();
  mutate.mockReset();
  reset.mockReset();
  mockedHook.mockReset();
  mockedHook.mockReturnValue(idle());
});

afterEach(() => cleanup());

describe("EscalatePanel — friction-monotone escalate surface (114)", () => {
  it("offers ONLY the three friction-increasing recommendations (no allow/bypass/override)", () => {
    render(<EscalatePanel />);
    // The three friction-only options exist ...
    expect(screen.getByTestId("escalate-rec-pause")).toBeTruthy();
    expect(screen.getByTestId("escalate-rec-review")).toBeTruthy();
    expect(screen.getByTestId("escalate-rec-escalate")).toBeTruthy();
    // ... and NO friction-DECREASING control is rendered.
    for (const forbidden of ["allow", "bypass", "override", "execute"]) {
      expect(screen.queryByTestId(`escalate-rec-${forbidden}`)).toBeNull();
    }
    // Every radio's value is from the closed friction-only set.
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const values = radios.map((r) => r.value).sort();
    expect(values).toEqual(["escalate", "pause", "review"]);
  });

  it("submits the chosen recommendation, hash and reason through the escalate mutation", () => {
    render(<EscalatePanel />);
    fireEvent.change(screen.getByTestId("escalate-hash-input"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(screen.getByTestId("escalate-rec-escalate"));
    fireEvent.change(screen.getByTestId("escalate-reason-input"), {
      target: { value: "supervisor sign-off needed before this proceeds" },
    });
    fireEvent.click(screen.getByTestId("escalate-submit"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      intentHash: "a".repeat(64),
      recommendation: "escalate",
      reason: "supervisor sign-off needed before this proceeds",
    });
  });

  it("renders the recorded escalation FACT on success (a fact, not a Decision)", () => {
    mockedHook.mockReturnValue({
      mutate,
      reset,
      isPending: false,
      isError: false,
      isSuccess: true,
      data: {
        id: "esc-1",
        at: "2026-06-19T00:00:00.000Z",
        kind: "escalation.raised",
        intentHash: "a".repeat(64),
        recommendation: "review",
        reason: "needs human review",
        raisedBy: { id: "demo-observer" },
      },
      error: null,
    } as never);
    render(<EscalatePanel />);
    const success = screen.getByTestId("escalate-success");
    expect(success.textContent).toContain("review");
    expect(success.textContent).toContain("esc-1");
    // The surface surfaces a FACT — it never renders a decision outcome.
    expect(success.textContent).not.toMatch(/EXECUTE|REFUSE|DEFER/);
  });

  it("surfaces a server rejection (e.g. rate-limit / unauthorized) as an error", () => {
    mockedHook.mockReturnValue({
      mutate,
      reset,
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error("Escalation rate limit exceeded for this actor."),
    } as never);
    render(<EscalatePanel />);
    expect(screen.getByTestId("escalate-error").textContent).toContain(
      "rate limit",
    );
  });
});
