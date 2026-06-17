/**
 * Learning-bridge entrypoint (item E). Wires the real `nats` JetStream consumer
 * and `redis` publisher into the testable `runLearningBridge` core.
 *
 * Env:
 *   NATS_URL                  (required) — JetStream server(s)
 *   REDIS_URL                 (required) — console pub/sub Redis
 *   IBX_LEARNING_STREAM       (default `IBX_LEARNING`)
 *   LEARNING_BRIDGE_DURABLE   (default `adjudicate-learning-bridge`)
 *   LEARNING_BRIDGE_SUBJECT   (default `ibatexas.learning.event.v1`)
 */

import { AckPolicy, connect, type NatsConnection } from "nats";
import { createClient } from "redis";
import { LEARNING_EVENT_CHANNEL, LEARNING_EVENT_SUBJECT } from "@adjudicate/core";
import {
  runLearningBridge,
  type BridgeLogger,
  type BridgeMessage,
  type RedisChannelPublisher,
} from "./learning-bridge.js";

const STREAM = process.env.IBX_LEARNING_STREAM ?? "IBX_LEARNING";
const DURABLE = process.env.LEARNING_BRIDGE_DURABLE ?? "adjudicate-learning-bridge";
// The wire subject is `ibatexas.learning.event.v1` (the ibatexas client prepends
// `ibatexas.`), captured by IBX_LEARNING.
const FILTER_SUBJECT =
  process.env.LEARNING_BRIDGE_SUBJECT ?? `ibatexas.${LEARNING_EVENT_SUBJECT}`;

const logger: BridgeLogger = {
  // eslint-disable-next-line no-console -- operator-facing startup/shutdown logs
  info: (m, meta) => console.info(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[learning-bridge] ${name} is required`);
  return v;
}

async function main(): Promise<void> {
  const natsUrl = requireEnv("NATS_URL");
  const redisUrl = requireEnv("REDIS_URL");

  // Redis publisher.
  const redis = createClient({ url: redisUrl });
  redis.on("error", (err) => console.error("[learning-bridge] redis error:", err));
  await redis.connect();
  const publisher: RedisChannelPublisher = {
    publish: (channel, message) => redis.publish(channel, message),
  };

  // NATS JetStream durable consumer.
  const nc: NatsConnection = await connect({ servers: natsUrl });
  const jsm = await nc.jetstreamManager();
  // Idempotently ensure the durable consumer exists. `add` rejects if a consumer
  // with the same name but different config exists — tolerate "already exists".
  try {
    await jsm.consumers.add(STREAM, {
      durable_name: DURABLE,
      ack_policy: AckPolicy.Explicit,
      filter_subject: FILTER_SUBJECT,
    });
  } catch (err) {
    logger.info("[learning-bridge] consumer add skipped (likely already exists)", {
      err: String(err),
    });
  }
  const js = nc.jetstream();
  const consumer = await js.consumers.get(STREAM, DURABLE);
  const messages = await consumer.consume();

  logger.info("[learning-bridge] consuming", {
    stream: STREAM,
    durable: DURABLE,
    subject: FILTER_SUBJECT,
    channel: LEARNING_EVENT_CHANNEL,
  });

  // Adapt nats `JsMsg` into the core's transport-neutral `BridgeMessage`.
  const iterator: AsyncIterable<BridgeMessage> = {
    async *[Symbol.asyncIterator]() {
      for await (const m of messages) {
        yield {
          data: m.data,
          ack: () => m.ack(),
          nak: () => m.nak(),
          term: () => m.term(),
        };
      }
    },
  };

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("[learning-bridge] shutting down");
    try {
      messages.stop();
    } catch {
      /* already stopped */
    }
    try {
      await nc.drain();
    } catch {
      /* best-effort */
    }
    try {
      await redis.quit();
    } catch {
      /* best-effort */
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await runLearningBridge({ messages: iterator, publisher, logger });
}

main().catch((err) => {
  console.error("[learning-bridge] fatal:", err);
  process.exit(1);
});
