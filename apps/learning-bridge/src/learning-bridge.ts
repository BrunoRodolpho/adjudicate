/**
 * Learning-bridge core (item E) — durable JetStream → Redis re-publisher.
 *
 * The ibatexas runtime publishes each learning decision on TWO arms: the
 * `IBX_LEARNING` JetStream stream (durable, 30-day) AND the `learning.event.v1`
 * Redis channel (lossy live-tail). The adjudicate console only ever subscribed
 * to the lossy Redis arm, so any event published while a console replica was
 * down was lost forever (UltraReview #94-19 / #28-12).
 *
 * This worker closes that gap WITHOUT pushing a JetStream client into the
 * Next.js console (no reliable long-lived context there): it durably consumes
 * `IBX_LEARNING` and re-publishes each event onto the SAME Redis channel the
 * console already tails. The console gains gap-free history for free, and the
 * durable cursor only advances once the re-publish succeeds (at-least-once).
 *
 * # Determinism boundary — unchanged
 *
 * Learning telemetry lives OUTSIDE the kernel determinism boundary. This worker
 * forwards opaque, already-redacted payloads; it never adjudicates, and the
 * kernel never reads the bus.
 *
 * # Testability
 *
 * The core (`runLearningBridge`) takes injected message + publisher seams — it
 * has NO `nats`/`redis` import, so it is unit-testable with fakes. The real
 * client wiring lives in `./index.ts`.
 *
 * # Prod prerequisite
 *
 * Gap-free history is only realized once the prod NATS JetStream store is
 * durable across redeploys — ibatexas PR #95 (EFS for the `store_dir`). Before
 * that `terraform apply` runs, this worker still consumes correctly but reads a
 * stream that itself loses history on each redeploy.
 */

import {
  LEARNING_EVENT_CHANNEL,
  LEARNING_EVENT_SCHEMA_VERSION,
  type LearningEventV1,
} from "@adjudicate/core";

/**
 * One durable JetStream message. Models the subset of `nats`'s `JsMsg` the
 * bridge uses, so the core needs no `nats` dependency.
 */
export interface BridgeMessage {
  /** Raw message bytes — the exact JSON the ibatexas runtime published. */
  readonly data: Uint8Array;
  /** Acknowledge a successful re-publish (advances the durable cursor). */
  ack(): void;
  /** Negative-ack: request redelivery after ack_wait (transient downstream fault). */
  nak(): void;
  /** Terminate: never redeliver this poison message (malformed / unknown schema). */
  term(): void;
}

/** Minimal Redis publish surface (node-redis `publish` satisfies it). */
export interface RedisChannelPublisher {
  publish(channel: string, message: string): Promise<number>;
}

export interface BridgeLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

const textDecoder = new TextDecoder();

/**
 * Decode + schema-guard a raw learning message. Returns `null` for anything
 * unparseable or whose `schemaVersion` isn't the one we understand — the caller
 * TERMs those so a poison payload never wedges the durable cursor.
 */
export function decodeLearningEvent(raw: string): LearningEventV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  if (
    (parsed as { schemaVersion?: unknown }).schemaVersion !==
    LEARNING_EVENT_SCHEMA_VERSION
  ) {
    return null;
  }
  return parsed as LearningEventV1;
}

export interface RunLearningBridgeOptions {
  /** Durable JetStream messages (an `AsyncIterable` of {@link BridgeMessage}). */
  readonly messages: AsyncIterable<BridgeMessage>;
  /** Redis publisher to fan each event onto the console channel. */
  readonly publisher: RedisChannelPublisher;
  /** Redis channel to re-publish onto. Default `learning.event.v1`. */
  readonly channel?: string;
  readonly logger?: BridgeLogger;
}

/**
 * Drain the durable messages, re-publishing each valid event onto the Redis
 * channel the console SSE bus subscribes to:
 *   - valid event   → publish the RAW bytes (byte-identical to the live arm), ack
 *   - publish failed → NAK (JetStream redelivers — keeps at-least-once)
 *   - malformed/bad schema → TERM (never redeliver a poison message)
 *
 * Returns when the message iterator is exhausted (e.g. on shutdown).
 */
export async function runLearningBridge(
  opts: RunLearningBridgeOptions,
): Promise<void> {
  const channel = opts.channel ?? LEARNING_EVENT_CHANNEL;
  const log = opts.logger;
  for await (const m of opts.messages) {
    const raw = textDecoder.decode(m.data);
    const event = decodeLearningEvent(raw);
    if (event === null) {
      log?.warn("[learning-bridge] dropping malformed/unknown-schema message", {
        preview: raw.slice(0, 200),
      });
      m.term();
      continue;
    }
    try {
      // Forward the RAW payload so the console receives the byte-identical event
      // it would have from the live Redis arm.
      await opts.publisher.publish(channel, raw);
      m.ack();
    } catch (err) {
      log?.warn("[learning-bridge] redis publish failed — nak for redelivery", {
        err: String(err),
      });
      m.nak();
    }
  }
}
