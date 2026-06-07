import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorState } from "./ErrorState";

beforeEach(() => {
  cleanup();
});

describe("ErrorState", () => {
  it("renders the default message when none is provided", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders a custom message", () => {
    render(<ErrorState message="Drift telemetry unavailable" />);
    expect(screen.getByText("Drift telemetry unavailable")).toBeDefined();
  });

  it("exposes the error as an alert role", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("does not render a Retry button when no handler is given", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("renders a keyboard-focusable Retry button when a handler is given", () => {
    render(<ErrorState onRetry={() => {}} />);
    const button = screen.getByRole("button", { name: /retry/i });
    expect(button).toBeDefined();
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("fires the retry callback when the button is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("merges a custom className", () => {
    render(<ErrorState className="mt-2" />);
    expect(screen.getByRole("alert").className).toContain("mt-2");
  });
});
