/**
 * NatsSink — streaming governance trail.
 *
 * Publishes each AuditRecord to a stable NATS subject. Adopters wire their
 * own NATS publisher behind the `NatsPublisher` interface — the IbateXas
 * adopter passes a wrapper around its `publishNatsEvent()`. Framework-
 * agnostic: any pub/sub system that accepts (subject, payload) works.
 *
 * **Circuit breaker** (P0-g + T3 half-open close):
 *
 *   - **closed** (normal): each emit attempts publish; success resets the
 *     consecutive-failure counter; failure increments it. On reaching
 *     `failureThreshold`, transition to **open** and throw `NatsSinkError`.
 *   - **open**: the breaker has tripped. The next emit attempt transitions
 *     to **half-open** and tries publish. Success → **closed** (counter
 *     resets); failure → throw `NatsSinkError` immediately and stay open.
 *   - **half-open**: a single in-flight test. Either success (close) or
 *     failure (re-open with one strike).
 *
 * Pre-T3 the post-trip behaviour reset the counter to 0 and required N more
 * consecutive failures before the next throw — a 9-failure blind spot under
 * sustained outage that masked invisible audit loss. The half-open transition
 * eliminates that window: every emit during a sustained outage now throws.
 */

import type { AuditRecord } from "@adjudicate/core";
import type { AuditSink } from "./sink.js";

export interface NatsPublisher {
  publish(subject: string, payload: unknown): Promise<void>;
}

export interface NatsSinkOptions {
  readonly publisher: NatsPublisher;
  /** Defaults to "audit.intent.decision.v1". */
  readonly subject?: string;
  /**
   * Consecutive failures before NatsSinkError is thrown. Default 10 — small
   * enough to fail loud quickly, large enough to absorb transient NATS hiccups.
   */
  readonly failureThreshold?: number;
  /**
   * Optional callback fired on each failure (so the caller can route into
   * Sentry/console without the sink itself depending on those packages).
   */
  readonly onFailure?: (event: NatsSinkFailureEvent) => void;
}

export interface NatsSinkFailureEvent {
  readonly subject: string;
  readonly errorClass: string;
  readonly consecutiveFailures: number;
}

export class NatsSinkError extends Error {
  constructor(
    public readonly subject: string,
    public readonly consecutiveFailures: number,
    public readonly cause: Error,
  ) {
    super(
      `NatsSink tripped after ${consecutiveFailures} consecutive failures on subject "${subject}"`,
    );
    this.name = "NatsSinkError";
  }
}

const DEFAULT_FAILURE_THRESHOLD = 10;

type BreakerState = "closed" | "open" | "half-open";

export function createNatsSink(opts: NatsSinkOptions): AuditSink {
  const subject = opts.subject ?? "audit.intent.decision.v1";
  const threshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  let consecutiveFailures = 0;
  let state: BreakerState = "closed";

  function fail(error: Error): void {
    consecutiveFailures++;
    opts.onFailure?.({
      subject,
      errorClass: error.name,
      consecutiveFailures,
    });
  }

  return {
    async emit(record: AuditRecord) {
      // ── Open circuit: transition to half-open and let one through ──────
      if (state === "open") {
        state = "half-open";
      }

      try {
        await opts.publisher.publish(subject, record);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Half-open path: a single test failed. Re-open and throw NatsSinkError
        // immediately so every emit during sustained outage is loud.
        if (state === "half-open") {
          fail(error);
          state = "open";
          const failuresSnapshot = consecutiveFailures;
          throw new NatsSinkError(subject, failuresSnapshot, error);
        }

        // Closed path: count up; trip when threshold reached.
        fail(error);
        if (consecutiveFailures >= threshold) {
          state = "open";
          const failuresAtTrip = consecutiveFailures;
          throw new NatsSinkError(subject, failuresAtTrip, error);
        }
        // Below threshold — surface the original error so multiSink's
        // Promise.allSettled records the failure.
        throw error;
      }

      // ── Success ──────────────────────────────────────────────────────
      // Whether closed or half-open, a success resets the breaker to closed.
      consecutiveFailures = 0;
      state = "closed";
    },
  };
}
