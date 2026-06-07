import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SkipLink } from "./SkipLink";

beforeEach(() => {
  cleanup();
});

describe("SkipLink", () => {
  it("renders the default label and points at #main-content", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link.getAttribute("href")).toBe("#main-content");
  });

  it("targets a custom id when provided", () => {
    render(<SkipLink targetId="report-body">Skip to report</SkipLink>);
    const link = screen.getByRole("link", { name: "Skip to report" });
    expect(link.getAttribute("href")).toBe("#report-body");
  });

  it("is clipped (sr-only) until focused and reveals on focus", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    // Hidden by default…
    expect(link.className).toContain("sr-only");
    // …and revealed via the focus variant.
    expect(link.className).toContain("focus:not-sr-only");
  });

  it("uses a focus-visible ring from the existing tokens", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link.className).toContain("focus-visible:ring-1");
  });
});
