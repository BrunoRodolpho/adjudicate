import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShellBody } from "./ShellBody";

// Sidebar pulls next/navigation + URL-filter hooks; stub it so this test stays
// focused on the shell's landmarks + collapse behavior.
vi.mock("./Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar-stub">nav</div>,
}));

beforeEach(() => cleanup());

describe("ShellBody", () => {
  it("renders a focusable main landmark for the skip-link target", () => {
    render(<ShellBody>content here</ShellBody>);
    const main = document.getElementById("main-content");
    expect(main).not.toBeNull();
    expect(main?.tagName).toBe("MAIN");
    expect(main?.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByText("content here")).toBeDefined();
  });

  it("starts with navigation expanded and toggles it closed/open", () => {
    render(<ShellBody>body</ShellBody>);
    const toggle = screen.getByRole("button", { name: /collapse navigation/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("primary-nav");
    expect(screen.getByTestId("sidebar-stub")).toBeDefined();

    fireEvent.click(toggle);
    const reopened = screen.getByRole("button", { name: /expand navigation/i });
    expect(reopened.getAttribute("aria-expanded")).toBe("false");
    // Nav container is hidden when collapsed.
    expect(document.getElementById("primary-nav")?.className).toContain("hidden");

    fireEvent.click(reopened);
    expect(
      screen.getByRole("button", { name: /collapse navigation/i }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
