/**
 * Regression guard (MISS-2): the provider adapter MUST forward the
 * provider-neutral agent-loop seams to adapter-core, or the token-usage
 * telemetry (ADR-120), cross-session memory (ADR-126), config-integrity gate
 * (ADR-121), and trace sink are silently unreachable through this bridge.
 */
import { describe, expect, it, vi } from "vitest";

const { coreSpy } = vi.hoisted(() => ({ coreSpy: vi.fn(() => ({})) }));
vi.mock("@adjudicate/adapter-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adjudicate/adapter-core")>();
  return { ...actual, createAdjudicatedAgent: coreSpy };
});

import { createAdjudicatedAgent } from "../src/adapter.js";

describe("Anthropic adapter forwards the provider-neutral agent-loop seams", () => {
  it("forwards onTokenUsage / memoryStore / enrichContext / deriveMemoryWriteback / configSeal / traceSink", () => {
    coreSpy.mockClear();
    const seams = {
      onTokenUsage: vi.fn(),
      memoryStore: { get: vi.fn(), put: vi.fn() },
      enrichContext: vi.fn(),
      deriveMemoryWriteback: vi.fn(),
      configSeal: { seal: {} },
      traceSink: { emit: vi.fn() },
    };

    createAdjudicatedAgent({
      pack: {} as never,
      anthropicClient: {} as never,
      model: "claude-x",
      maxTokens: 100,
      renderer: {} as never,
      deferStore: {} as never,
      confirmationStore: {} as never,
      ledger: {} as never,
      executor: {} as never,
      ...(seams as never),
    });

    expect(coreSpy).toHaveBeenCalledTimes(1);
    const fwd = coreSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(fwd.onTokenUsage).toBe(seams.onTokenUsage);
    expect(fwd.memoryStore).toBe(seams.memoryStore);
    expect(fwd.enrichContext).toBe(seams.enrichContext);
    expect(fwd.deriveMemoryWriteback).toBe(seams.deriveMemoryWriteback);
    expect(fwd.configSeal).toBe(seams.configSeal);
    expect(fwd.traceSink).toBe(seams.traceSink);
  });
});
