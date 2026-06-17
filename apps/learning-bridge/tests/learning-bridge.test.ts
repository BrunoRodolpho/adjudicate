/**
 * Learning-bridge core (item E) — durable JetStream → Redis re-publish.
 * Exercised with fake messages + publisher (no nats/redis).
 */
import { describe, expect, it, vi } from "vitest";
import {
  decodeLearningEvent,
  runLearningBridge,
  type BridgeMessage,
  type RedisChannelPublisher,
} from "../src/learning-bridge.js";

const encode = (obj: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(obj));

interface FakeMessage extends BridgeMessage {
  acked: boolean;
  naked: boolean;
  termed: boolean;
}

function fakeMessage(data: Uint8Array): FakeMessage {
  const m: FakeMessage = {
    data,
    acked: false,
    naked: false,
    termed: false,
    ack() {
      m.acked = true;
    },
    nak() {
      m.naked = true;
    },
    term() {
      m.termed = true;
    },
  };
  return m;
}

async function* asIterable(msgs: BridgeMessage[]): AsyncIterable<BridgeMessage> {
  for (const m of msgs) yield m;
}

const VALID = {
  schemaVersion: 1,
  at: "2026-06-17T00:00:00.000Z",
  agentId: "pix-remediation",
  sessionId: "agent:pix-remediation@1:entity:order-1",
  kind: "agent.turn",
  decisionKind: "EXECUTE",
};

describe("decodeLearningEvent", () => {
  it("accepts a well-formed schemaVersion-1 event", () => {
    expect(decodeLearningEvent(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("rejects unparseable JSON", () => {
    expect(decodeLearningEvent("{not json")).toBeNull();
  });

  it("rejects a non-object payload", () => {
    expect(decodeLearningEvent("[1,2,3]")).toBeNull();
    expect(decodeLearningEvent("42")).toBeNull();
  });

  it("rejects an unknown schemaVersion", () => {
    expect(decodeLearningEvent(JSON.stringify({ ...VALID, schemaVersion: 2 }))).toBeNull();
    expect(decodeLearningEvent(JSON.stringify({ ...VALID, schemaVersion: undefined }))).toBeNull();
  });
});

describe("runLearningBridge", () => {
  it("re-publishes the RAW payload onto the channel and acks", async () => {
    const raw = JSON.stringify(VALID);
    const msg = fakeMessage(new TextEncoder().encode(raw));
    const publish = vi.fn(async () => 1);
    const publisher: RedisChannelPublisher = { publish };

    await runLearningBridge({
      messages: asIterable([msg]),
      publisher,
      channel: "learning.event.v1",
    });

    expect(publish).toHaveBeenCalledTimes(1);
    // Byte-identical forward — same channel + exact raw payload.
    expect(publish).toHaveBeenCalledWith("learning.event.v1", raw);
    expect(msg.acked).toBe(true);
    expect(msg.naked).toBe(false);
    expect(msg.termed).toBe(false);
  });

  it("TERMs a malformed/unknown-schema message without publishing", async () => {
    const bad = fakeMessage(encode({ ...VALID, schemaVersion: 9 }));
    const publish = vi.fn(async () => 1);

    await runLearningBridge({ messages: asIterable([bad]), publisher: { publish } });

    expect(publish).not.toHaveBeenCalled();
    expect(bad.termed).toBe(true);
    expect(bad.acked).toBe(false);
  });

  it("NAKs (not acks) when the Redis publish fails — JetStream redelivers", async () => {
    const msg = fakeMessage(encode(VALID));
    const publish = vi.fn(async () => {
      throw new Error("redis down");
    });

    await runLearningBridge({ messages: asIterable([msg]), publisher: { publish } });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(msg.naked).toBe(true);
    expect(msg.acked).toBe(false);
    expect(msg.termed).toBe(false);
  });
});
