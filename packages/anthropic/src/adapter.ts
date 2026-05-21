/**
 * `createAdjudicatedAgent` — Anthropic-side thin shim over the
 * provider-neutral adapter-core loop.
 *
 * Everything load-bearing — the tool-use loop, the bridge orchestration,
 * the defer/confirm stores, the audit wiring, the REWRITE handling, the
 * confirmation-blob hash verification — lives in `@adjudicate/adapter-core`.
 *
 * This file does three things and nothing else:
 *   1. Builds a `ProviderBridge<MessageParam[]>` against the Anthropic SDK.
 *   2. Hands the bridge to `createAdjudicatedAgentCore` from adapter-core.
 *   3. Returns the typed agent surface for adopters that expect
 *      `MessageParam[]` history.
 *
 * Invariants the underlying loop preserves are documented in
 * `@adjudicate/adapter-core/loop.ts`.
 */

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  createAdjudicatedAgent as createAdjudicatedAgentCore,
} from "@adjudicate/adapter-core";
import { createAnthropicBridge } from "./bridge-anthropic.js";
import type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
} from "./types.js";

export function createAdjudicatedAgent<K extends string, P, S, C>(
  options: AdjudicatedAgentOptions<K, P, S, C>,
): AdjudicatedAgent<K, P, S, C> {
  const bridge = createAnthropicBridge({
    client: options.anthropicClient,
    model: options.model,
  });

  const agent = createAdjudicatedAgentCore<
    K,
    P,
    S,
    C,
    ReadonlyArray<MessageParam>
  >({
    pack: options.pack,
    renderer: options.renderer,
    bridge,
    deferStore: options.deferStore,
    confirmationStore: options.confirmationStore,
    auditSink: options.auditSink,
    ledger: options.ledger,
    runtimeContext: options.runtimeContext,
    maxIterations: options.maxIterations,
    executor: options.executor,
    rk: options.rk,
    deriveNonce: options.deriveNonce,
    log: options.log,
    verifyParkedHash: options.verifyParkedHash,
  });

  return agent;
}
