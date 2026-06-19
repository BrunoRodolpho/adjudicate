import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AuditRecordVerification } from "@adjudicate/core";
import { IntegrityBadge } from "./IntegrityBadge";

afterEach(() => cleanup());

describe("IntegrityBadge — deny-by-default integrity rendering (112)", () => {
  it("renders a VERIFIED badge only for { verified: true }", () => {
    render(<IntegrityBadge verification={{ verified: true }} />);
    const badge = screen.getByTestId("integrity-badge");
    expect(badge.getAttribute("data-verdict")).toBe("verified");
    expect(badge.textContent?.toLowerCase()).toContain("verified");
  });

  it("renders a loud TAMPER badge for { verified: false, reason: tampered }", () => {
    const v: AuditRecordVerification = {
      verified: false,
      reason: "tampered",
      derived: "aa",
      stored: "bb",
    };
    render(<IntegrityBadge verification={v} />);
    const badge = screen.getByTestId("integrity-badge");
    expect(badge.getAttribute("data-verdict")).toBe("tampered");
    // The label surfaces the reason; never paints a tampered record as intact.
    expect(badge.getAttribute("data-verdict")).not.toBe("verified");
  });

  it("renders TAMPER for a forged envelope intent mismatch", () => {
    const v: AuditRecordVerification = {
      verified: false,
      reason: "envelope_intent_mismatch",
      derived: "aa",
      stored: "bb",
    };
    render(<IntegrityBadge verification={v} />);
    expect(screen.getByTestId("integrity-badge").getAttribute("data-verdict")).toBe(
      "tampered",
    );
  });

  it("renders TAMPER for an invalid signature", () => {
    const v: AuditRecordVerification = {
      verified: false,
      reason: "invalid_signature",
      keyId: "kms-1",
      alg: "ed25519",
    };
    render(<IntegrityBadge verification={v} />);
    expect(screen.getByTestId("integrity-badge").getAttribute("data-verdict")).toBe(
      "tampered",
    );
  });

  it("renders UNVERIFIED (never intact) for a pre-v4 missing_hash record", () => {
    const v: AuditRecordVerification = { verified: null, reason: "missing_hash" };
    render(<IntegrityBadge verification={v} />);
    expect(screen.getByTestId("integrity-badge").getAttribute("data-verdict")).toBe(
      "unverified",
    );
  });

  it("renders UNVERIFIED (deny-by-default) when no verdict is supplied", () => {
    render(<IntegrityBadge verification={undefined} />);
    const badge = screen.getByTestId("integrity-badge");
    // An unchecked record must NEVER render as verified/intact.
    expect(badge.getAttribute("data-verdict")).toBe("unverified");
    expect(badge.getAttribute("data-verdict")).not.toBe("verified");
  });
});
