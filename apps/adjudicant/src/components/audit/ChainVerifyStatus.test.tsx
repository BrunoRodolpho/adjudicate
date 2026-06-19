import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChainVerifyStatus } from "./ChainVerifyStatus";

afterEach(() => cleanup());

describe("ChainVerifyStatus — 093 chain continuity signal (112)", () => {
  it("renders INTACT when there are zero breaks", () => {
    render(<ChainVerifyStatus chainIntegrity={{ checked: 4, breaks: [] }} />);
    const el = screen.getByTestId("chain-status");
    expect(el.getAttribute("data-state")).toBe("intact");
    expect(el.textContent?.toLowerCase()).toContain("intact");
  });

  it("renders BROKEN (deny-by-default) when there is at least one break", () => {
    render(
      <ChainVerifyStatus
        chainIntegrity={{
          checked: 3,
          breaks: [
            {
              intentHash: "a".repeat(64),
              prevAuditHash: "deadbeef",
              predecessorAuditHash: "cafebabe",
            },
          ],
        }}
      />,
    );
    const el = screen.getByTestId("chain-status");
    expect(el.getAttribute("data-state")).toBe("broken");
    expect(el.textContent?.toLowerCase()).toContain("broken");
  });

  it("renders UNVERIFIED when the store did not compute chain continuity", () => {
    render(<ChainVerifyStatus chainIntegrity={undefined} />);
    expect(screen.getByTestId("chain-status").getAttribute("data-state")).toBe(
      "unverified",
    );
  });
});
