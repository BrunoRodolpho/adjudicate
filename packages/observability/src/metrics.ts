/**
 * OTLP-shaped MetricsSink.
 *
 * Wraps `@adjudicate/core/kernel`'s `MetricsSink` contract and emits one
 * `ExportedEvent` per call. The events carry the semantic conventions defined
 * in `semconv.ts`, so an OTLP exporter can map them onto OpenTelemetry meters
 * without losing the kernel's shape.
 *
 * Adopter wiring:
 *
 *     import { setMetricsSink } from "@adjudicate/core/kernel";
 *     import { createOtlpMetricsSink } from "@adjudicate/observability";
 *
 *     setMetricsSink(createOtlpMetricsSink({ exporter: yourOtlpExporter }));
 *
 * The sink itself does no transport — it pushes events into the injected
 * `Exporter`. Real OTLP traffic happens in the adopter-owned exporter.
 */

import type { MetricsSink } from "@adjudicate/core/kernel";
import type { Exporter, ExportedEvent } from "./exporter.js";
import { SEMCONV } from "./semconv.js";

export interface OtlpMetricsSinkOptions {
  readonly exporter: Exporter;
  /** Optional clock — tests inject a fake. */
  readonly clockIso?: () => string;
  /** Optional Pack identifier stamped on every event. */
  readonly packId?: string;
  /** Optional Pack policy version stamped on every event. */
  readonly policyVersion?: string;
}

export function createOtlpMetricsSink(opts: OtlpMetricsSinkOptions): MetricsSink {
  const clockIso = opts.clockIso ?? (() => new Date().toISOString());
  const stamp = stampFactory(opts);

  return {
    recordLedgerOp(event) {
      const exported: ExportedEvent = {
        kind: "metrics.ledger",
        name: `adjudicate.ledger.${event.op}`,
        at: clockIso(),
        attributes: stamp({
          "adjudicate.ledger.op": event.op,
          "adjudicate.ledger.outcome": event.outcome,
          [SEMCONV.INTENT_KIND]: event.intentKind,
          [SEMCONV.LATENCY_MS]: event.latencyMs,
        }),
      };
      safeExport(opts.exporter, exported);
    },
    recordDecision(event) {
      const exported: ExportedEvent = {
        kind: "metrics.decision",
        name: "adjudicate.decision",
        at: clockIso(),
        attributes: stamp({
          [SEMCONV.INTENT_KIND]: event.intentKind,
          [SEMCONV.DECISION_KIND]: event.decision,
          [SEMCONV.LATENCY_MS]: event.latencyMs,
          "adjudicate.basis.count": event.basisCount,
          [SEMCONV.INTENT_HASH]: event.intentHash,
        }),
      };
      safeExport(opts.exporter, exported);
    },
    recordRefusal(event) {
      const exported: ExportedEvent = {
        kind: "metrics.refusal",
        name: "adjudicate.refusal",
        at: clockIso(),
        attributes: stamp({
          [SEMCONV.INTENT_KIND]: event.intentKind,
          "adjudicate.refusal.kind": event.refusal.kind,
          "adjudicate.refusal.code": event.refusal.code,
          [SEMCONV.INTENT_HASH]: event.intentHash,
        }),
      };
      safeExport(opts.exporter, exported);
    },
    recordSinkFailure(event) {
      const exported: ExportedEvent = {
        kind: "metrics.sink_failure",
        name: "adjudicate.sink_failure",
        at: clockIso(),
        attributes: stamp({
          "adjudicate.sink": event.sink,
          "adjudicate.sink.subject": event.subject,
          "adjudicate.sink.error_class": event.errorClass,
          "adjudicate.sink.consecutive_failures": event.consecutiveFailures,
        }),
      };
      safeExport(opts.exporter, exported);
    },
    recordShadowDivergence(event) {
      const exported: ExportedEvent = {
        kind: "metrics.shadow_divergence",
        name: "adjudicate.shadow_divergence",
        at: clockIso(),
        attributes: stamp({
          [SEMCONV.INTENT_KIND]: event.intentKind,
          "adjudicate.shadow.divergence": event.divergence,
          "adjudicate.shadow.legacy": event.legacy.kind,
          [SEMCONV.DECISION_KIND]: event.adjudicate.kind,
        }),
      };
      safeExport(opts.exporter, exported);
    },
    recordResourceLimit(event) {
      const exported: ExportedEvent = {
        kind: "metrics.resource_limit",
        name: "adjudicate.resource_limit",
        at: clockIso(),
        attributes: stamp({
          "adjudicate.resource": event.resource,
          "adjudicate.resource.subject": event.subject,
          "adjudicate.resource.limit": event.limit,
          "adjudicate.resource.observed": event.observed,
        }),
      };
      safeExport(opts.exporter, exported);
    },
  };
}

function stampFactory(opts: OtlpMetricsSinkOptions): (
  attrs: Record<string, string | number | boolean | undefined>,
) => Record<string, string | number | boolean | undefined> {
  return (attrs) => ({
    ...attrs,
    ...(opts.packId !== undefined ? { [SEMCONV.PACK_ID]: opts.packId } : {}),
    ...(opts.policyVersion !== undefined
      ? { [SEMCONV.POLICY_VERSION]: opts.policyVersion }
      : {}),
  });
}

/**
 * Observability is best-effort. An exporter that throws (misconfigured
 * transport, network blip) must never propagate into the kernel hot path.
 */
function safeExport(exporter: Exporter, event: ExportedEvent): void {
  try {
    exporter.export(event);
  } catch {
    /* swallow — exporter failures must not affect Decision outcomes. */
  }
}
