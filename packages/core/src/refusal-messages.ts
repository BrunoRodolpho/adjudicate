/**
 * RefusalMessages — externalized user-facing refusal strings.
 *
 * Per ADR-107: the kernel itself emits stable `Refusal.code` values and a
 * default English `userFacing` string. Adopters who want a different locale
 * compose `localizeDecision(decision, messages)` at presentation time.
 *
 * The kernel does NOT consult a runtime-context locale slot — that would
 * either (a) require an extra parameter to `adjudicate()` (breaks the pure
 * signature) or (b) read from mutable global state (breaks kernel
 * determinism — Invariant #1). Localization is a presentation concern.
 *
 * # Wire format
 *
 * Adopters localize off the `code` field, which is part of the closed
 * `RefusalCode` enum (see `refusal.ts`). The English `userFacing` string
 * is the framework's reference text; localized strings are equivalent
 * presentations.
 */

import type { Decision } from "./decision.js";
import type { Refusal } from "./refusal.js";

/**
 * Per-code user-facing string mapping. Refusal codes are stable strings
 * (see `KERNEL_REFUSAL_CODES` for the framework's set; Pack authors emit
 * their own codes drawn from `Pack.basisCodes`). Localized strings are
 * the values. Adopters supply a per-code mapping; `fallback` covers
 * codes outside the dictionary.
 */
export interface RefusalMessages {
  readonly fallback: string;
  readonly byCode: Readonly<Record<string, string>>;
}

/**
 * Framework-supplied English defaults. The kernel emits these as
 * `Refusal.userFacing` when constructing a built-in refusal (kill switch,
 * schema-version, taint, default-deny, guard-panic, deadline, replay).
 *
 * The exact strings are stable wire content — changing them is a minor
 * version bump.
 */
export const englishRefusalMessages: RefusalMessages = {
  fallback: "This action is not permitted right now.",
  byCode: {
    kill_switch_active: "System is temporarily unavailable.",
    schema_version_unsupported:
      "This action cannot be processed at the moment.",
    taint_level_insufficient:
      "I can't perform this action with the information available.",
    default_deny: "This action is not permitted right now.",
    guard_panic: "System is temporarily unavailable.",
    ledger_replay_suppressed: "This action has already been processed.",
    kernel_deadline_exceeded:
      "The action could not be completed in the time available.",
  },
};

/**
 * Look up a localized user-facing string for a refusal code. Returns the
 * mapped string, or `fallback` when the code is not in the dictionary.
 *
 * Pure function — safe to use at audit/render/UI time.
 */
export function resolveRefusalMessage(
  code: string,
  messages: RefusalMessages = englishRefusalMessages,
): string {
  return messages.byCode[code] ?? messages.fallback;
}

/**
 * Return a Decision with REFUSE variants' `userFacing` strings localized
 * per the supplied messages dictionary. Non-REFUSE Decisions pass through
 * unchanged. The original Decision is not mutated.
 *
 * Use this at presentation/UI time, not at adjudication time — the
 * kernel's audit record carries the framework-default English string
 * for governance consistency; the localized string is what the user sees.
 */
export function localizeDecision(
  decision: Decision,
  messages: RefusalMessages,
): Decision {
  if (decision.kind !== "REFUSE") return decision;
  const localized: Refusal = {
    ...decision.refusal,
    userFacing: resolveRefusalMessage(decision.refusal.code, messages),
  };
  return { ...decision, refusal: localized };
}
