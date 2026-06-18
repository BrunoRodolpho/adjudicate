/**
 * `createQuickAgent` — a fewer-stores-boilerplate convenience over
 * `createAdjudicatedAgent`.
 *
 * What it does: pre-fills the three pieces of persistence every agent needs
 * in development — the in-memory DEFER/park store, the in-memory
 * REQUEST_CONFIRMATION store, and the in-memory Execution Ledger — and wires
 * a `createConsoleSink` dev receipt sink by default. Adopters who would
 * otherwise hand-construct all four for a local run write less boilerplate.
 *
 * What it does NOT do (honest framing): this is NOT a "5-line agent". It is
 * NOT a second blessed execution path. `executor`, `renderer`, `bridge`
 * (the model/provider binding), and `maxTokens` (carried on each
 * `renderer.render(...)` result) all stay REQUIRED — the caller still
 * supplies them. The factory delegates to `createAdjudicatedAgent`
 * VERBATIM: the loop, kernel crossing, audit, and ledger guarantees are
 * exactly those of the underlying agent. It only saves store/sink wiring.
 *
 * Why it lives in `@adjudicate/adapter-core`: this is the one package that
 * already imports all three collaborators without a new dependency or a
 * layering inversion — `createAdjudicatedAgent` (./loop), the in-memory
 * stores (./persistence), and both `createMemoryLedger` + `createConsoleSink`
 * from `@adjudicate/audit` (already an adapter-core dependency; see
 * package.json). Putting it anywhere else (e.g. a leaf example or the CLI)
 * would force a new dependency edge or duplicate the store wiring.
 *
 * Defaults are for DEVELOPMENT only. The in-memory stores lack persistence,
 * fan-out, and cross-process coordination; the console sink is a dev
 * receipt log. Production adopters call `createAdjudicatedAgent` directly
 * with Redis-backed stores and a durable sink, or pass production stores in
 * here as overrides.
 */

import {
  createConsoleSink,
  createMemoryLedger,
  type ConsoleSinkOptions,
} from "@adjudicate/audit";
import { createAdjudicatedAgent } from "./loop.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "./persistence.js";
import type { AdjudicatedAgent, AdjudicatedAgentOptions } from "./types.js";

/**
 * The fields `createQuickAgent` pre-fills. Each is OPTIONAL here (the
 * factory supplies an in-memory / console default) but every one may be
 * overridden — pass a Redis-backed store or a durable sink to opt out of
 * the dev default without leaving this entry point.
 *
 * Everything else from `AdjudicatedAgentOptions` (notably the REQUIRED
 * `pack`, `renderer`, `bridge`, and `executor`) passes through unchanged.
 */
export type QuickAgentOptions<K extends string, P, S, C, H> = Omit<
  AdjudicatedAgentOptions<K, P, S, C, H>,
  "deferStore" | "confirmationStore" | "ledger" | "auditSink"
> & {
  /** Override the DEFER/park store. Defaults to `createInMemoryDeferStore()`. */
  readonly deferStore?: AdjudicatedAgentOptions<K, P, S, C, H>["deferStore"];
  /**
   * Override the confirmation store. Defaults to
   * `createInMemoryConfirmationStore<H>()`.
   */
  readonly confirmationStore?: AdjudicatedAgentOptions<
    K,
    P,
    S,
    C,
    H
  >["confirmationStore"];
  /** Override the Execution Ledger. Defaults to `createMemoryLedger()`. */
  readonly ledger?: AdjudicatedAgentOptions<K, P, S, C, H>["ledger"];
  /**
   * Override the audit sink. Defaults to a `createConsoleSink()` dev receipt
   * sink. 013/T1: the underlying `AdjudicatedAgentOptions.auditSink` is REQUIRED
   * — there is no longer a "disable the sink" path (that was a fail-open seam,
   * invariant #6). To silence emission in a dev run, pass an explicit no-op sink
   * (`noopAuditSink()`) so the choice is visible, never a silent default.
   */
  readonly auditSink?: AdjudicatedAgentOptions<K, P, S, C, H>["auditSink"];
  /**
   * Options forwarded to the default `createConsoleSink` (e.g. a custom
   * `log` writer or `prefix`). Ignored when `auditSink` is supplied.
   */
  readonly consoleSink?: ConsoleSinkOptions;
};

/**
 * Build an `AdjudicatedAgent` with in-memory stores and a console receipt
 * sink pre-wired. Delegates to `createAdjudicatedAgent` — same loop, same
 * guarantees.
 */
export function createQuickAgent<K extends string, P, S, C, H>(
  options: QuickAgentOptions<K, P, S, C, H>,
): AdjudicatedAgent<K, P, S, C, H> {
  const {
    deferStore,
    confirmationStore,
    ledger,
    auditSink,
    consoleSink,
    ...rest
  } = options;

  // 013/T1: the AuditSink is required — always resolve to a real sink (the dev
  // console receipt sink by default). No fail-open "no sink" branch.
  const resolvedSink = auditSink ?? createConsoleSink(consoleSink);

  return createAdjudicatedAgent<K, P, S, C, H>({
    ...rest,
    deferStore: deferStore ?? createInMemoryDeferStore(),
    confirmationStore:
      confirmationStore ?? createInMemoryConfirmationStore<H>(),
    ledger: ledger ?? createMemoryLedger(),
    auditSink: resolvedSink,
  });
}
