/**
 * Semantic conventions for adjudicate's OTLP attribute names.
 *
 * The names are namespaced under `adjudicate.*` so they don't collide with
 * upstream OpenTelemetry semconv (`http.*`, `db.*`, …) or with adopter-defined
 * attributes. We commit to keeping these names stable across minor versions —
 * dashboards, alerts, and SIEM rules built on top of them MUST NOT break when
 * `@adjudicate/observability` bumps its minor.
 *
 * If a new attribute is needed, ADD a new key here; do NOT rename existing
 * ones. Removal is a breaking change and goes through the deprecation
 * calendar (see `docs/release/deprecations.md`).
 */
export const SEMCONV = {
  /** Envelope kind — e.g. "vacation.request", "pix.charge.refund". */
  INTENT_KIND: "adjudicate.intent.kind",
  /** Decision.kind — one of EXECUTE/REFUSE/ESCALATE/REQUEST_CONFIRMATION/REWRITE/DEFER. */
  DECISION_KIND: "adjudicate.decision.kind",
  /** Taint level on the originating envelope — UNTRUSTED | TRUSTED | SYSTEM. */
  TAINT: "adjudicate.taint",
  /** Adopter-supplied policy bundle version (e.g. semver of the Pack). */
  POLICY_VERSION: "adjudicate.policy.version",
  /** Adopter-supplied Pack identifier, when known. */
  PACK_ID: "adjudicate.pack.id",
  /** Wall-clock duration of the adjudication itself, in milliseconds. */
  LATENCY_MS: "adjudicate.latency.ms",
  /** Audit-stable intent hash — useful for cross-correlating spans with audit rows. */
  INTENT_HASH: "adjudicate.intent.hash",
  /** Matched-guard identifier (see ADR-105). Omitted for non-guard phases. */
  GUARD_ID: "adjudicate.guard.id",
} as const;

export type SemconvKey = keyof typeof SEMCONV;
export type SemconvAttribute = (typeof SEMCONV)[SemconvKey];
