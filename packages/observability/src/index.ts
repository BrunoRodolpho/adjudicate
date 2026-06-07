/**
 * @adjudicate/observability — OTLP-native sinks for the kernel's three
 * telemetry surfaces (metrics, learning, audit).
 *
 * The package adapts the kernel's existing sink contracts (`MetricsSink`,
 * `LearningSink`, `AuditSink`) onto a single `Exporter` interface that the
 * adopter wires to an OpenTelemetry transport. The kernel itself is
 * untouched — observability is OPTIONAL plumbing and MUST NEVER affect a
 * Decision outcome. If the exporter throws, the sink swallows the error;
 * if the exporter is misconfigured, telemetry is silent but adjudication
 * still runs.
 *
 * # Why a custom Exporter and not OTLP SDKs directly
 *
 * The OTLP exporters in `@opentelemetry/exporter-trace-otlp-proto` are
 * span-oriented and pull in a transport stack. By funneling all three
 * adjudicate sinks through one in-process `Exporter`, adopters can:
 *
 *   - Wire one OTLP/proto transport for the whole subsystem
 *   - Or stay on a no-op transport in environments without an OTel collector
 *   - Or capture events into an in-memory buffer for tests
 *
 * The `@opentelemetry/api` package is the only OTel dependency we pull in;
 * it is metadata-only (interfaces) and adds no runtime weight.
 *
 * # Layout
 *
 *   - `exporter.ts`     Exporter interface + InMemoryExporter for tests
 *   - `semconv.ts`      Stable attribute names (`adjudicate.*`)
 *   - `metrics.ts`      createOtlpMetricsSink → MetricsSink
 *   - `learning.ts`     createOtlpLearningSink → LearningSink
 *   - `audit-spans.ts`  createOtlpAuditSpanExporter → AuditSink wrapper
 */

export {
  type Exporter,
  type ExportedEvent,
  type ExportedEventKind,
  type InMemoryExporter,
  createInMemoryExporter,
  noopExporter,
} from "./exporter.js";

export { SEMCONV, type SemconvAttribute, type SemconvKey } from "./semconv.js";

export {
  bucketHallucinationScore,
  createHallucinationMetadataProvider,
  createLexicalGroundednessScorer,
  type HallucinationBucket,
  type HallucinationScorer,
  type LexicalGroundednessOptions,
  type ScoreBucketOptions,
} from "./hallucination.js";

export {
  createOtlpMetricsSink,
  type OtlpMetricsSinkOptions,
} from "./metrics.js";

export {
  createOtlpLearningSink,
  type OtlpLearningSinkOptions,
} from "./learning.js";

export {
  createOtlpAuditSpanExporter,
  type OtlpAuditSpanExporterOptions,
} from "./audit-spans.js";

// Post-v1 ecosystem-telemetry primitive — opt-in, local-first, deterministic.
// Adopters compose this aggregator alongside their sinks to produce
// JSON-stable evidence snapshots. The framework never instantiates it.
export {
  createEcosystemTelemetry,
  classifyReplayFailure,
  serializeEcosystemSnapshot,
  type EcosystemTelemetry,
  type EcosystemTelemetryOptions,
  type EcosystemTelemetrySnapshot,
  type PackEcosystemSnapshot,
  type DecisionDistributionSnapshot,
  type ReplayFailureSnapshot,
  type ReplayFailureClass,
  type AnalyzerTriageSnapshot,
  type AnalyzerTriageOutcome,
  type SemconvAdoptionSnapshot,
  type MigrationPainSnapshot,
  type IncidentSnapshot,
  type OperationalIncidentClass,
} from "./ecosystem-telemetry.js";
