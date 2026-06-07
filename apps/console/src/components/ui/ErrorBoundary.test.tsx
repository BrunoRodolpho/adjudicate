import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

function Ok() {
  return <div>healthy child</div>;
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  cleanup();
  // React logs caught errors to console.error; silence it so test output stays clean.
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy child")).toBeDefined();
  });

  it("renders the default ErrorState when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeDefined();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("logs the caught error via componentDidCatch", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalled();
    const loggedOurMessage = consoleSpy.mock.calls.some((call) =>
      call.some((arg) => arg === "ErrorBoundary caught an error"),
    );
    expect(loggedOurMessage).toBe(true);
  });
});
