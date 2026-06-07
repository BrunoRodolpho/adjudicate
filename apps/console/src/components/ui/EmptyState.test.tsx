import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

beforeEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No decisions recorded" />);
    expect(screen.getByText("No decisions recorded")).toBeDefined();
  });

  it("renders a hint when provided", () => {
    render(<EmptyState title="No decisions" hint="Decisions appear once agents run." />);
    expect(screen.getByText("Decisions appear once agents run.")).toBeDefined();
  });

  it("omits the hint when not provided", () => {
    render(<EmptyState title="No decisions" />);
    expect(screen.queryByText(/appear once/i)).toBeNull();
  });

  it("renders a custom icon when provided", () => {
    render(<EmptyState title="No data" icon={<span data-testid="empty-icon">icon</span>} />);
    expect(screen.getByTestId("empty-icon")).toBeDefined();
  });

  it("omits the icon slot when no icon is provided", () => {
    render(<EmptyState title="No data" />);
    expect(screen.queryByTestId("empty-icon")).toBeNull();
  });

  it("merges a custom className", () => {
    render(<EmptyState title="No data" className="border-t" />);
    expect(screen.getByTestId("empty-state").className).toContain("border-t");
  });
});
