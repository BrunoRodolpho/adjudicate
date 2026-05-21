/**
 * OTLP-shaped audit span exporter.
 *
 * Wraps any `AuditSink` and, in addition to the underlying durable emit,
 * pushes one `audit.span` event per AuditRecord into the configured
 * Exporter. The span name is `adjudicate.audit.<intentKind>` and the
 * attributes carry the headline fields used for trace correlation
 * (intentHash, decision, basis-code count, …).
 *
 * The wrapper is NOT a sink replacement. Durability is the inner sink's
 * job; this just sprays a parallel trace. If the inner emit rejects, the
 * wrapper rethrows (so the kernel's existing durability story is unchanged)
 * but the span has still been exported — observability is best-effort and
 * never blocks the audit path.
 *
 * Wiring:
 *
 *     const wrapped = createOtlpAuditSpanExporter({
 *       inner: postgresAuditSink,
 *       exporter,
 *     });
 *     await adjudicateAndAudit({ envelope, state, policy, sink: wrapped });
 */

import type { AuditRecord, AuditSink } from "@adjudicate/core";
import type { Exporter, ExportedEvent } from "./exporter.js";
import { SEMCONV } from "./semconv.js";

export interface OtlpAuditSpanExporterOptions {
  /** Inner durable sink. The wrapper delegates `.emit()` to this. */
  readonly inner: AuditSink;
  readonly exporter: Exporter;
  /** Optional Pack identifier stamped on every span. */
  readonly packId?: string;
  /** Optional Pack policy version stamped on every span. */
  readonly policyVersion?: string;
}

export function createOtlpAuditSpanExporter(
  opts: OtlpAuditSpanExporterOptions,
): AuditSink {
  return {
    async emit(record: AuditRecord) {
      // Emit the span first; if the inner sink throws, we still want a trace
      // of the attempt. The exporter is best-effort and swallows its own
      // errors so observability never disturbs the durability path.
      const span = recordToSpan(record, opts);
      try {
        opts.exporter.export(span);
      } catch {
        /* swallow */
      }
      // Durability path — the wrapper is transparent to its inner sink.
      await opts.inner.emit(record);
    },
  };
}

function recordToSpan(
  record: AuditRecord,
  opts: OtlpAuditSpanExporterOptions,
): ExportedEvent {
  return {
    kind: "audit.span",
    name: `adjudicate.audit.${record.envelope.kind}`,
    at: record.at,
    attributes: {
      [SEMCONV.INTENT_KIND]: record.envelope.kind,
      [SEMCONV.DECISION_KIND]: record.decision.kind,
      [SEMCONV.TAINT]: record.envelope.taint,
      [SEMCONV.INTENT_HASH]: record.intentHash,
      [SEMCONV.LATENCY_MS]: record.durationMs,
      "adjudicate.basis.count": record.decision_basis.length,
      ...(record.resourceVersion !== undefined
        ? { "adjudicate.resource.version": record.resourceVersion }
        : {}),
      ...(record.plan?.planFingerprint !== undefined
        ? { "adjudicate.plan.fingerprint": record.plan.planFingerprint }
        : {}),
      ...(record.kernelIdentity !== undefined
        ? {
            "adjudicate.kernel.id": record.kernelIdentity.id,
            "adjudicate.kernel.version": record.kernelIdentity.version,
          }
        : {}),
      ...(opts.packId !== undefined ? { [SEMCONV.PACK_ID]: opts.packId } : {}),
      ...(opts.policyVersion !== undefined
        ? { [SEMCONV.POLICY_VERSION]: opts.policyVersion }
        : {}),
    },
    // Full record for ingestion pipelines that want everything. Exporters
    // that don't care can ignore `body`.
    body: record,
  };
}
