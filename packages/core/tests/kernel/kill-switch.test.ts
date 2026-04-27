/**
 * Kill-switch — runtime kernel-wide authority revocation.
 *
 * Invariants:
 *   - When active, every adjudicate() call returns SECURITY refusal
 *     `kill_switch_active`, regardless of taint, intent kind, or policy.
 *   - The check engages BEFORE the schema-version gate, so even malformed
 *     envelopes route through the kill-switch refusal.
 *   - Toggling back to inactive restores normal adjudication.
 *   - Env-var pre-seed engages on first read; runtime API takes precedence.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildEnvelope,
  basis,
  BASIS_CODES,
  decisionExecute,
  type IntentEnvelope,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";
import {
  adjudicate,
} from "../../src/kernel/adjudicate.js";
import {
  getKillSwitchState,
  isKilled,
  setKillSwitch,
  _resetKillSwitch,
} from "../../src/kernel/enforce-config.js";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const passBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [() => decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])],
  default: "EXECUTE",
};

function envFixture(taint: "SYSTEM" | "TRUSTED" | "UNTRUSTED" = "SYSTEM"): IntentEnvelope {
  return buildEnvelope({
    kind: "thing.do",
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

describe("kill switch", () => {
  beforeEach(() => {
    _resetKillSwitch();
  });
  afterEach(() => {
    _resetKillSwitch();
  });

  it("starts inactive by default", () => {
    expect(isKilled({})).toBe(false);
    expect(getKillSwitchState({}).active).toBe(false);
  });

  it("setKillSwitch(true, reason) engages the switch", () => {
    setKillSwitch(true, "incident-2026-04-26");
    expect(isKilled({})).toBe(true);
    const state = getKillSwitchState({});
    expect(state.active).toBe(true);
    expect(state.reason).toBe("incident-2026-04-26");
    expect(state.toggledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("kills every adjudicate() call when active, even SYSTEM-taint", () => {
    setKillSwitch(true, "test");
    const decision = adjudicate(envFixture("SYSTEM"), {}, passBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("kill_switch_active");
    expect(decision.basis[0]!.category).toBe("kill");
    expect(decision.basis[0]!.code).toBe("active");
  });

  it("includes the reason and toggledAt in the basis detail", () => {
    setKillSwitch(true, "broker-storm");
    const decision = adjudicate(envFixture(), {}, passBundle);
    if (decision.kind !== "REFUSE") throw new Error("expected REFUSE");
    const detail = decision.basis[0]!.detail as { reason: string; toggledAt: string };
    expect(detail.reason).toBe("broker-storm");
    expect(detail.toggledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("short-circuits BEFORE the schema-version gate", () => {
    setKillSwitch(true, "test");
    // Build an envelope with an invalid version. Without the kill switch,
    // this would refuse with `schema_version_unsupported`. With it, it
    // refuses with `kill_switch_active`.
    const env = envFixture();
    const malformed = { ...env, version: 999 } as IntentEnvelope;
    const decision = adjudicate(malformed, {}, passBundle);
    if (decision.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(decision.refusal.code).toBe("kill_switch_active");
  });

  it("toggling off restores normal adjudication", () => {
    setKillSwitch(true, "incident");
    expect(adjudicate(envFixture(), {}, passBundle).kind).toBe("REFUSE");
    setKillSwitch(false, "all-clear");
    expect(adjudicate(envFixture(), {}, passBundle).kind).toBe("EXECUTE");
  });

  it("respects IBX_KILL_SWITCH=1 env var on first read", () => {
    _resetKillSwitch();
    expect(isKilled({ IBX_KILL_SWITCH: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("respects IBX_KILL_SWITCH=true env var case-insensitively", () => {
    _resetKillSwitch();
    expect(isKilled({ IBX_KILL_SWITCH: "true" } as NodeJS.ProcessEnv)).toBe(true);
    _resetKillSwitch();
    expect(isKilled({ IBX_KILL_SWITCH: "YES" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("ignores IBX_KILL_SWITCH for unrecognized values", () => {
    _resetKillSwitch();
    expect(isKilled({ IBX_KILL_SWITCH: "maybe" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("runtime API takes precedence over env var (cannot re-seed after manual toggle)", () => {
    _resetKillSwitch();
    setKillSwitch(false, "deliberately off");
    // Reading with the env saying "active" doesn't override the manual choice.
    expect(isKilled({ IBX_KILL_SWITCH: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
