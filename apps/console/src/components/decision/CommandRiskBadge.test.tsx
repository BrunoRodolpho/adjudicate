import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuditRecord } from "@adjudicate/core";
import { CommandRiskBadge } from "./CommandRiskBadge";

function record(basis: AuditRecord["decision_basis"]): AuditRecord {
  return { decision_basis: basis } as unknown as AuditRecord;
}

describe("CommandRiskBadge", () => {
  it("renders nothing without a command-risk basis", () => {
    const { container } = render(
      <CommandRiskBadge record={record([{ category: "business", code: "rule_satisfied" }] as never)} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the category + command for a blocked command", () => {
    render(
      <CommandRiskBadge
        record={record([
          { category: "validation", code: "command_blocked", detail: { category: "destructive", command: "rm -rf /" } },
        ] as never)}
      />,
    );
    expect(screen.getByText(/destructive · blocked/i)).toBeDefined();
    expect(screen.getByText("rm -rf /")).toBeDefined();
  });

  it("masks secret-bearing tokens in the rendered command (ADR-134)", () => {
    const { container } = render(
      <CommandRiskBadge
        record={record([
          {
            category: "validation",
            code: "command_blocked",
            detail: { category: "credential", command: "echo $AWS_SECRET_ACCESS_KEY > /tmp/x" },
          },
        ] as never)}
      />,
    );
    // The live secret env-var name is never echoed; it's masked.
    expect(container.textContent).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(container.textContent).toContain("[REDACTED]");
  });

  it("masks credential file paths in the rendered command (ADR-134)", () => {
    const { container } = render(
      <CommandRiskBadge
        record={record([
          {
            category: "validation",
            code: "command_blocked",
            detail: { category: "credential", command: "cat ~/.aws/credentials" },
          },
        ] as never)}
      />,
    );
    expect(container.textContent).not.toContain(".aws/credentials");
    expect(container.textContent).toContain("[REDACTED]");
  });

  it("renders stripped flags for a sanitized REWRITE", () => {
    render(
      <CommandRiskBadge
        record={record([
          {
            category: "validation",
            code: "command_flag_stripped",
            detail: { category: "destructive", command: "rm -rf x", stripped: ["--no-preserve-root"] },
          },
        ] as never)}
      />,
    );
    expect(screen.getByText(/stripped flags: --no-preserve-root/i)).toBeDefined();
  });
});
