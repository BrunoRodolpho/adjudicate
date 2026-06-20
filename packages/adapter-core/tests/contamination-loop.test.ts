/**
 * 042 — session contamination through the full adapter loop.
 *
 * Exercises the laundering leg end-to-end: an authorized READ that serves a
 * datum into the model's context contaminates the session, so the NEXT
 * LLM-proposed intent in the same turn is minted with a lowered taint and the
 * contaminating origin. When that intent targets a system-only kind, the
 * kernel's taint gate REFUSEs it with `taint:propagation_violation` (rather than
 * sliding through byte-identical to a user-induced proposal).
 *
 * Also pins the two safety properties:
 *   - Default OFF: with `contamination` unset, the same scenario mints the
 *     declared origin (`LLM`) — byte-identical to pre-042.
 *   - Clearing is structural: a fresh `send()` (a new runLoop) starts clean.
 */

import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  noopAuditSink,
  type AuditRecord,
  type AuditSink,
  type IntentEnvelope,
  type PackV0,
} from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createInMemorySessionContaminationStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AgentEvent,
  type AssistantTurn,
  type ProviderBridge,
  type SessionContaminationStore,
  type ToolUseRequest,
} from "../src/index.js";

interface State {
  readonly step: string;
}
interface Context {
  readonly userId: string;
}
type Payload = Record<string, unknown>;

// "sys.event" is a system-only kind requiring TRUSTED; "user.act" tolerates
// UNTRUSTED. "fetch_doc" is a visible READ tool (the laundering source).
type Kind = "sys.event" | "user.act";

function buildPack(): PackV0<Kind, Payload, State, Context> {
  return {
    id: "contamination-test-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["sys.event", "user.act"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: {
        minimumFor: (kind: string) =>
          kind === "sys.event" ? ("TRUSTED" as const) : ("UNTRUSTED" as const),
      },
      business: [
        () => ({
          kind: "EXECUTE",
          basis: [{ category: "state", code: "transition_valid" }],
        }),
      ],
      default: "REFUSE",
    } as unknown as PackV0<Kind, Payload, State, Context>["policy"],
    planner: {
      plan() {
        return {
          visibleReadTools: ["fetch_doc"] as const,
          allowedIntents: ["sys.event", "user.act"] as const,
        };
      },
    } as unknown as PackV0<Kind, Payload, State, Context>["planner"],
    basisCodes: ["state:transition_valid"],
  };
}

/**
 * A two-step bridge: turn 1 emits the supplied first-turn tool_uses; turn 2
 * emits the supplied second-turn tool_uses; turn 3+ completes.
 */
