import { describe, expect, it } from "vitest";
import {
  englishRefusalMessages,
  localizeDecision,
  refuse,
  decisionRefuse,
} from "@adjudicate/core";
import { portugueseRefusalMessages } from "../src/index.js";

describe("@adjudicate/locales-pt-BR", () => {
  it("covers every code in englishRefusalMessages", () => {
    const englishCodes = Object.keys(englishRefusalMessages.byCode).sort();
    const ptBrCodes = Object.keys(portugueseRefusalMessages.byCode).sort();
    expect(ptBrCodes).toEqual(englishCodes);
  });

  it("localizeDecision swaps the user-facing string", () => {
    const decision = decisionRefuse(
      refuse("SECURITY", "kill_switch_active", "System is temporarily unavailable."),
      [],
    );
    const localized = localizeDecision(decision, portugueseRefusalMessages);
    expect(localized.kind).toBe("REFUSE");
    if (localized.kind === "REFUSE") {
      expect(localized.refusal.userFacing).toBe(
        "Sistema temporariamente indisponível.",
      );
      // code and other fields preserved
      expect(localized.refusal.code).toBe("kill_switch_active");
      expect(localized.refusal.kind).toBe("SECURITY");
    }
  });

  it("falls back for unknown codes", () => {
    const decision = decisionRefuse(
      refuse("BUSINESS_RULE", "pack.specific.refusal", "Pack default text."),
      [],
    );
    const localized = localizeDecision(decision, portugueseRefusalMessages);
    if (localized.kind === "REFUSE") {
      expect(localized.refusal.userFacing).toBe(
        portugueseRefusalMessages.fallback,
      );
    }
  });

  it("does not mutate the input decision", () => {
    const decision = decisionRefuse(
      refuse("SECURITY", "kill_switch_active", "System is temporarily unavailable."),
      [],
    );
    const frozen = JSON.stringify(decision);
    localizeDecision(decision, portugueseRefusalMessages);
    expect(JSON.stringify(decision)).toBe(frozen);
  });
});
