import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAriaLive } from "./useAriaLive";

beforeEach(() => {
  cleanup();
});

/**
 * Harness that exposes the hook through buttons so the test can drive
 * `announce` and observe the rendered region.
 */
function Harness() {
  const { announce, AriaLiveRegion, message } = useAriaLive();
  return (
    <div>
      <span data-testid="message">{message}</span>
      <button type="button" onClick={() => announce("3 new audit records")}>
        records
      </button>
      <button type="button" onClick={() => announce("kill switch engaged")}>
        kill
      </button>
      <AriaLiveRegion />
    </div>
  );
}

describe("useAriaLive", () => {
  it("mounts a polite, atomic status region", () => {
    render(<Harness />);
    const region = screen.getByTestId("aria-live-region");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.getAttribute("role")).toBe("status");
  });

  it("is visually hidden via sr-only", () => {
    render(<Harness />);
    expect(screen.getByTestId("aria-live-region").className).toContain("sr-only");
  });

  it("announces a message into the region", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("records"));
    expect(screen.getByTestId("aria-live-region").textContent).toBe(
      "3 new audit records",
    );
    expect(screen.getByTestId("message").textContent).toBe(
      "3 new audit records",
    );
  });

  it("replaces the message on a subsequent announce", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("records"));
    fireEvent.click(screen.getByText("kill"));
    expect(screen.getByTestId("aria-live-region").textContent).toBe(
      "kill switch engaged",
    );
  });

  it("re-announces the same message by clearing then re-setting it", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("records"));
    expect(screen.getByTestId("aria-live-region").textContent).toBe(
      "3 new audit records",
    );
    // Same text again — the hook should briefly clear then restore it so the
    // region content genuinely transitions.
    await act(async () => {
      fireEvent.click(screen.getByText("records"));
      // Let the queued microtask that re-sets the message flush.
      await Promise.resolve();
    });
    expect(screen.getByTestId("aria-live-region").textContent).toBe(
      "3 new audit records",
    );
  });
});
