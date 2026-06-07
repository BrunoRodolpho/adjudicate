import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

beforeEach(() => {
  cleanup();
});

describe("Skeleton", () => {
  it("renders a busy status region with a visually-hidden Loading label", () => {
    render(<Skeleton />);
    const status = screen.getByRole("status");
    expect(status).toBeDefined();
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading")).toBeDefined();
  });

  it("defaults to 3 shimmer bars", () => {
    render(<Skeleton />);
    const bars = screen.getByTestId("skeleton").querySelectorAll("[aria-hidden='true']");
    expect(bars.length).toBe(3);
  });

  it("renders the requested number of bars", () => {
    render(<Skeleton lines={5} />);
    const bars = screen.getByTestId("skeleton").querySelectorAll("[aria-hidden='true']");
    expect(bars.length).toBe(5);
  });

  it("clamps lines below 1 to a single bar", () => {
    render(<Skeleton lines={0} />);
    const bars = screen.getByTestId("skeleton").querySelectorAll("[aria-hidden='true']");
    expect(bars.length).toBe(1);
  });

  it("clamps negative lines to a single bar", () => {
    render(<Skeleton lines={-4} />);
    const bars = screen.getByTestId("skeleton").querySelectorAll("[aria-hidden='true']");
    expect(bars.length).toBe(1);
  });

  it("floors fractional line counts", () => {
    render(<Skeleton lines={2.9} />);
    const bars = screen.getByTestId("skeleton").querySelectorAll("[aria-hidden='true']");
    expect(bars.length).toBe(2);
  });

  it("merges a custom className onto the status region", () => {
    render(<Skeleton className="mt-4" />);
    expect(screen.getByRole("status").className).toContain("mt-4");
  });
});
