import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { VisuallyHidden } from "./VisuallyHidden";

beforeEach(() => {
  cleanup();
});

describe("VisuallyHidden", () => {
  it("renders its children so screen readers receive the text", () => {
    render(<VisuallyHidden>kill switch engaged</VisuallyHidden>);
    expect(screen.getByText("kill switch engaged")).toBeDefined();
  });

  it("applies the sr-only clip-rect class", () => {
    render(<VisuallyHidden>hidden label</VisuallyHidden>);
    const el = screen.getByText("hidden label");
    expect(el.className).toContain("sr-only");
  });

  it("renders a span by default", () => {
    render(<VisuallyHidden>span content</VisuallyHidden>);
    expect(screen.getByText("span content").tagName).toBe("SPAN");
  });

  it("honors the `as` prop to change the host element", () => {
    render(<VisuallyHidden as="div">div content</VisuallyHidden>);
    expect(screen.getByText("div content").tagName).toBe("DIV");
  });

  it("merges an extra className alongside sr-only", () => {
    render(<VisuallyHidden className="custom-x">labelled</VisuallyHidden>);
    const el = screen.getByText("labelled");
    expect(el.className).toContain("sr-only");
    expect(el.className).toContain("custom-x");
  });
});
