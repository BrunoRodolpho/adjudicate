import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuditRecord } from "@adjudicate/core";
import { HallucinationBadge } from "./HallucinationBadge";

const rec = (metadata?: Record<string, unknown>) => ({ metadata } as unknown as AuditRecord);

describe("HallucinationBadge", () => {
  it("renders nothing without a hallucination score", () => {
    const { container } = render(<HallucinationBadge record={rec()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the bucket + score from metadata", () => {
    render(<HallucinationBadge record={rec({ hallucination_score: 0.82, hallucination_bucket: "hallucinated" })} />);
    expect(screen.getByText(/hallucinated/i)).toBeDefined();
    expect(screen.getByText(/score 0.82/i)).toBeDefined();
  });
});
