/**
 * ADR-137 — the seal gate re-verifies per cadence (every_turn default; frozen;
 * {ttlMs}), routes drift through onDrift, and emits a one-time deprecation warn
 * while defaults stay lax (L1). All upstream of adjudicate().
 */
import { describe, expect, it, vi } from "vitest";
import { buildEnvelope, type PackV0 } from "@adjudicate/core";
import { sealPackConfig, type ConfigSealReport, type SealablePackInput } from "@adjudicate/conformance";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
} from "../src/index.js";

interface State { readonly count: number; }
interface Context { readonly userId: string; }
interface Payload { readonly name: string; }

function buildPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "seal-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    signals: [],
    basisCodes: ["state:transition_valid"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [() => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] })],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan: () => ({ visibleReadTools: [] as const, allowedIntents: ["noun.make_pet"] as const }),
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
  };
}

function bridge() {
  const sendSpy = vi.fn(async (h: string[]) => ({
    history: [...h, "assistant:done"],
    turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
  }));
  return {
    sendSpy,
    emptyHistory: () => [],
    appendUserMessage: (h: string[], m: string) => [...h, `user:${m}`],
    appendToolResults: (h: string[], r: unknown[]) => [...h, `tool_results:${r.length}`],
    send: sendSpy,
  } as ProviderBridge<string[]> & { sendSpy: ReturnType<typeof vi.fn> };
}

const renderer = { render: () => ({ systemPrompt: "p", maxTokens: 100, toolSchemas: [] }) };
const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() { return null; },
  async invokeIntent() { return { ok: true }; },
};
const sealable = (): SealablePackInput => buildPack() as unknown as SealablePackInput;
const send = { sessionId: "s", userMessage: "hi", state: { count: 0 }, context: { userId: "u" } };

type ConfigSeal = NonNullable<Parameters<typeof createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>>[0]["configSeal"]>;

function agentWith(configSeal: ConfigSeal, log?: { warn: ReturnType<typeof vi.fn> }) {
  const br = bridge();
  const agent = createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: br,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    configSeal,
    ...(log ? { log } : {}),
  });
  return { agent, bridge: br };
}

describe("config-seal reverify cadence (ADR-137)", () => {
  it("frozen mode: a valid seal proceeds", async () => {
    const { agent, bridge: br } = agentWith({ seal: sealPackConfig(sealable()), reverify: "frozen" });
    expect((await agent.send(send)).outcome.kind).toBe("completed");
    expect(br.sendSpy).toHaveBeenCalled();
  });

  it("frozen mode: a tampered seal refuses", async () => {
    const seal = { ...sealPackConfig(sealable()), digest: "0".repeat(64) };
    const { agent, bridge: br } = agentWith({ seal, reverify: "frozen" });
    expect((await agent.send(send)).outcome.kind).toBe("refused");
    expect(br.sendSpy).not.toHaveBeenCalled();
  });

  it("{ttlMs} mode: a valid seal proceeds", async () => {
    const { agent } = agentWith({ seal: sealPackConfig(sealable()), reverify: { ttlMs: 60_000 } });
    expect((await agent.send(send)).outcome.kind).toBe("completed");
  });

  it("every_turn (default): re-verifies each turn; valid seal proceeds repeatedly", async () => {
    const { agent } = agentWith({ seal: sealPackConfig(sealable()) });
    expect((await agent.send(send)).outcome.kind).toBe("completed");
    expect((await agent.send(send)).outcome.kind).toBe("completed");
  });

  it("onDrift fires with the report on mismatch", async () => {
    const onDrift = vi.fn<(r: ConfigSealReport) => void>();
    const seal = { ...sealPackConfig(sealable()), digest: "0".repeat(64) };
    const { agent } = agentWith({ seal, reverify: "every_turn", onDrift });
    await agent.send(send);
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift.mock.calls[0]![0].verified).toBe(false);
    expect(onDrift.mock.calls[0]![0].digestMatch).toBe("mismatch");
  });

  it("emits a one-time deprecation warning while defaults are lax (L1)", async () => {
    const warn = vi.fn();
    const { agent } = agentWith({ seal: sealPackConfig(sealable()) }, { warn });
    await agent.send(send);
    await agent.send(send);
    const deprecation = warn.mock.calls.filter((c) => String((c[0] as { msg?: string })?.msg ?? "").includes("deprecation"));
    expect(deprecation.length).toBe(1); // once per instance, not per turn
  });
});

// The seal gate previously ran only inside runLoop, so resume()/confirm()
// adjudicated (and committed audit/ledger records) against a never-verified
// policy. These cover the gate now running on those entry points too.
describe("config-seal gate covers resume() and confirm() (ADR-137 hardening)", () => {
  const tamperedSeal = () => ({ ...sealPackConfig(sealable()), digest: "0".repeat(64) });

  it("resume() refuses on a tampered seal — before doing any work", async () => {
    const { agent } = agentWith({ seal: tamperedSeal(), reverify: "every_turn" });
    // No parked envelope exists; pre-fix resume() would have thrown RESUME_NO_PARKED.
    // Post-fix the seal check runs first and refuses cleanly.
    const res = await agent.resume({ sessionId: "s", signal: "sig", state: { count: 0 }, context: { userId: "u" } });
    expect(res.outcome.kind).toBe("refused");
    if (res.outcome.kind === "refused") expect(res.outcome.reason).toBe("config_seal_mismatch");
  });

  it("confirm() refuses on a tampered seal — before adjudicating the pending intent", async () => {
    const store = createInMemoryConfirmationStore<string[]>();
    const envelope = buildEnvelope({
      kind: "noun.make_pet",
      payload: { name: "rex" },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-confirm",
    });
    await store.put(
      "tok-1",
      { envelope, sessionId: "s", assistantHistorySnapshot: [], toolUseId: "tu-1", prompt: "ok?" },
      3600,
    );
    const agent = createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
      pack: buildPack(),
      renderer,
      bridge: bridge(),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: store,
      ledger: createMemoryLedger(),
      executor,
      configSeal: { seal: tamperedSeal(), reverify: "every_turn" },
    });
    const res = await agent.confirm({ confirmationToken: "tok-1", accepted: true, state: { count: 0 }, context: { userId: "u" } });
    expect(res.outcome.kind).toBe("refused");
    if (res.outcome.kind === "refused") expect(res.outcome.reason).toBe("config_seal_mismatch");
  });
});
