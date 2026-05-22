/**
 * Kill-switch event timeline analyzer — turns a sequence of kill-switch
 * state transitions into a deterministic summary an operator can read
 * in one screen.
 *
 * Inputs are caller-supplied. The framework never stores kill-switch
 * history in a kernel-internal structure; this primitive operates on
 * whatever the adopter has captured (audit-log rows, governance-event
 * rows, runbook journal entries).
 *
 * Pure: no I/O, no clock, no RNG. Deterministic over the same ordered
 * sequence.
 */

export type KillSwitchEventKind = "trip" | "clear" | "snapshot";
export type KillSwitchEventSource = "operator" | "automated" | "boot" | "external" | "unknown";

export interface KillSwitchEvent {
  /** ISO timestamp of the event — caller-supplied, not derived. */
  readonly at: string;
  readonly kind: KillSwitchEventKind;
  /** State *after* the event. `active` = kill-switch engaged. */
  readonly state: "active" | "normal";
  readonly source?: KillSwitchEventSource;
  /** Adopter-supplied reason text. Truncated to 200 chars in summaries. */
  readonly reason?: string;
  /** Optional principal that triggered the event. */
  readonly actor?: string;
}

export type KillSwitchStabilityClass =
  | "stable"
  | "single_incident"
  | "recurring_incidents"
  | "storm";

export interface KillSwitchTimelineReport {
  readonly schemaVersion: 1;
  readonly totalEvents: number;
  readonly trips: number;
  readonly clears: number;
  /** Number of state transitions (trip→clear or clear→trip). */
  readonly transitions: number;
  /** Number of trips within the most active 10-event window. */
  readonly maxTripDensity: number;
  /** Aggregated count per source. */
  readonly bySource: Readonly<Record<KillSwitchEventSource, number>>;
  /** Active duration accounting in milliseconds across all engaged intervals. */
  readonly activeDurationMs: number;
  /**
   * Stability classification — closed vocabulary. See
   * `KillSwitchStabilityClass`.
   */
  readonly stability: KillSwitchStabilityClass;
  /** Operator-readable headline. */
  readonly headline: string;
}

export interface KillSwitchTimelineOptions {
  /**
   * Threshold above which `maxTripDensity` triggers a `storm`
   * classification. Default `5` trips in a sliding 10-event window.
   */
  readonly stormDensityThreshold?: number;
  /**
   * Number of `recurring_incidents` trips beyond which the system is
   * classified as `storm` regardless of density. Default `10`.
   */
  readonly stormTripCountThreshold?: number;
}

const DEFAULTS = {
  stormDensityThreshold: 5,
  stormTripCountThreshold: 10,
} as const;

const SOURCES: ReadonlyArray<KillSwitchEventSource> = [
  "operator",
  "automated",
  "boot",
  "external",
  "unknown",
];

function emptySourceMap(): Record<KillSwitchEventSource, number> {
  return { operator: 0, automated: 0, boot: 0, external: 0, unknown: 0 };
}

/**
 * Analyse a chronologically-ordered list of kill-switch events. The
 * function does NOT sort the input — caller controls ordering. (Sorting
 * here would discard the caller's intent when "chronological" has a
 * different meaning than "by timestamp"; e.g., reconciled vs. raw.)
 */
export function analyzeKillSwitchTimeline(
  events: ReadonlyArray<KillSwitchEvent>,
  options: KillSwitchTimelineOptions = {},
): KillSwitchTimelineReport {
  const opts = { ...DEFAULTS, ...options };
  const bySource = emptySourceMap();
  let trips = 0;
  let clears = 0;
  let transitions = 0;
  let prevState: KillSwitchEvent["state"] | null = null;
  let activeStartedAt: number | null = null;
  let activeDurationMs = 0;

  for (const e of events) {
    bySource[e.source ?? "unknown"]++;
    if (e.kind === "trip") trips++;
    if (e.kind === "clear") clears++;
    if (prevState !== null && prevState !== e.state) transitions++;

    const ts = Date.parse(e.at);
    if (!Number.isNaN(ts)) {
      if (e.state === "active") {
        if (activeStartedAt === null) activeStartedAt = ts;
      } else {
        if (activeStartedAt !== null) {
          activeDurationMs += Math.max(0, ts - activeStartedAt);
          activeStartedAt = null;
        }
      }
    }
    prevState = e.state;
  }

  // Sliding-window trip density.
  let maxTripDensity = 0;
  const WINDOW = 10;
  for (let i = 0; i < events.length; i++) {
    const end = Math.min(events.length, i + WINDOW);
    let count = 0;
    for (let j = i; j < end; j++) {
      if (events[j]!.kind === "trip") count++;
    }
    if (count > maxTripDensity) maxTripDensity = count;
  }

  let stability: KillSwitchStabilityClass;
  if (trips === 0) {
    stability = "stable";
  } else if (trips === 1) {
    stability = "single_incident";
  } else if (
    maxTripDensity >= opts.stormDensityThreshold ||
    trips >= opts.stormTripCountThreshold
  ) {
    stability = "storm";
  } else {
    stability = "recurring_incidents";
  }

  const headline = buildHeadline({
    stability,
    trips,
    clears,
    transitions,
    activeDurationMs,
  });

  return {
    schemaVersion: 1,
    totalEvents: events.length,
    trips,
    clears,
    transitions,
    maxTripDensity,
    bySource,
    activeDurationMs,
    stability,
    headline,
  };
}

function buildHeadline(input: {
  stability: KillSwitchStabilityClass;
  trips: number;
  clears: number;
  transitions: number;
  activeDurationMs: number;
}): string {
  const seconds = Math.round(input.activeDurationMs / 1000);
  switch (input.stability) {
    case "stable":
      return `kill-switch timeline: stable, ${input.trips} trips`;
    case "single_incident":
      return `kill-switch timeline: single incident (${seconds}s engaged)`;
    case "recurring_incidents":
      return `kill-switch timeline: recurring (${input.trips} trips, ${input.transitions} transitions, ${seconds}s engaged)`;
    case "storm":
      return `kill-switch timeline: STORM (${input.trips} trips, ${input.transitions} transitions, ${seconds}s engaged) — investigate`;
  }
}

// Re-export the closed source list so adopters can build pickers.
export const KILL_SWITCH_EVENT_SOURCES = SOURCES;
