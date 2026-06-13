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
  /**
   * Source of a propagated transition (kill-switch, deferred resume, …).
   * Low cardinality: `pubsub | poll | boot | external`. Lets dashboards
   * separate "operator initiated trip" from "boot-time resync".
   */
  TRANSITION_SOURCE: "adjudicate.transition.source",
  /**
   * Lifecycle phase for the adapter loop. Low cardinality:
   * `started | iteration | tool_use | decision | completed | paused`.
   */
  ADAPTER_PHASE: "adjudicate.adapter.phase",
  /**
   * Adapter iteration counter within a single `.send()` call. Bounded
   * by `maxIterations` (default 8) — safe for low-cardinality histograms.
   */
  ADAPTER_ITERATION: "adjudicate.adapter.iteration",
  /**
   * Adapter outcome kind. Low cardinality: matches `AgentOutcome.kind`
   * (`completed | deferred | awaiting_confirmation | escalated | max_iterations_exceeded`).
   */
  ADAPTER_OUTCOME: "adjudicate.adapter.outcome",
  /**
   * Provider identifier supplied by the bridge. Adopter-controlled
   * vocabulary (e.g., `anthropic | openai | vercel-ai | bedrock`). Kept
   * low-cardinality by adopter discipline; the framework does not enforce
   * a fixed enum here because adopters add their own providers.
   */
  PROVIDER_ID: "adjudicate.provider.id",
  /**
   * Defer/confirm lifecycle phase: `parked | resumed | confirmed | declined | expired`.
   */
  PAUSE_PHASE: "adjudicate.pause.phase",
  /**
   * Defer signal vocabulary entry. Controlled by the Pack's declared
   * `signals` list — Packs are expected to keep this list small.
   */
  DEFER_SIGNAL: "adjudicate.defer.signal",
  /**
   * Kill-switch state. Low cardinality: `active | normal`.
   * Use {@link TRANSITION_SOURCE} alongside for the trigger.
   */
  KILL_SWITCH_STATE: "adjudicate.kill_switch.state",
  /** Adopter-supplied groundedness/hallucination score in [0,1]; higher = less grounded (ADR-124). */
  HALLUCINATION_SCORE: "adjudicate.hallucination.score",
  /** Bounded-cardinality bucket: grounded | uncertain | hallucinated. */
  HALLUCINATION_BUCKET: "adjudicate.hallucination.bucket",

  // ── Per-decision cost (item 3) ────────────────────────────────────────────
  //
  // USD cost folded from token counts x an adopter PriceTable at READ time
  // (never on the stored sample — determinism boundary). Leaf siblings only:
  // there is deliberately NO bare `adjudicate.cost` key (the prefix-namespace
  // test forbids `a.b` coexisting with `a.b.c`).

  /** Total decision/session/tenant cost in USD (float) = input + output. */
  COST_USD: "adjudicate.cost.usd",
  /** Input/prompt-token cost in USD (float). */
  COST_INPUT_USD: "adjudicate.cost.input.usd",
  /** Output/completion-token cost in USD (float). */
  COST_OUTPUT_USD: "adjudicate.cost.output.usd",

  // ── Caught a bad call (item 7) ────────────────────────────────────────────
  //
  // Span/event attributes for the out-of-plan catch path. CATCH_TOOL is
  // adopter/model-controlled cardinality — span/event use ONLY, never a metric
  // label. Leaf siblings; no bare `adjudicate.catch`.
  //
  // RESERVED: these names are the stable vocabulary for the catch span/event
  // exporter that is not yet wired (nothing emits `learning.catch` today). They
  // are declared now — the SEMCONV file is deliberately add-only — so dashboards
  // and adopter exporters can key on the final names ahead of the emitter.

  /** Catch reason. Low cardinality: currently `out_of_plan`. */
  CATCH_REASON: "adjudicate.catch.reason",
  /** Tool name that was caught. HIGH cardinality — span/event only, never a metric label. */
  CATCH_TOOL: "adjudicate.catch.tool",

  // ── Simulation / journey-testing runs (`adjudicate.sim.*`) ────────────────
  //
  // Attributes for adopter journey-test harnesses that drive an LLM persona
  // ("driver") against the adopter's deployed system ("sut" — system under
  // test) and adjudicate the resulting envelopes through the kernel. Names
  // align with the harness JSONL event vocabulary (`journey`, `runId`,
  // `inputTokens`/`outputTokens`, `source: "driver" | "sut"`).

  /** Stable journey identifier — e.g. "JOURNEY-001". Low cardinality (the journey catalog). */
  SIM_JOURNEY_ID: "adjudicate.sim.journey.id",
  /** Unique run identifier for one journey-run attempt. High cardinality — span/event use only, never a metric label. */
  SIM_RUN_ID: "adjudicate.sim.run.id",
  /** 1-based attempt counter within a repeated run (e.g. green-twice / `--k N`). Bounded by the harness's k. */
  SIM_ATTEMPT: "adjudicate.sim.attempt",
  /** Whether this run counts toward certification (pinned certification model) vs an exploratory run. Boolean. */
  SIM_CERTIFYING: "adjudicate.sim.certifying",
  /** Run outcome. Low cardinality: `pass | fail | error`. */
  SIM_OUTCOME: "adjudicate.sim.outcome",
  /**
   * Total run cost in USD (float), computed from token counts × the
   * harness's checked-in price table — driver + SUT combined.
   */
  SIM_COST_USD: "adjudicate.sim.cost.usd",
  /** Input (prompt) tokens consumed by the persona driver's own model calls. */
  SIM_DRIVER_TOKENS_IN: "adjudicate.sim.driver.tokens.in",
  /** Output (completion) tokens produced by the persona driver's own model calls. */
  SIM_DRIVER_TOKENS_OUT: "adjudicate.sim.driver.tokens.out",
  /** Input (prompt) tokens consumed by the system under test's model calls during the run. */
  SIM_SUT_TOKENS_IN: "adjudicate.sim.sut.tokens.in",
  /** Output (completion) tokens produced by the system under test's model calls during the run. */
  SIM_SUT_TOKENS_OUT: "adjudicate.sim.sut.tokens.out",
} as const;

export type SemconvKey = keyof typeof SEMCONV;
export type SemconvAttribute = (typeof SEMCONV)[SemconvKey];
