/**
 * Session-risk accumulation + guard (ADR-138).
 *
 * The kernel never sees a score. A post-decision scorer (e.g.
 * `createHallucinationMetadataProvider` in @adjudicate/observability) attaches a
 * groundedness score to AuditRecord.metadata (hash-EXCLUDED). The ADOPTER folds
 * that score into `S.sessionRisk` POST-TURN via `foldSessionRiskScore` (out of
 * the decision path, exactly like the onTokenUsage→next-S seam), and
 * `createSessionRiskGuard` reads ONLY the accumulated `S.sessionRisk` — it never
 * calls a scorer. This keeps adjudicate() pure and replay-deterministic.
 *
 * REPLAY DETERMINISM (the riskiest sub-task, §4.2): `foldSessionRiskScore` is a
 * pure function of `(prev, score)`. Replay re-applies it in audit order over the
 * stored scores, reconstructing byte-identical `SessionRisk` (IEEE-754 double
 * arithmetic is deterministic for the same op sequence; JSON round-trips doubles
 * exactly). The score is CLAMPED to [0,1] before folding so out-of-range inputs
 * can't perturb the accumulator. Apply folds in audit order; never re-order.
 */
import {
  basis,
  BASIS_CODES,
  decisionEscalate,
  decisionRefuse,
  decisionRequestConfirmation,
  refuse,
  type Decision,
  type IntentEnvelope,
} from "@adjudicate/core";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";

export type SessionRiskBucket = "grounded" | "uncertain" | "hallucinated";

export interface SessionRisk {
  /** The last `windowSize` clamped scores, oldest→newest. */
  readonly window: readonly number[];
  /** Exponentially-weighted moving average of all folded scores. */
  readonly ewma: number;
  /** Total number of scores folded (warm-up floor uses this). */
  readonly count: number;
  /** Bucket of the most recently folded score. */
  readonly lastBucket?: SessionRiskBucket;
}

export interface FoldSessionRiskOptions {
  /** EWMA weight on the newest score. Default 0.3. */
  readonly alpha?: number;
  /** Rolling-window length. Default 10. */
  readonly windowSize?: number;
  /** score < this → "grounded". Default 0.34. */
  readonly groundedBelow?: number;
  /** score >= this → "hallucinated". Default 0.67. */
  readonly hallucinatedAtOrAbove?: number;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function bucketOf(score: number, groundedBelow: number, hallucinatedAtOrAbove: number): SessionRiskBucket {
  if (score >= hallucinatedAtOrAbove) return "hallucinated";
  if (score < groundedBelow) return "grounded";
  return "uncertain";
}

/**
 * Pure fold of a single groundedness score into accumulated SessionRisk.
 * Deterministic + replay-stable (see file header). `prev === undefined` starts a
 * fresh accumulator with `ewma = score`.
 */
export function foldSessionRiskScore(
  prev: SessionRisk | undefined,
  score: number,
  opts: FoldSessionRiskOptions = {},
): SessionRisk {
  const alpha = opts.alpha ?? 0.3;
  const windowSize = opts.windowSize ?? 10;
  const groundedBelow = opts.groundedBelow ?? 0.34;
  const hallucinatedAtOrAbove = opts.hallucinatedAtOrAbove ?? 0.67;

  const s = clamp01(score);
  const count = (prev?.count ?? 0) + 1;
  const ewma = prev === undefined ? s : alpha * s + (1 - alpha) * prev.ewma;
  const window = [...(prev?.window ?? []), s].slice(-windowSize);
  return { window, ewma, count, lastBucket: bucketOf(s, groundedBelow, hallucinatedAtOrAbove) };
}

/** Mean of the rolling window (0 when empty). Pure. */
export function sessionRiskWindowMean(risk: SessionRisk): number {
  if (risk.window.length === 0) return 0;
  return risk.window.reduce((a, b) => a + b, 0) / risk.window.length;
}

export interface SessionRiskGuardOptions<K extends string, P, S> {
  /** Read the accumulated risk from state. The guard reads ONLY this. */
  readonly select: (state: S) => SessionRisk | undefined;
  /** Engage predicate. Default: always (when risk is present). */
  readonly matches?: (envelope: IntentEnvelope<K, P>, state: S) => boolean;
  /** Warm-up floor: below this many folded scores, the guard abstains. Default 3. */
  readonly minCount?: number;
  /** Which accumulated metric to threshold. Default "ewma". */
  readonly metric?: "ewma" | "windowMean";
  /** Disposition thresholds (highest-severity that the metric crosses wins). */
  readonly thresholds: {
    readonly rewrite?: number;
    readonly confirm?: number;
    readonly escalate?: number;
    readonly refuse?: number;
  };
  /**
   * Adopter-supplied REWRITE builder (e.g. strip ungrounded claims). Must carry
   * its own basis. Returning null abstains from the rewrite tier.
   */
  readonly onRewrite?: (envelope: IntentEnvelope<K, P>, state: S, risk: SessionRisk) => Decision | null;
  /** REQUEST_CONFIRMATION prompt. */
  readonly prompt?: string;
  /** ESCALATE target. Default "human". */
  readonly escalateTo?: "human" | "supervisor";
  /** REFUSE user-facing text. */
  readonly userFacing?: string;
}

/**
 * Tiered guard over ACCUMULATED session risk. Pure over `(envelope, S)` — reads
 * only `select(s).sessionRisk`, never a scorer. Emits existing variants
 * (REWRITE/REQUEST_CONFIRMATION/ESCALATE/REFUSE) with validation basis codes.
 */
export function createSessionRiskGuard<K extends string, P, S>(
  options: SessionRiskGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const minCount = options.minCount ?? 3;
  const metricKind = options.metric ?? "ewma";

  const guard: Guard<K, P, S> = (envelope, state) => {
    if (options.matches && !options.matches(envelope, state)) return null;
    const risk = options.select(state);
    if (risk === undefined) return null;
    if (risk.count < minCount) return null; // warm-up floor

    const metric = metricKind === "windowMean" ? sessionRiskWindowMean(risk) : risk.ewma;
    const t = options.thresholds;
    const detail = { metric: metricKind, value: metric, ewma: risk.ewma, count: risk.count };

    if (t.refuse !== undefined && metric >= t.refuse) {
      return decisionRefuse(
        refuse("BUSINESS_RULE", "session_risk_elevated", options.userFacing ?? "I can't continue — accumulated risk is too high.", `session risk ${metric.toFixed(3)} >= ${t.refuse}`),
        [basis("validation", BASIS_CODES.validation.SESSION_RISK_ELEVATED, detail)],
      );
    }
    if (t.escalate !== undefined && metric >= t.escalate) {
      return decisionEscalate(
        options.escalateTo ?? "human",
        `Accumulated groundedness degraded (${metric.toFixed(3)}); routing to a reviewer.`,
        [basis("validation", BASIS_CODES.validation.GROUNDEDNESS_DEGRADED, detail)],
      );
    }
    if (t.confirm !== undefined && metric >= t.confirm) {
      return decisionRequestConfirmation(
        options.prompt ?? "Groundedness is low — confirm before continuing?",
        [basis("validation", BASIS_CODES.validation.GROUNDEDNESS_LOW, detail)],
      );
    }
    if (t.rewrite !== undefined && metric >= t.rewrite && options.onRewrite) {
      return options.onRewrite(envelope, state, risk);
    }
    return null;
  };

  return withMetadata(guard, {
    description: { kind: "opaque", note: "session-risk guard (reads accumulated S.sessionRisk)" },
  });
}
