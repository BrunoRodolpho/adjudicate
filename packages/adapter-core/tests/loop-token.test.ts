/**
 * SecurityReviewer-003 — the loop's confirmation-token generator must never
 * fall back to Math.random(). When `crypto.randomUUID` is unavailable it must
 * throw a hard, actionable error rather than mint a predictable single-use
 * credential.
 *
 * This drives the PUBLIC agent surface so it exercises the actual inline
 * `generateToken` closure in `loop.ts` (it is not separately exported): a
 * pack that yields REQUEST_CONFIRMATION forces the loop to call the closure.
 */

import { afterEach, describe, expect, it } from "vitest";
import { type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
  type ToolUseRequest,
} from "../src/index.js";

interface State {
  readonly count: number;
}
interface Context {
  readonly userId: string;
}
interface Payload {
  readonly name: string;
}

/** Pack whose business guard always returns REQUEST_CONFIRMATION. */
function buildConfirmPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "token-test-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      // Real TaintPolicy so adjudication reaches the business guard (which
      // returns REQUEST_CONFIRMATION) instead of panicking in the taint phase.
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [
        () => ({
          kind: "REQUEST_CONFIRMATION",
          prompt: "Confirm?",
          basis: [{ category: "state", code: "transition_valid" }],
        }),
      ],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan() {
        return {
          visibleReadTools: [] as const,
          allowedIntents: ["noun.make_pet"] as const,
        };
      },
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
    basisCodes: ["state:transition_valid"],
  };
}

function bridge(toolUses: ToolUseRequest[]): ProviderBridge<string[]> {
  let called = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      called++;
      if (called === 1 && toolUses.length > 0) {
        return {
          history: [...h, "assistant:turn-1"],
          turn: { textBlocks: [], toolUses } satisfies AssistantTurn,
        };
      }
      return {
        history: [...h, "assistant:done"],
        turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
      };
    },
  };
}

const renderer = {
  render() {
    return { systemPrompt: "p", maxTokens: 100, toolSchemas: [] };
  },
};

const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

function makeAgent() {
  return createAdjudicatedAgent<
    "noun.make_pet",
    Payload,
    State,
    Context,
    string[]
  >({
    pack: buildConfirmPack(),
    renderer,
    bridge: bridge([{ id: "tu-1", name: "noun.make_pet", input: { name: "rex" } }]),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
  });
}

const send = () =>
  makeAgent().send({
    sessionId: "s-token",
    userMessage: "do it",
    state: { count: 0 },
    context: { userId: "u" },
  });

describe("loop confirmation-token generator (SecurityReviewer-003)", () => {
  const savedCrypto = globalThis.crypto;
  afterEach(() => {
    // Restore the real crypto after each case.
    Object.defineProperty(globalThis, "crypto", {
      value: savedCrypto,
      configurable: true,
      writable: true,
    });
  });

  it("throws when crypto.randomUUID is unavailable (no Math.random fallback)", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    await expect(send()).rejects.toThrow("crypto.randomUUID is unavailable");
  });

  it("throws when crypto exists but randomUUID is not a function", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: {} as Crypto,
      configurable: true,
      writable: true,
    });
    await expect(send()).rejects.toThrow("crypto.randomUUID is unavailable");
  });

  it("mints a real UUID token via the confirmation pause when crypto is present", async () => {
    // crypto is the real one here (afterEach restores it; default env has it).
    const result = await send();
    expect(result.outcome.kind).toBe("awaiting_confirmation");
    if (result.outcome.kind === "awaiting_confirmation") {
      // The token is a real crypto.randomUUID() — RFC-4122 v4 shape, NOT the
      // old `ct-...` Math.random fallback.
      expect(result.outcome.confirmationToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.outcome.confirmationToken).not.toMatch(/^ct-/);
    }
  });
});
