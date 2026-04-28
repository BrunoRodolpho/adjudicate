/**
 * Scripted 6-turn demo transcript. Each turn is a user message chosen
 * to trigger one of the six kernel Decisions.
 *
 * Per-turn state transitions happen between turns (not inside the agent
 * loop) — the demo simulates payment-provider webhooks, manual state
 * commits after EXECUTE, etc.
 */

import type { PixState } from "@adjudicate/pack-payments-pix";
import {
  applyRefund,
  createInitialDemoState,
  createPrimedDemoState,
} from "./pix-state.js";

export type ExpectedDecision =
  | "EXECUTE"
  | "REFUSE"
  | "REWRITE"
  | "REQUEST_CONFIRMATION"
  | "ESCALATE"
  | "DEFER";

export interface ScriptedTurn {
  readonly title: string;
  readonly expected: ExpectedDecision;
  readonly userMessage: string;
  /**
   * Called BEFORE this turn runs to set up the state. Returns the state
   * snapshot the agent will see this turn.
   */
  readonly setupState: (previous: PixState) => PixState;
  /**
   * Called AFTER the turn completes (and any auto-confirm finishes) to
   * produce the state for the NEXT turn. State may also incorporate
   * executor side-effects (refunds applied, etc.).
   */
  readonly afterTurn: (current: PixState) => PixState;
  /**
   * If the turn ends in `awaiting_confirmation`, the demo auto-confirms
   * with this value. `undefined` means the turn isn't expected to pause
   * for confirmation.
   */
  readonly autoConfirm?: boolean;
}

export const TRANSCRIPT: ReadonlyArray<ScriptedTurn> = [
  // ── Turn 1: DEFER ──────────────────────────────────────────────────────
  {
    title: "DEFER — create a new PIX charge",
    expected: "DEFER",
    userMessage:
      "Please create a PIX charge for R$ 50,00 to be paid by CPF 12345678900. Description: 'iced coffee at the café'. Use the pix.charge.create tool.",
    setupState: () => createInitialDemoState(),
    // After the simulated webhook, transition to the primed state with
    // confirmed charges so subsequent refund turns have something to
    // refund.
    afterTurn: () => createPrimedDemoState(),
  },
  // ── Turn 2: REFUSE ─────────────────────────────────────────────────────
  {
    title: "REFUSE — refund a charge that does not exist",
    expected: "REFUSE",
    userMessage:
      "Please refund R$ 100,00 from charge cha-doesnotexist using pix.charge.refund. Reason: 'customer requested'.",
    setupState: (prev) => prev,
    afterTurn: (cur) => cur,
  },
  // ── Turn 3: EXECUTE ────────────────────────────────────────────────────
  {
    title: "EXECUTE — small valid refund",
    expected: "EXECUTE",
    userMessage:
      "Please refund R$ 30,00 from charge cha-confirmed-low using pix.charge.refund. Reason: 'partial refund agreed with customer'.",
    setupState: (prev) => prev,
    // The executor's refund handler returns a refund record; the demo
    // marks the charge as refunded in state for subsequent turns.
    afterTurn: (cur) => applyRefund(cur, "cha-confirmed-low", 3000),
  },
  // ── Turn 4: REWRITE ───────────────────────────────────────────────────
  // We want a charge that's still confirmed (not refunded), and we ask
  // for more than the original. The kernel's REWRITE clamps to the
  // original amount; the executor then runs with the clamped value.
  {
    title: "REWRITE — refund > original amount, kernel clamps",
    expected: "REWRITE",
    userMessage:
      "Please refund R$ 1000,00 from charge cha-confirmed-mid using pix.charge.refund. Reason: 'overcharge dispute'.",
    setupState: (prev) => prev,
    afterTurn: (cur) => applyRefund(cur, "cha-confirmed-mid", 80_000),
  },
  // ── Turn 5: REQUEST_CONFIRMATION ──────────────────────────────────────
  // We need a confirmed, not-yet-refunded charge with a high enough
  // amount to allow a R$ 600 refund (≥ CONFIRM threshold, < ESCALATE
  // threshold). cha-confirmed-high (R$ 3000) works.
  {
    title: "REQUEST_CONFIRMATION — medium refund needs user OK",
    expected: "REQUEST_CONFIRMATION",
    userMessage:
      "Please refund R$ 600,00 from charge cha-confirmed-high using pix.charge.refund. Reason: 'customer dispute on partial order'.",
    setupState: (prev) => prev,
    afterTurn: (cur) => applyRefund(cur, "cha-confirmed-high", 60_000),
    autoConfirm: true,
  },
  // ── Turn 6: ESCALATE ──────────────────────────────────────────────────
  // After Turn 5 refunded cha-confirmed-high, we need a fresh confirmed
  // charge for the escalate. Add one in setupState.
  {
    title: "ESCALATE — large refund routes to a supervisor",
    expected: "ESCALATE",
    userMessage:
      "Please refund R$ 2000,00 from charge cha-confirmed-extra using pix.charge.refund. Reason: 'fraud claim'.",
    setupState: (prev) => {
      // Inject an additional confirmed charge for this turn.
      const charges = new Map(prev.charges);
      const now = new Date().toISOString();
      charges.set("cha-confirmed-extra", {
        id: "cha-confirmed-extra",
        amountCentavos: 500_000, // R$ 5000
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      });
      return { charges };
    },
    afterTurn: (cur) => cur,
  },
];

/**
 * Per-turn `basePrompt` instruction so the LLM is more likely to
 * actually call the tool the user requested rather than refusing on
 * its own initiative. Demo determinism — production would soften.
 */
export const DEMO_BASE_PROMPT = [
  "You are running inside an adjudicate-protected PIX payments demo.",
  "When the user requests an action that maps to one of the available tools, propose it via the tool. Do NOT refuse the action yourself — the kernel decides whether to execute, refuse, defer, escalate, or rewrite.",
  "If the kernel's tool_result says the action was queued, refused, escalated, or clamped, relay that to the user in plain Portuguese-flavored English.",
].join("\n");