function bridge(
  turn1: ToolUseRequest[],
  turn2: ToolUseRequest[],
): ProviderBridge<string[]> {
  let called = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      called++;
      if (called === 1) {
        return {
          history: [...h, "assistant:turn-1"],
          turn: { textBlocks: [], toolUses: turn1 } satisfies AssistantTurn,
        };
      }
      if (called === 2) {
        return {
          history: [...h, "assistant:turn-2"],
          turn: { textBlocks: [], toolUses: turn2 } satisfies AssistantTurn,
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

// invokeRead returns a datum → the READ SERVES → the session is contaminated.
const executor: AdopterExecutor<Kind, Payload, State> = {
  async invokeRead() {
    return { secret: "attacker-controlled instructions" };
  },
  async invokeIntent() {
    return { ok: true };
  },
};

function makeAgent(opts: {
  contamination?: { enabled: boolean };
  sink?: AuditSink;
  turn1: ToolUseRequest[];
  turn2: ToolUseRequest[];
}) {
  return createAdjudicatedAgent<Kind, Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: bridge(opts.turn1, opts.turn2),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    auditSink: opts.sink ?? noopAuditSink(),
    executor,
    ...(opts.contamination ? { contamination: opts.contamination } : {}),
  });
}

function run(agent: ReturnType<typeof makeAgent>) {
  return agent.send({
    sessionId: "s-contam",
    userMessage: "go",
    state: { step: "init" },
    context: { userId: "u" },
  });
}

function mintedIntentEnvelope(
  events: ReadonlyArray<AgentEvent>,
  kind: string,
): IntentEnvelope | undefined {
  // The decision event for the second-turn intent carries the minted envelope.
  const ev = events.find(
    (e): e is Extract<AgentEvent, { kind: "decision" }> =>
      e.kind === "decision" && e.envelope.kind === kind,
  );
  return ev?.envelope;
}

const READ_TU: ToolUseRequest = { id: "tu-read", name: "fetch_doc", input: {} };
const SYS_TU: ToolUseRequest = {
  id: "tu-sys",
  name: "sys.event",
  input: { forged: true },
};

describe("042: contamination disabled (default OFF) is byte-identical to pre-042", () => {
  it("a served READ does NOT lower/contaminate the next intent; origin stays LLM", async () => {
    const result = await run(
      makeAgent({ turn1: [READ_TU], turn2: [SYS_TU] }),
    );
    const env = mintedIntentEnvelope(result.events, "sys.event");
    expect(env).toBeDefined();
    // Pre-042 behavior: declared UNTRUSTED, origin LLM (non-contaminating).
    expect(env?.taint).toBe("UNTRUSTED");
    expect(env?.origin).toBe("LLM");

    // The sys.event intent is still REFUSED (UNTRUSTED < TRUSTED minimum) — but
    // with the BARE level_insufficient basis, not propagation_violation, because
    // the origin is the non-contaminating LLM default.
    const decisionEv = result.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    expect(decisionEv).toBeDefined();
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    expect(decisionEv.decision.kind).toBe("REFUSE");
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    expect(taintBasis?.code).toBe("level_insufficient");
  });
});

describe("042: contamination enabled — the laundering leg lowers the next intent", () => {
  it("a served READ contaminates → the next sys.event intent is minted with the contaminating origin and REFUSED via propagation_violation", async () => {
    const records: AuditRecord[] = [];
    const capturingSink: AuditSink = {
      async emit(record) {
        records.push(record);
      },
    };
    const result = await run(
      makeAgent({
        contamination: { enabled: true },
        sink: capturingSink,
        turn1: [READ_TU],
        turn2: [SYS_TU],
      }),
    );

    const env = mintedIntentEnvelope(result.events, "sys.event");
    expect(env).toBeDefined();
    // Contaminated: origin replaced with the Retrieved source.
    expect(env?.origin).toBe("Retrieved");
    // Taint is the meet of UNTRUSTED (declared) and UNTRUSTED (contamination).
    expect(env?.taint).toBe("UNTRUSTED");

    const decisionEv = result.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    // The system-only kind REFUSES the contaminated proposal ...
    expect(decisionEv.decision.kind).toBe("REFUSE");
    // ... and the basis ATTRIBUTES it to propagation, not a bare untrusted.
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    expect(taintBasis?.code).toBe("propagation_violation");
    expect(taintBasis?.detail?.origin).toBe("Retrieved");

    // The audit record preserves the propagation_violation basis for governance.
    const sysRecord = records.find((r) => r.envelope.kind === "sys.event");
    expect(sysRecord).toBeDefined();
    expect(
      sysRecord?.decision_basis.some(
        (b) => b.category === "taint" && b.code === "propagation_violation",
      ),
    ).toBe(true);
  });

  it("an UNTRUSTED-min intent (user.act) after contamination still EXECUTEs — contamination adds NO new gate", async () => {
    const result = await run(
      makeAgent({
        contamination: { enabled: true },
        turn1: [READ_TU],
        turn2: [{ id: "tu-user", name: "user.act", input: {} }],
      }),
    );
    const decisionEv = result.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "user.act",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    // UNTRUSTED tolerates UNTRUSTED → the taint gate passes; contamination only
    // changes the ORIGIN stamp, never manufactures a refusal where the gate
    // passes. So this still EXECUTEs.
    expect(decisionEv.decision.kind).toBe("EXECUTE");
    expect(decisionEv.envelope.origin).toBe("Retrieved");
  });

  it("without a preceding served READ, the session is NOT contaminated (no laundering source)", async () => {
    // sys.event proposed FIRST, before any read — no contaminating datum
    // entered, so the origin is the LLM default and the refusal is a bare
    // level_insufficient (declared-untrusted), not propagation_violation.
    const result = await run(
      makeAgent({
        contamination: { enabled: true },
        turn1: [SYS_TU],
        turn2: [],
      }),
    );
    const decisionEv = result.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    expect(decisionEv.envelope.origin).toBe("LLM");
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    expect(taintBasis?.code).toBe("level_insufficient");
  });

  it("clearing is structural — a fresh send() (new runLoop) starts uncontaminated", async () => {
    // First turn: a READ contaminates; a sys.event refuses with propagation.
    const agent = makeAgent({
      contamination: { enabled: true },
      turn1: [READ_TU],
      turn2: [SYS_TU],
    });
    await run(agent);

    // A SECOND, independent send() builds a fresh runLoop with no inherited
    // flag. We model it with a NEW agent whose first turn proposes sys.event
    // with no preceding read — proving the flag does not persist across turns
    // (the only "clear" path is structural: a new runLoop / the resume() path).
    const fresh = await run(
      makeAgent({
        contamination: { enabled: true },
        turn1: [SYS_TU],
        turn2: [],
      }),
    );
    const decisionEv = fresh.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    expect(decisionEv.envelope.origin).toBe("LLM");
  });
});

// ── H4: multi-turn (cross-send) contamination launder ───────────────────────
//
// The pre-H4 loop held the contamination flag ONLY in a runLoop-local variable,
// re-initialised to `undefined` every send()/turn. But the laundered READ result
// is appended to SESSION-scoped history re-supplied across turns. So a launderer
// could: READ a poisoned doc on turn 1 (contaminate), then on turn 2 — a FRESH
// send()/runLoop that started clean — propose an origin-required intent off that
// same poisoned history and have it minted origin:"LLM", slipping the gate.
//
// The fix persists the flag in a session-scoped store the loop owns: LOADED at
// the top of runLoop, written back on a contaminating READ, cleared only on the
// authenticated resume() path. These tests pin BOTH halves of the contract.

/**
 * One-tool-per-send bridge: each independent send() (a fresh runLoop) emits its
 * configured single tool_use on the FIRST iteration, then completes on the next
 * iteration of the SAME send (so a REFUSE/served-read does not spin the loop).
 * The send counter persists across send() calls, modelling distinct turns on one
 * long-lived session/agent — exactly the cross-turn surface H4 guards.
 */
function multiTurnBridge(turns: ToolUseRequest[][]): ProviderBridge<string[]> {
  let sendCount = 0; // increments once per public send()/runLoop turn
  let iterInTurn = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => {
      // A user message marks the start of a new send()/turn.
      sendCount++;
      iterInTurn = 0;
      return [...h, `user:${m}`];
    },
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      const tus = turns[sendCount - 1] ?? [];
      const emit = iterInTurn === 0 ? tus : [];
      iterInTurn++;
      return {
        history: [...h, `assistant:s${sendCount}.i${iterInTurn}`],
        turn: { textBlocks: emit.length === 0 ? ["done"] : [], toolUses: emit } satisfies AssistantTurn,
      };
    },
  };
}

