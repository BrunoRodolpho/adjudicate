# Quickstart — Anthropic

A runnable end-to-end demo of [`@adjudicate/anthropic`](../../packages/anthropic) wired against the [`@adjudicate/pack-payments-pix`](../../packages/pack-payments-pix) Pack. One run prints all six kernel Decisions with real Anthropic API calls behind them.

## What is PIX?

PIX is Brazil's instant-payment system. Charges follow an async lifecycle: a merchant creates a charge, the bank confirms it via webhook (typically seconds later), then the merchant may issue refunds. The async-by-default shape is exactly what makes it the lighthouse Pack — `DEFER` is a first-class outcome.

## Setup

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY
pnpm install
pnpm --filter @example/quickstart-anthropic dev
```

`tsx` runs the TypeScript directly. No build step required for development.

## What you'll see

The script runs six scripted user messages. Each is chosen to trigger a different kernel Decision:

| Turn | User message | Expected Decision |
|---|---|---|
| 1 | "Create a PIX charge for R$ 50,00…" | `DEFER` (waiting for the bank webhook) |
| 2 | "Refund a non-existent charge id" | `REFUSE` (`pix.charge.not_found`) |
| 3 | "Refund R$ 30,00 from a confirmed charge" | `EXECUTE` |
| 4 | "Refund R$ 1000,00 from a R$ 800 charge" | `REWRITE` (clamped to original) |
| 5 | "Refund R$ 600,00 from a R$ 3000 charge" | `REQUEST_CONFIRMATION` (medium threshold) |
| 6 | "Refund R$ 2000,00 from a R$ 5000 charge" | `ESCALATE` (above supervisor threshold) |

For each turn the console shows: the user message, Claude's `tool_use` proposal, the kernel's `Decision` (with reason / refusal code / threshold info), the executor's effect, and the agent's `outcome`.

After all turns run, the script prints a summary and exits non-zero if any of the six Decisions was missed.

## What's NOT demonstrated

- **Real provider integration** — the executor wraps `inMemoryPixHandlers`. Replace with your PIX provider client (Mercado Pago, Stripe Brazil, etc.) for production.
- **Real webhook subscription** — Turn 1 transitions to a primed state in-process to keep the demo to a single execution; production wires `agent.resume()` to a real webhook handler.
- **Persistent storage** — uses `createInMemoryDeferStore` and `createInMemoryConfirmationStore`. Production wires Redis (or any KV with NX/EX/INCR/DECR semantics).

## Where to go next

- [`packages/anthropic/README.md`](../../packages/anthropic/README.md) — full agent options + L2 rework callouts
- [`docs/concepts.md`](../../docs/concepts.md) — the framework's mental model
- [`packages/pack-payments-pix/README.md`](../../packages/pack-payments-pix/README.md) — Pack details (intent kinds, taint, thresholds)

## Determinism caveat

Claude is stochastic. The user messages are fixed but the LLM's tool_use payload (or whether it tools-uses at all) varies. The transcript driver verifies that all six Decisions appeared at least once and exits non-zero otherwise — a safety net, not a guarantee. Re-run if a turn drifts; if drift persists, the system prompt in `src/transcript.ts` (`DEMO_BASE_PROMPT`) is the place to harden.
