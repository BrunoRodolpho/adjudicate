"use client";

import { useState } from "react";
import { GUIDED_CASE_BY_ID } from "@/content/guided-cases";
import { GuidedCasePicker } from "./GuidedCasePicker";
import { GuidedCaseRunner } from "./GuidedCaseRunner";

/**
 * GUIDED mode — the friendly default for the rebuilt playground.
 *
 * Orchestrator only: it owns which case is selected and swaps between the
 * picker grid and the single-case runner. All the real work (running the
 * kernel, rendering receipts) lives in the children; this stays a thin,
 * stateful shell so the two views never coexist and focus is always clear.
 *
 * `stepIndex` lives inside {@link GuidedCaseRunner} (re-mounted per case via
 * the `key`), so picking a fresh case always starts its story from step one.
 */
export function GuidedMode() {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const selectedCase = selectedCaseId
    ? GUIDED_CASE_BY_ID[selectedCaseId] ?? null
    : null;

  if (selectedCase) {
    return (
      <GuidedCaseRunner
        key={selectedCase.id}
        guidedCase={selectedCase}
        onBack={() => setSelectedCaseId(null)}
      />
    );
  }

  return <GuidedCasePicker onPick={setSelectedCaseId} />;
}