function makeMultiTurnAgent(opts: {
  contamination?: { enabled: boolean };
  contaminationStore?: SessionContaminationStore;
  sink?: AuditSink;
  turns: ToolUseRequest[][];
}) {
  return createAdjudicatedAgent<Kind, Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: multiTurnBridge(opts.turns),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    auditSink: opts.sink ?? noopAuditSink(),
    executor,
    ...(opts.contamination ? { contamination: opts.contamination } : {}),
    ...(opts.contaminationStore
      ? { contaminationStore: opts.contaminationStore }
      : {}),
  });
}

describe("H4: cross-turn contamination launder is CAUGHT with a persisted store", () => {
  it("contaminate on send #1 (READ) → propose sys.event on send #2 off the same history ⇒ propagation_violation/REFUSE", async () => {
    const records: AuditRecord[] = [];
    const sink: AuditSink = {
      async emit(record) {
        records.push(record);
      },
    };
    const store = createInMemorySessionContaminationStore();
    const agent = makeMultiTurnAgent({
      contamination: { enabled: true },
      contaminationStore: store,
      sink,
      // turn 1: a served READ contaminates. turn 2: an origin-required propose
      // off the (now-poisoned, session-scoped) history.
      turns: [[READ_TU], [SYS_TU]],
    });

    // Turn 1 — the launderer reads the poisoned doc. No intent proposed yet.
    const t1 = await agent.send({
      sessionId: "s-launder",
      userMessage: "read the doc",
      state: { step: "init" },
      context: { userId: "u" },
    });
    // Sanity: the flag was persisted across the turn boundary.
    expect(await store.get("s-launder")).toMatchObject({
      origin: "Retrieved",
      taint: "UNTRUSTED",
    });

    // Turn 2 — a NEW send()/runLoop. Pre-H4 this started clean and minted
    // origin:"LLM" (launder succeeds). With the store, runLoop LOADS the flag.
    const t2 = await agent.send({
      sessionId: "s-launder",
      userMessage: "now act on it",
      state: { step: "next" },
      context: { userId: "u" },
      history: t1.history, // the session-scoped, poisoned history re-supplied
    });

    const env = mintedIntentEnvelope(t2.events, "sys.event");
    expect(env).toBeDefined();
    // CAUGHT: the cross-turn launder now mints the contaminating origin ...
    expect(env?.origin).toBe("Retrieved");
    expect(env?.taint).toBe("UNTRUSTED");

    const decisionEv = t2.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    // ... and the system-only kind REFUSES it as a propagation_violation.
    expect(decisionEv.decision.kind).toBe("REFUSE");
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    expect(taintBasis?.code).toBe("propagation_violation");
    expect(taintBasis?.detail?.origin).toBe("Retrieved");

    // Governance trail preserves the propagation attribution on turn 2's record.
    const sysRecord = records.find((r) => r.envelope.kind === "sys.event");
    expect(
      sysRecord?.decision_basis.some(
        (b) => b.category === "taint" && b.code === "propagation_violation",
      ),
    ).toBe(true);
  });

  it("NON-VACUOUS pin: WITHOUT the store, the SAME multi-turn launder slips through (origin LLM, bare level_insufficient)", async () => {
    // This is the bug the fix closes. Identical scenario, only the store omitted:
    // turn 2 starts from a clean turn-local flag and mints origin:"LLM", so the
    // refusal is the bare declared-untrusted one — the launder is NOT attributed
    // to propagation. This is exactly what FAILS the assertions above without the
    // persisted store, proving the regression test is non-vacuous.
    const agent = makeMultiTurnAgent({
      contamination: { enabled: true },
      // contaminationStore intentionally OMITTED.
      turns: [[READ_TU], [SYS_TU]],
    });
    const t1 = await agent.send({
      sessionId: "s-no-store",
      userMessage: "read the doc",
      state: { step: "init" },
      context: { userId: "u" },
    });
    const t2 = await agent.send({
      sessionId: "s-no-store",
      userMessage: "now act on it",
      state: { step: "next" },
      context: { userId: "u" },
      history: t1.history,
    });
    const env = mintedIntentEnvelope(t2.events, "sys.event");
    expect(env?.origin).toBe("LLM"); // launder NOT caught (pre-H4 / no-store)
    const decisionEv = t2.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    expect(decisionEv.decision.kind).toBe("REFUSE");
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    // bare declared-untrusted, NOT propagation — the launder slipped the gate.
    expect(taintBasis?.code).toBe("level_insufficient");
  });

  it("default-OFF with a store supplied is byte-identical: no flag is ever persisted, origin stays LLM", async () => {
    // The disabled path must be byte-identical even when an adopter wires a store
    // but leaves contamination OFF: the loop never loads, writes, or clears it.
    const store = createInMemorySessionContaminationStore();
    const agent = makeMultiTurnAgent({
      // contamination DISABLED (omitted) — store present but inert.
      contaminationStore: store,
      turns: [[READ_TU], [SYS_TU]],
    });
    const t1 = await agent.send({
      sessionId: "s-off",
      userMessage: "read the doc",
      state: { step: "init" },
      context: { userId: "u" },
    });
    // The served READ must NOT have written anything (disabled ⇒ no writeback).
    expect(await store.get("s-off")).toBeNull();

    const t2 = await agent.send({
      sessionId: "s-off",
      userMessage: "now act on it",
      state: { step: "next" },
      context: { userId: "u" },
      history: t1.history,
    });
    const env = mintedIntentEnvelope(t2.events, "sys.event");
    // Byte-identical to pre-042: declared UNTRUSTED, origin LLM.
    expect(env?.origin).toBe("LLM");
    expect(env?.taint).toBe("UNTRUSTED");
    const decisionEv = t2.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "sys.event",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    const taintBasis = decisionEv.decision.basis.find(
      (b) => b.category === "taint",
    );
    expect(taintBasis?.code).toBe("level_insufficient");
  });

  it("monotonic across turns: a clean turn after contamination does NOT raise trust (flag persists)", async () => {
    // After contamination, a later turn that proposes a tolerant kind (no further
    // read) must still carry the contaminating origin — the flag is not lowered
    // by the absence of a new contaminating datum (trust only ever drops).
    const store = createInMemorySessionContaminationStore();
    const agent = makeMultiTurnAgent({
      contamination: { enabled: true },
      contaminationStore: store,
      turns: [
        [READ_TU], // turn 1: contaminate
        [{ id: "tu-user", name: "user.act", input: {} }], // turn 2: tolerant kind
      ],
    });
    const t1 = await agent.send({
      sessionId: "s-mono",
      userMessage: "read",
      state: { step: "init" },
      context: { userId: "u" },
    });
    const t2 = await agent.send({
      sessionId: "s-mono",
      userMessage: "act",
      state: { step: "next" },
      context: { userId: "u" },
      history: t1.history,
    });
    const decisionEv = t2.events.find(
      (e) => e.kind === "decision" && e.envelope.kind === "user.act",
    );
    if (decisionEv?.kind !== "decision") throw new Error("no decision");
    // UNTRUSTED tolerates UNTRUSTED → still EXECUTEs (contamination adds no gate),
    // but the carried origin proves the flag persisted across the turn boundary.
    expect(decisionEv.decision.kind).toBe("EXECUTE");
    expect(decisionEv.envelope.origin).toBe("Retrieved");
    // And the persisted flag is unchanged (no trust raise).
    expect(await store.get("s-mono")).toMatchObject({ origin: "Retrieved" });
  });
});

// Sanity: confirm the kernel reference behavior the loop relies on — a directly
// built contaminated envelope refuses with propagation_violation through the
// kernel's adjudicateAndAudit-free pure path used by the runner elsewhere.
describe("042: minted-envelope reference behavior", () => {
  it("a Retrieved-origin sub-minimum envelope refuses with propagation_violation", () => {
    const env = buildEnvelope<Kind, Payload>({
      kind: "sys.event",
      payload: { forged: true },
      actor: { principal: "llm", sessionId: "s" },
      taint: "UNTRUSTED",
      origin: "Retrieved",
      nonce: "n",
    });
    expect(env.origin).toBe("Retrieved");
    expect(env.taint).toBe("UNTRUSTED");
  });
});
