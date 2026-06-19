/**
 * AuthReviewer-003 — `resume()` must build a kernel-accepted envelope.
 *
 * The resume handler elevates the parked envelope to `{actor: system, taint:
 * TRUSTED}`. Before the fix it copied the STALE parked `intentHash` into the
 * new envelope; the kernel re-derives the hash from the elevated fields
 * (`buildEnvelope` recipe) and refused every resume with
 * `SECURITY / intent_hash_mismatch`. The fix builds the envelope via
 * `buildEnvelope` (hash matches the elevated fields) and wires a
 * `supersedes: { reason: "defer_resumed" }` audit link back to the parked
 * intent.
 */

import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  type AuditRecord,
  type AuditSink,
  type IntentEnvelope,
  type PackV0,
} from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
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

/** Same hand-rolled pack shape as trace.test.ts — always EXECUTE. */
function buildPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "resume-test-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      // Real TaintPolicy: UNTRUSTED minimum means any taint (incl. the
      // resume envelope's TRUSTED) is allowed to propose — so adjudication
      // reaches the business guard rather than panicking in the taint phase.
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [
        () => ({
          kind: "EXECUTE",
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

/** A bridge that immediately completes (no further tool_use after the seed). */
function bridge(): ProviderBridge<string[]> {
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
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

/** Captures every AuditRecord the kernel emits during a turn. */
function capturingSink(): AuditSink & { records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return {
    records,
    async emit(record) {
      records.push(record);
    },
  };
}

const SESSION = "s-resume";
const SIGNAL = "payment.confirmed";

/**
 * Build a strict-verifiable parked envelope and persist it into a deferStore
 * exactly as `parkDeferredIntent` would (key + hash-verification fields), so
 * the resume path's default `verifyHash: "strict"` check passes and we
 * isolate the AuthReviewer-003 bug (the NEW resume envelope's hash).
 */
function makeParkedStore() {
  const deferStore = createInMemoryDeferStore();
  // The ORIGINAL intent: untrusted, llm-proposed (the pre-resume shape).
  const parkedEnvelope: IntentEnvelope<"noun.make_pet", Payload> = buildEnvelope({
    kind: "noun.make_pet",
    payload: { name: "rex" },
    nonce: "nonce-original",
    actor: { principal: "llm", sessionId: SESSION },
    taint: "UNTRUSTED",
    createdAt: "2026-05-31T00:00:00.000Z",
  });
  const parkedAt = "2026-05-31T00:00:01.000Z";
  // Serialise like parkDeferredIntent: include T-005 hash-verification fields
  // plus the 041 `origin` field (now part of the intentHash recipe).
  const blob = JSON.stringify({
    envelope: {
      intentHash: parkedEnvelope.intentHash,
      kind: parkedEnvelope.kind,
      actor: { sessionId: SESSION },
      payload: parkedEnvelope.payload,
      version: parkedEnvelope.version,
      nonce: parkedEnvelope.nonce,
      taint: parkedEnvelope.taint,
      actorPrincipal: parkedEnvelope.actor.principal,
      origin: parkedEnvelope.origin,
    },
    signal: SIGNAL,
    parkedAt,
  });
  return { deferStore, blob, parkedEnvelope, parkedAt };
}

describe("resume() — AuthReviewer-003", () => {
  it("produces a kernel-accepted envelope (no intent_hash_mismatch refusal)", async () => {
    const { deferStore, blob } = makeParkedStore();
    await deferStore.set(`defer:pending:${SESSION}`, blob, { EX: 3600 });

    const sink = capturingSink();
    const agent = createAdjudicatedAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildPack(),
      renderer,
      bridge: bridge(),
      deferStore,
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor,
      auditSink: sink,
    });

    const result = await agent.resume({
      sessionId: SESSION,
      signal: SIGNAL,
      state: { count: 0 },
      context: { userId: "u" },
    });

    // The seeded resume decision must NOT be a SECURITY refusal for a stale
    // hash — that was the bug. Find the decision events emitted on the turn.
    const decisionEvents = result.events.filter((e) => e.kind === "decision");
    expect(decisionEvents.length).toBeGreaterThan(0);
    for (const evt of decisionEvents) {
      const d = (evt as { decision: { kind: string; refusal?: { code?: string } } })
        .decision;
      if (d.kind === "REFUSE") {
        expect(d.refusal?.code).not.toBe("intent_hash_mismatch");
      }
    }

    // With the always-EXECUTE pack, the resumed envelope adjudicates to EXECUTE.
    const seededDecision = (
      decisionEvents[0] as { decision: { kind: string } }
    ).decision;
    expect(seededDecision.kind).toBe("EXECUTE");
  });

  it("wires a defer_resumed supersession link to the original parked intent", async () => {
    const { deferStore, blob, parkedEnvelope } = makeParkedStore();
    await deferStore.set(`defer:pending:${SESSION}`, blob, { EX: 3600 });

    const sink = capturingSink();
    const agent = createAdjudicatedAgent<
      "noun.make_pet",
      Payload,
      State,
      Context,
      string[]
    >({
      pack: buildPack(),
      renderer,
      bridge: bridge(),
      deferStore,
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor,
      auditSink: sink,
    });

    await agent.resume({
      sessionId: SESSION,
      signal: SIGNAL,
      state: { count: 0 },
      context: { userId: "u" },
    });

    // The resume adjudication emits an AuditRecord carrying the supersession.
    const resumeRecord = sink.records.find(
      (r) => r.supersedes?.reason === "defer_resumed",
    );
    expect(resumeRecord).toBeDefined();
    expect(resumeRecord!.supersedes!.predecessorIntentHash).toBe(
      parkedEnvelope.intentHash,
    );
    // The NEW envelope's hash differs from the parked one (it reflects the
    // elevated actor/taint) — content-addressing for a distinct event.
    expect(resumeRecord!.envelope.intentHash).not.toBe(parkedEnvelope.intentHash);
    expect(resumeRecord!.envelope.actor.principal).toBe("system");
    expect(resumeRecord!.envelope.taint).toBe("TRUSTED");
  });
});
