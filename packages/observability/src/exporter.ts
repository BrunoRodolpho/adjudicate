/**
 * Exporter — the single seam through which `@adjudicate/observability` emits
 * events. Consumers wire this to an OpenTelemetry-backed exporter (OTLP/proto,
 * OTLP/http, the gRPC SDK) at boot. Tests inject `createInMemoryExporter()`.
 *
 * Why a custom interface rather than `@opentelemetry/sdk-trace-base`'s
 * `SpanExporter` directly:
 *
 *   - Metrics, learning events, and audit spans share a single funnel. A
 *     single `export(event)` keeps the three sinks behind a uniform contract
 *     and lets adopters install one transport for the whole subsystem.
 *
 *   - The OpenTelemetry packages are not pinned by this package — we declare
 *     `@opentelemetry/api ^1.9.0` as a runtime dep so consumers control the
 *     trace/metric SDK choice. Pinning the full SDK here would force every
 *     adopter onto our version.
 *
 *   - Kernel determinism is sacred. By funneling through this interface,
 *     observability never reaches into the kernel — it only receives copies
 *     of events the kernel already emitted via its existing sinks.
 */

import type { SEMCONV } from "./semconv.js";

/**
 * Event categories emitted by the three sinks. Carried as a discriminant so a
 * single exporter can route per-kind (e.g. metrics → meter, spans → tracer).
 */
export type ExportedEventKind =
  | "metrics.decision"
  | "metrics.refusal"
  | "metrics.ledger"
  | "metrics.sink_failure"
  | "metrics.shadow_divergence"
  | "metrics.resource_limit"
  | "learning.outcome"
  | "learning.catch"
  | "audit.span";

/**
 * One observability emission. Attributes carry the wire-shape an OTLP
 * exporter would use; the `name` field is the metric name or span name.
 * `body` is reserved for events with structured payloads (e.g., the full
 * AuditRecord — exporters may strip or sample it).
 */
export interface ExportedEvent {
  readonly kind: ExportedEventKind;
  readonly name: string;
  readonly at: string;
  readonly attributes: Readonly<
    Record<(typeof SEMCONV)[keyof typeof SEMCONV] | string, string | number | boolean | undefined>
  >;
  /** Optional structured body — present only on `audit.span` and `learning.outcome`. */
  readonly body?: unknown;
}

/**
 * The single seam. Implementations MUST NOT throw — observability is best-
 * effort, never a customer outage. Synchronous so the kernel-adjacent sinks
 * stay non-async; real OTLP transports buffer internally and flush off the
 * hot path.
 */
export interface Exporter {
  export(event: ExportedEvent): void;
}

/**
 * In-memory test exporter. Captures every event into a mutable array so
 * tests can assert "the right events were emitted with the right semconv
 * attributes." Returned alongside its event buffer so the test doesn't
 * have to read out of an opaque handle.
 */
export interface InMemoryExporter {
  readonly exporter: Exporter;
  readonly events: ExportedEvent[];
}

export function createInMemoryExporter(): InMemoryExporter {
  const events: ExportedEvent[] = [];
  const exporter: Exporter = {
    export(event) {
      events.push(event);
    },
  };
  return { exporter, events };
}

/**
 * No-op exporter. Useful when an adopter wants to wire up the sinks early
 * (e.g., during boot, before the OTLP transport is configured) without
 * paying for any allocation. Production deployments should NOT install
 * this — emission would be silent.
 */
export function noopExporter(): Exporter {
  return {
    export() {
      /* intentional no-op */
    },
  };
}
