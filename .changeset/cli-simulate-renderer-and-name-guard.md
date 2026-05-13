---
"@adjudicate/cli": minor
"@adjudicate/core": minor
"@adjudicate/pack-payments-pix": patch
"@adjudicate/pack-identity-kyc": patch
---

Phase 6.3 — ANSI-boxed `simulate` text renderer + `nameGuard` helper.

## `@adjudicate/cli` — rounded-box text renderer

The `simulate` command's default text output is now a fixed-width rounded-box layout with four sections: decision header, intent metadata, per-guard trace, and decision-specific detail (refusal / escalation / prompt / defer / rewrite).

Sample:

```
╭─ DECISION: REQUEST_CONFIRMATION ─────────────────────────────────────────────╮
│ Pack       pack-payments-pix                                                 │
│ Kind       pix.charge.refund                                                 │
│ Actor      llm/sess-1                                                        │
│ Taint      UNTRUSTED                                                         │
│ Nonce      n-1                                                               │
│ Hash       460891c47222...                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Trace                                                                        │
│   kill                                                                pass   │
│   schema                                                              pass   │
│   state[0]     escalateFailedConfirm                                  pass   │
│   ...                                                                        │
│   business[3]  requestConfirmForMediumRefund                          MATCH  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Basis                                                                        │
│   schema     / version_supported                                             │
│   ...                                                                        │
│   business   / rule_satisfied                                                │
│                rule:      confirm_threshold_reached                          │
│                threshold: 50000                                              │
│                requested: 60000                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Prompt                                                                       │
│   You're about to refund R$ 600.00. Confirm?                                 │
╰──────────────────────────────────────────────────────────────────────────────╯
```

- Width: terminal-adaptive, clamped to `[70, 120]`. Override via `RenderOptions.width` programmatically.
- Color: chalk-styled, auto-disabled under `NO_COLOR=1` or non-TTY stdout.
- Visual-width math is ANSI-escape-aware, so styled spans align correctly.
- Long values (refusal `userFacing`, escalate `reason`, rewrite reason) word-wrap to the inner column.
- `expected.kind` mismatch surfaces inline as `MISMATCH (got X)` in yellow.
- Decision-specific detail blocks: `Refusal` (kind/code/user-facing/detail), `Escalation` (to/reason), `Prompt` (REQUEST_CONFIRMATION), `Defer` (signal/timeoutMs), `Rewrite` (reason/new kind/new hash). EXECUTE has no detail block — basis alone tells the story.

`render(output, format, options?)` signature is unchanged on call sites; the new `options.width` is optional.

## `@adjudicate/core` — `nameGuard(name, guard)` helper

Exported from `@adjudicate/core/kernel`. Attaches a stable `Function.name` to factory-built guards so they appear in `AdjudicationTraceEntry.guardName`:

```ts
import { nameGuard } from "@adjudicate/core/kernel";
import { createThresholdGuard } from "@adjudicate/primitives";

const escalateLargeRefunds = nameGuard(
  "escalateLargeRefunds",
  createThresholdGuard({ ... }),
);
```

Guards declared as named consts (`const validateAmount: Guard = ...`) already get useful names via TS's variable-name inference — `nameGuard` is only needed when the guard comes back as an anonymous closure from a factory.

Implementation: `Object.defineProperty(guard, "name", { value, configurable: true, writable: false })`. Idempotent (re-naming is allowed via `defineProperty`); preserves the guard's type identity (pass-through return).

## `@adjudicate/pack-payments-pix` — apply `nameGuard` to factory-built guards

`escalateLargeRefunds`, `requestConfirmForMediumRefund`, `deferChargeCreate` now carry their names in trace output. Inline-arrow guards (`validateChargeAmount`, `clampRefundToOriginal`, `escalateFailedConfirm`, etc.) were already named via TS inference; no change there.

## `@adjudicate/pack-identity-kyc` — apply `nameGuard` to factory-built guards

`requireDocumentUpload`, `waitForVerification`, `refuseLowScore`, `executeOnHighScore` now carry their names in trace output.

## Verification

- 15 new renderer tests cover box framing, width clamping, section ordering, all six decision detail blocks, trace name/index formatting, expected/mismatch indicators, and JSON-format parseability.
- All existing tests remain green: core 253/253, primitives 13/13, PIX 28/28, KYC 14/14, CLI scenario+simulate 18/18.
- Manual smoke-test against PIX for all six outcomes confirms readable terminal output with correct alignment, colors, and decision-specific details.
