/**
 * SignalChannel — a separate, typed in-memory channel for forwarding OFF-PATH
 * signals to Adjutant.
 *
 * The `AuditEventBus` is AuditRecord-only, so adapter-core `AgentEvent`s and
 * `@adjudicate/drift` alerts cannot ride it. The adopter forwards them onto this
 * channel instead. This channel is purely an observation conduit — it never
 * touches a kernel decision; its maximal effect is to surface a signal that the
 * orchestrator turns into a draft envelope for the NORMAL adjudicate() path.
 */

import type { AuditRecord } from "@adjudicate/core";
import type { AuditEventBus } from "@adjudicate/audit";
import type { DriftAlert } from "@adjudicate/drift";

export interface SignalChannel<T> {
  /** Enqueue a signal. Delivered to live subscribers, or buffered if none. */
  push(signal: T): void;
  /** Subscribe; flushes any pre-subscription buffer. Returns the unsubscribe. */
  subscribe(handler: (signal: T) => void): () => void;
  /** Pull-drain the buffered (un-delivered) signals, clearing the buffer. */
  drain(): ReadonlyArray<T>;
}

export function createSignalChannel<T>(): SignalChannel<T> {
  const handlers = new Set<(signal: T) => void>();
  const buffer: T[] = [];
  return {
    push(signal) {
      if (handlers.size === 0) {
        buffer.push(signal);
        return;
      }
      for (const h of handlers) h(signal);
    },
    subscribe(handler) {
      handlers.add(handler);
      if (buffer.length > 0) {
        const pending = buffer.splice(0, buffer.length);
        for (const s of pending) handler(s);
      }
      return () => {
        handlers.delete(handler);
      };
    },
    drain() {
      return buffer.splice(0, buffer.length);
    },
  };
}

/**
 * Subscribe a SignalChannel to an AuditEventBus, mapping each AuditRecord to a
 * signal (or null to ignore). Returns the unsubscribe. The bus stays
 * AuditRecord-only; the mapping is the adopter's off-path projection.
 */
export function auditBusToSignal<T>(
  bus: AuditEventBus,
  channel: SignalChannel<T>,
  map: (record: AuditRecord) => T | null,
): () => void {
  return bus.subscribe((record) => {
    const signal = map(record);
    if (signal !== null) channel.push(signal);
  });
}

/**
 * Build an `onDrift` callback (to pass to `createDriftDetector({ onDrift })`)
 * that maps each DriftAlert to a signal and pushes it onto the channel. Drift is
 * an off-path observer; the resulting signal may later become an ESCALATE via
 * the kernel — never a direct decision.
 */
export function driftToSignal<T>(
  channel: SignalChannel<T>,
  map: (alert: DriftAlert) => T | null,
): (alert: DriftAlert) => void {
  return (alert) => {
    const signal = map(alert);
    if (signal !== null) channel.push(signal);
  };
}
