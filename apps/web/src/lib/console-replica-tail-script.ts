/**
 * console-replica-tail-script — a SCRIPTED, believable arrival sequence for the
 * /console replica's simulated live tail.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS NOT A LIVE FEED. apps/web never opens an SSE/WebSocket/poll
 * connection and holds no admin credentials. The /console "live tail" is a
 * client-side animation that reveals the committed `CONSOLE_REPLICA_RECORDS`
 * fixture one row at a time on the schedule below — its transport badge MUST
 * read "SIMULATED" (never "live"/"polling"), inside the ConsoleChrome
 * "illustrative replica · sample data" wrapper.
 *
 * Each step references an `intentHash` straight from `CONSOLE_REPLICA_RECORDS`
 * (no hand-typed hashes — they cannot drift), with `afterMs` = the delay from
 * the PRIOR arrival (a relative inter-arrival gap), so the player can simply
 * accumulate the gaps. The gaps are uneven (bursts then pauses) to read like a
 * real operator console rather than a metronome. The order is reverse-feed
 * (oldest first) so rows "arrive" bottom-up into the newest-first table.
 */

import { CONSOLE_REPLICA_RECORDS } from "./console-replica-records";

/** A single scripted arrival in the simulated tail. */
export interface ConsoleReplicaTailStep {
  /** intentHash of a record in CONSOLE_REPLICA_RECORDS. */
  readonly intentHash: string;
  /** Delay in ms from the previous arrival (relative inter-arrival gap). */
  readonly afterMs: number;
}

// Index the feed by position so the script references real hashes by name
// without duplicating any literal. Oldest-first (the feed is newest-first, so
// we walk it in reverse) — rows animate in from the bottom of the table.
const byPos = [...CONSOLE_REPLICA_RECORDS].reverse();
const h = (i: number): string => {
  const record = byPos[i];
  if (!record) {
    throw new Error(`console-replica-tail-script: no record at feed index ${i}`);
  }
  return record.intentHash;
};

/**
 * Scripted live-tail arrival sequence. Twelve arrivals — one per replica record
 * — with uneven gaps so the stream feels organic: an opening pair, a short
 * burst, a deliberate pause before the medium-refund confirmation, then a
 * tightening cadence into the most recent June deployment + command-risk wave.
 */
export const CONSOLE_REPLICA_TAIL: readonly ConsoleReplicaTailStep[] = [
  { intentHash: h(0), afterMs: 0 }, // REWRITE — pix overshoot (oldest)
  { intentHash: h(1), afterMs: 900 }, // REQUEST_CONFIRMATION — pix medium
  { intentHash: h(2), afterMs: 1600 }, // ESCALATE — pix large (hallucinated)
  { intentHash: h(3), afterMs: 700 }, // DEFER — pix charge create
  { intentHash: h(4), afterMs: 2400 }, // DEFER — kyc start (pause)
  { intentHash: h(5), afterMs: 1100 }, // EXECUTE — pix refund (grounded)
  { intentHash: h(6), afterMs: 800 }, // REFUSE — already refunded
  { intentHash: h(7), afterMs: 3000 }, // REWRITE — command flag stripped (pause)
  { intentHash: h(8), afterMs: 1300 }, // REFUSE — command blocked
  { intentHash: h(9), afterMs: 600 }, // REQUEST_CONFIRMATION — command credential
  { intentHash: h(10), afterMs: 1900 }, // REQUEST_CONFIRMATION — command network
  { intentHash: h(11), afterMs: 1000 }, // EXECUTE — deployment resumed (newest)
] as const;
