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
