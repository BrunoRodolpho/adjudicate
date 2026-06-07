/**
 * `createAdjudicatedAgent` — OpenAI-side thin shim over the
 * provider-neutral adapter-core loop.
 *
 * Everything load-bearing — tool-use loop, defer/confirm orchestration,
 * audit + ledger wiring, REWRITE handling, confirmation-blob hash
 * verification — lives in `@adjudicate/adapter-core`.
 *
 * This file does three things and nothing else:
 *   1. Builds a `ProviderBridge<OpenAIMessage[]>` against the OpenAI SDK
 *      (or any structurally-compatible client).
 *   2. Hands the bridge to `createAdjudicatedAgentCore` from adapter-core.
 *   3. Returns the typed agent surface for adopters that expect
 *      `OpenAIMessage[]` history.
 */

import {
  createAdjudicatedAgent as createAdjudicatedAgentCore,
} from "@adjudicate/adapter-core";
import { createOpenAIBridge } from "./bridge-openai.js";
import type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
} from "./types.js";

export function createAdjudicatedAgent<K extends string, P, S, C>(
  options: AdjudicatedAgentOptions<K, P, S, C>,
): AdjudicatedAgent<K, P, S, C> {
  const bridge = createOpenAIBridge({
    client: options.openaiClient,
    model: options.model,
  });

  return createAdjudicatedAgentCore({
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
    // Provider-neutral agent-loop seams (ADR-120/121/126) — forwarded so they
    // are actually reachable through the OpenAI bridge.
    onTokenUsage: options.onTokenUsage,
    memoryStore: options.memoryStore,
    enrichContext: options.enrichContext,
    deriveMemoryWriteback: options.deriveMemoryWriteback,
    configSeal: options.configSeal,
    traceSink: options.traceSink,
  });
}
