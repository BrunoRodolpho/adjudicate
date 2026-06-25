/**
 * The Evidence Ledger — the per-turn evidence snapshot the §5 soundness
 * predicate reads (SDD §G; v1.1 §7; Inv 7). Read + Action feed entries IN; the
 * Claims Kernel reads them OUT as the final output authority. This module owns
 * the entry SHAPE and the snapshot's resolution rules; it does NOT implement the
 * soundness predicate (`CLAIM_ALLOWED` — a separate kernel deliverable, SDD §Q.3)
 * and it does NOT enforce the `must_read_this_turn ⟹ sourceMode=="live"` rule
 * (that is Q3's soundness check — this module only RECORDS `sourceMode`
 * faithfully so Q3 can reject a cache-validated live read).
 *
 * **DISTINCT from `../ledger.ts`** (the Execution Ledger — hot-path replay/dedup
 * keyed by `intentHash`). That answers "has this intent already executed?"; this
 * is the per-turn evidence snapshot a claim is validated against. They share the
 * word "ledger" and nothing else — do not conflate or merge them.
 *
 * Transcribed VERBATIM from SDD §G / v1.1 §7 — the entry shape is not
 * re-derived, re-ordered semantically, or paraphrased (SDD zero-drift contract).
 * Pure & self-contained — no kernel-downstream import (SDD §R kernel purity:
 * `adjudicate → claustrum → ibatexas`, never backward); no clock/RNG/IO (the
 * `fetchedAt` timestamp is supplied BY the caller — Read/Action — not minted
 * here, so the ledger stays a deterministic data structure).
 */

import type { ClaimVerdict } from "./verdict.js";

// ─────────────────────────────────────────────────────────────────────────
// Ledger provenance vocabulary — SDD §G / v1.1 §7, verbatim
// ─────────────────────────────────────────────────────────────────────────

/**
 * The Read Kernel's per-entry PROVENANCE verdict as it lands in the ledger
 * (SDD §F "provenance: TRUSTED/UNTRUSTED_DATA"; SDD §G / v1.1 §7 entry shape):
 *
 *   "TRUSTED" | "UNTRUSTED_DATA"
 *
 * This is the Read-layer *trust* axis recorded ON a ledger entry — verbatim from
 * §G. It is DELIBERATELY NOT the payload-level `Taint` lattice in `../taint.ts`
 * (`SYSTEM | TRUSTED | UNTRUSTED`, the LLM-boundary payload-trust meet): §G names
 * exactly the two values `TRUSTED` / `UNTRUSTED_DATA`, and the SDD §A precedence
 * rule binds the build to the canon's vocabulary where they differ. An
 * `UNTRUSTED_DATA` entry may never be the *validating value* of any claim
 * (Inv 3) — but THAT gate is the soundness predicate's job (Q3); here the field
 * is only recorded faithfully.
 */
export type LedgerTaint = "TRUSTED" | "UNTRUSTED_DATA";

/**
 * The closed membership tuple for `LedgerTaint`, in spec order (SDD §G). Single
 * source of truth for the two members; `isLedgerTaint` narrows against it.
 */
export const LEDGER_TAINTS: readonly LedgerTaint[] = [
  "TRUSTED",
  "UNTRUSTED_DATA",
] as const;

/** Type guard: is `value` one of the exactly-two ledger taints (§G)? Pure. */
export function isLedgerTaint(value: unknown): value is LedgerTaint {
  return (
    typeof value === "string" &&
    (LEDGER_TAINTS as readonly string[]).includes(value)
  );
}

/**
 * The freshness SOURCE mode recorded on a ledger entry (SDD §G / v1.1 §7):
 *
 *   "live" | "cache"
 *
 * A timestamped, faithfully-recorded distinction (H4): a value read live this
 * turn is `"live"`; one served from a cache is `"cache"`. `must_read_this_turn`
 * evidence REQUIRES `sourceMode == "live"` — but enforcing that is Q3's
 * soundness rule. Q2 only guarantees the distinction is *preserved* at read time
 * so cache can never masquerade as live (a cache row carries both
 * `sourceMode: "cache"` AND its own `fetchedAt`, never a fabricated live stamp).
 */
export type SourceMode = "live" | "cache";

// ─────────────────────────────────────────────────────────────────────────
// Per-envelope dispatch result — SDD §G `dispatch?`; v1.1 §10 Inv 4 (H10/H11)
// ─────────────────────────────────────────────────────────────────────────

/**
 * One envelope's dispatch outcome (SDD §G `dispatch?: PerEnvelopeResult[]`; v1.1
 * §10 Inv 4 / H10 / H11). Defined minimally — Q2 only needs partial commits to
 * be *representable*, not to drive them.
 *
 * Inv 4: "Action-claim success is defined (verdict + dispatch + `result.success`;
 * settlement ≠ session); per-envelope results make partial commits representable."
 * An `action_outcome` claim's evidence is this turn's Action verdict + dispatch,
 * NOT a read — so when one Action fans out to several side-effecting envelopes,
 * each envelope's success is recorded SEPARATELY here. A turn in which envelope A
 * settled but envelope B failed is then representable as a `dispatch` array with
 * `success: true` / `success: false` members, rather than collapsing to a single
 * turn-wide boolean that would hide the partial commit.
 *
 * `settled` (settlement ≠ session, Inv 4): `success` is the dispatch result;
 * `settled` records whether the side effect durably committed downstream. The two
 * are kept distinct so a session-level ack can never masquerade as settlement.
 */
export interface PerEnvelopeResult {
  /** Stable identifier of the dispatched envelope (e.g. its intentHash). */
  readonly envelopeId: string;
  /** Whether THIS envelope's dispatch succeeded (`result.success`, Inv 4). */
  readonly success: boolean;
  /**
   * Whether the side effect durably SETTLED downstream (settlement ≠ session,
   * Inv 4). Optional: absent when settlement is not yet known/applicable; a
   * present `false` is distinct from absence, mirroring error ≠ absence.
   */
  readonly settled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// The ledger entry — SDD §G / v1.1 §7, EXACT shape
// ─────────────────────────────────────────────────────────────────────────

/**
 * One Evidence Ledger entry — the EXACT §G / v1.1 §7 shape:
 *
 * ```
 * { key, value, source,
 *   fetchedAt: <timestamp>,            // H4: a timestamp, NOT a boolean
 *   sourceMode: "live" | "cache",      // H4: must_read_this_turn REQUIRES "live"
 *   taint: "TRUSTED" | "UNTRUSTED_DATA",
 *   originProvenance,                  // C3: survives persistence
 *   dispatch?: PerEnvelopeResult[] }   // H10: per-envelope dispatch results
 * ```
 *
 * `fetchedAt` is a `number` epoch-millis TIMESTAMP, never a boolean (H4) — a
 * boolean would let a cache row claim "fresh: true" and masquerade as live; a
 * timestamp + `sourceMode` together make that impossible.
 */
export interface EvidenceEntry {
  /** The evidence key this entry binds (e.g. an `EvidenceRequirement.key`). */
  readonly key: string;
  /** The evidence value (opaque to the ledger; the claims kernel interprets it). */
  readonly value: unknown;
  /** Human/system-readable source descriptor (which read/action produced it). */
  readonly source: string;
  /**
   * When the evidence was fetched — epoch-millis TIMESTAMP, NOT a boolean (H4).
   * Supplied by the caller (Read/Action), so the ledger needs no clock and stays
   * deterministic; cache cannot masquerade as live because its stamp is its own.
   */
  readonly fetchedAt: number;
  /** `"live"` (read this turn) vs `"cache"` (served from cache) — H4, faithful. */
  readonly sourceMode: SourceMode;
  /** Read-layer trust of the value (SDD §G) — `TRUSTED` | `UNTRUSTED_DATA`. */
  readonly taint: LedgerTaint;
  /**
   * The provenance of the value's ORIGIN — survives persistence (C3, Inv 3): a
   * row written from an `UNTRUSTED_DATA` ingress stays `UNTRUSTED_DATA` across
   * reads; it never "washes" to `TRUSTED`. Kept as `LedgerTaint` (a second axis
   * over the same vocabulary as `taint`) so the origin trust is comparable and
   * cannot silently upgrade.
   */
  readonly originProvenance: LedgerTaint;
  /**
   * Optional per-envelope dispatch results (H10) — present for `action_outcome`
   * evidence so partial commits are representable; absent for plain reads.
   */
  readonly dispatch?: readonly PerEnvelopeResult[];
}

/**
 * The input a writer (Read/Action) supplies to record an entry — the §G fields,
 * with `dispatch` optional. Identical to `EvidenceEntry` (the ledger stores it
 * as-is); named distinctly so the write boundary reads intentionally.
 */
export type EvidenceEntryInput = EvidenceEntry;

// ─────────────────────────────────────────────────────────────────────────
// Read resolution — SDD §G / v1.1 §7; Inv 7 (error ≠ absence)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The distinguishable STATES a key can be in within the snapshot (SDD §G; Inv 7).
 * These are NOT the claim verdict — they are the ledger's read-resolution states,
 * each of which the soundness predicate maps to a verdict. Four states, all
 * distinct (the Inv 7 demand "read-error ≠ read-absence"):
 *
 *   - `"present"`   — a single un-conflicted value was written; resolvable.
 *   - `"absent"`    — the key was never written this turn (a read ABSENCE).
 *   - `"error"`     — a read ERROR was recorded for the key (DISTINCT from absent).
 *   - `"conflict"`  — two+ writes to the key disagreed this turn (H3); the value
 *                     is poisoned and must resolve `UNKNOWN`, never last-write.
 *
 * `absent`, `error`, and `conflict` all resolve to a NON-CONCRETE verdict
 * (`UNKNOWN`-or-safer); only `present` exposes the concrete value to validation.
 * They remain SEPARATE states so callers (and audit) can tell them apart — an
 * error fails CLOSED loudly, an absence is honest ignorance (Inv 7).
 */
export type EvidenceState = "present" | "absent" | "error" | "conflict";

/**
 * The result of resolving a key against the snapshot (SDD §G; Inv 7). Carries
 * the distinguishable `state` AND the safe `verdict` floor:
 *
 *   - `present`  → `verdict: "VALIDATED"`-eligible; `value`/`entry` exposed. (The
 *                  ledger does NOT itself assert VALIDATED — that is the soundness
 *                  predicate; `present` only means "a concrete value is readable".
 *                  We surface `verdict: "UNKNOWN"` for non-present and leave the
 *                  present case's verdict to the caller by exposing `entry`.)
 *   - `absent`   → `verdict: "UNKNOWN"`, no `value`/`entry`.
 *   - `error`    → `verdict: "UNKNOWN"` (fail CLOSED), no `value`/`entry`.
 *   - `conflict` → `verdict: "UNKNOWN"` (H3 — never last-write-as-validated),
 *                  no `value`/`entry`.
 *
 * The KEY safety property (Inv 7 / H3): for every non-`present` state the
 * resolution NEVER carries a concrete `value` — a read error, an absence, and a
 * conflict are indistinguishable from "no concrete value" to a downstream
 * consumer that only inspects `value`, while `state` keeps them distinguishable
 * to one that cares.
 */
export interface EvidenceResolution {
  readonly key: string;
  /** The distinguishable ledger state (error ≠ absence ≠ conflict ≠ present). */
  readonly state: EvidenceState;
  /**
   * The safe verdict FLOOR the ledger guarantees for this key. `UNKNOWN` for
   * every non-`present` state (never a concrete value escapes as VALIDATED);
   * `present` resolutions leave the final VALIDATED/REFUSED to the soundness
   * predicate, so the ledger reports `UNKNOWN` here too and exposes `entry` —
   * the ledger is not the soundness authority and must not pre-empt it.
   */
  readonly verdict: Extract<ClaimVerdict, "UNKNOWN">;
  /**
   * The concrete value — ONLY present when `state === "present"`. Absent/error/
   * conflict states carry NO value (the Inv 7 / H3 safety floor). Use a presence
   * check on `entry`, not on `value === undefined` (a present value MAY be
   * `undefined` legitimately; the discriminator is `state`).
   */
  readonly entry?: EvidenceEntry;
}

// Internal stored cell — a key's accumulated state within ONE snapshot.
interface Cell {
  // The last entry written for a non-error, single-write key.
  readonly entry?: EvidenceEntry;
  // True once a read ERROR was recorded for this key (distinct from absence).
  readonly errored?: boolean;
  // The recorded error reason (audit), distinct from a missing value.
  readonly errorReason?: string;
  // True once two writes DISAGREED on this key this turn (H3 conflict).
  readonly conflicted?: boolean;
  // Count of value-writes seen (drives conflict detection independent of value).
  readonly writeCount: number;
}

/**
 * The Evidence Ledger (SDD §G / v1.1 §7) — a single PER-TURN SNAPSHOT. Construct
 * one per turn; Read + Action `record*` evidence into it; the Claims Kernel
 * `resolve`s keys out of it. Every mutation advances a monotonic `version` token
 * that identifies the snapshot's revision.
 *
 * NOT a cache across turns: a new turn => a new `EvidenceLedger`. The snapshot
 * boundary is what makes "two reads of the same key in one turn" (H3) and
 * "must_read_this_turn" (H4) well-defined.
 *
 * Pure data structure: no clock, RNG, or IO. `fetchedAt` timestamps arrive from
 * callers; the version token is a deterministic in-memory counter.
 */
export class EvidenceLedger {
  // Monotonic snapshot revision; advances on EVERY mutation. Starts at 0 (empty
  // snapshot), so the first write yields version 1. Never decreases, never
  // resets within a ledger instance.
  #version = 0;

  // A stable identifier for THIS snapshot instance — lets a resolution name the
  // snapshot it came from (the "identifies the snapshot" half of AC1). The pair
  // (snapshotId, version) uniquely names a point-in-time revision.
  readonly #snapshotId: string;

  readonly #cells = new Map<string, Cell>();

  /**
   * @param snapshotId Optional caller-supplied snapshot identity (e.g. a turn
   *   id). When omitted, a deterministic per-instance counter id is used so the
   *   ledger needs no RNG; distinct instances still get distinct ids.
   */
  constructor(snapshotId?: string) {
    this.#snapshotId = snapshotId ?? `snapshot-${EvidenceLedger.#nextId()}`;
  }

  // Deterministic, monotonic instance-id source (no RNG). Module-private.
  static #idCounter = 0;
  static #nextId(): number {
    EvidenceLedger.#idCounter += 1;
    return EvidenceLedger.#idCounter;
  }

  /** The current monotonic version/sequence token of this snapshot (AC1). */
  get version(): number {
    return this.#version;
  }

  /** The stable identity of this snapshot instance (AC1 — identifies snapshot). */
  get snapshotId(): string {
    return this.#snapshotId;
  }

  /**
   * Record an evidence entry for a key (Read/Action write path). Advances the
   * version token monotonically.
   *
   * **Same-key conflict → UNKNOWN (H3):** a SECOND write to a key whose stored
   * value DIFFERS from the new one raises the key's `conflicted` flag (and keeps
   * last-write-wins for the stored `entry`, per §G "last-write-wins **and** a
   * conflict flag"). A subsequent `resolve` of a conflicted key yields
   * `UNKNOWN`, never the last-written value as a validated concrete. A repeated
   * write of the SAME value does not conflict (idempotent re-read).
   *
   * Writing over a previously-errored key is itself a conflict-class event: an
   * error and a value disagree about whether the read succeeded, so the key is
   * marked conflicted (the safest interpretation — never silently let a later
   * value erase a recorded error).
   */
  record(entry: EvidenceEntryInput): void {
    const prior = this.#cells.get(entry.key);
    this.#version += 1;

    if (prior === undefined) {
      this.#cells.set(entry.key, { entry, writeCount: 1 });
      return;
    }

    // A value-write after a recorded error (or vice versa) is a disagreement
    // about whether the read succeeded — conflict, fail closed.
    const conflictsWithError = prior.errored === true;
    // Two value-writes that DISAGREE on the value are a conflict (H3). Equal
    // values are an idempotent re-read and do NOT conflict.
    const disagrees =
      prior.entry !== undefined && !sameValue(prior.entry.value, entry.value);

    this.#cells.set(entry.key, {
      // last-write-wins for the stored entry (§G), even on conflict.
      entry,
      conflicted: prior.conflicted === true || conflictsWithError || disagrees,
      // An error flag is sticky across a later value-write (the disagreement is
      // preserved as a conflict above; we no longer claim a clean error state).
      writeCount: prior.writeCount + 1,
    });
  }

  /**
   * Record a read ERROR for a key (Read fail-closed path — Inv 7). This is a
   * DISTINCT state from absence: an errored key resolves `UNKNOWN`-or-safer, but
   * its resolution `state` is `"error"`, not `"absent"`. Advances the version.
   *
   * Recording an error after a value-write (or vice versa) marks the key
   * `conflicted` — the two disagree about whether the read succeeded; fail
   * closed rather than letting either win silently.
   */
  recordError(key: string, reason: string): void {
    const prior = this.#cells.get(key);
    this.#version += 1;

    if (prior === undefined) {
      this.#cells.set(key, { errored: true, errorReason: reason, writeCount: 0 });
      return;
    }

    // An error after a value-write disagrees with that value → conflict.
    const conflictsWithValue = prior.entry !== undefined;
    this.#cells.set(key, {
      ...prior,
      errored: true,
      errorReason: reason,
      conflicted: prior.conflicted === true || conflictsWithValue,
    });
  }

  /**
   * Resolve a key against the snapshot (Claims Kernel read path; SDD §G; Inv 7;
   * H3). Returns the distinguishable `state` AND a safe verdict floor:
   *
   *   - never written      → `{ state: "absent",   verdict: "UNKNOWN" }`
   *   - error recorded     → `{ state: "error",    verdict: "UNKNOWN" }`
   *   - conflicting writes → `{ state: "conflict", verdict: "UNKNOWN" }`
   *   - clean single write → `{ state: "present",  verdict: "UNKNOWN", entry }`
   *
   * For EVERY non-`present` state, NO concrete `value`/`entry` is exposed — a
   * read error, an absence, and a conflict are all "no concrete value" to a
   * consumer reading `entry`, while `state` keeps them distinct (Inv 7 / H3).
   * `present` exposes the entry but still reports `verdict: "UNKNOWN"` because
   * the ledger is NOT the soundness authority — VALIDATED is the predicate's call.
   */
  resolve(key: string): EvidenceResolution {
    const cell = this.#cells.get(key);

    // Absence — the key was never written this turn (Inv 7: distinct from error).
    if (cell === undefined) {
      return { key, state: "absent", verdict: "UNKNOWN" };
    }

    // Conflict takes precedence (H3): a poisoned key never exposes a value, even
    // though last-write-wins kept an `entry`. Checked before `error`/`present`.
    if (cell.conflicted === true) {
      return { key, state: "conflict", verdict: "UNKNOWN" };
    }

    // Error (Inv 7) — distinct state from absence; fail closed, no value.
    if (cell.errored === true) {
      return { key, state: "error", verdict: "UNKNOWN" };
    }

    // Present — a single, un-conflicted, non-error value. Expose the entry; the
    // verdict floor stays UNKNOWN (soundness, not the ledger, decides VALIDATED).
    if (cell.entry !== undefined) {
      return { key, state: "present", verdict: "UNKNOWN", entry: cell.entry };
    }

    // Defensive: a cell with neither entry, error, nor conflict is an absence.
    return { key, state: "absent", verdict: "UNKNOWN" };
  }

  /** Is `key` resolvable to a concrete, un-conflicted, non-error value? */
  has(key: string): boolean {
    return this.resolve(key).state === "present";
  }

  /** The recorded error reason for an errored key, else `undefined` (audit). */
  errorReason(key: string): string | undefined {
    const cell = this.#cells.get(key);
    return cell?.errored === true ? cell.errorReason : undefined;
  }

  /** The keys recorded in this snapshot (any state). Stable insertion order. */
  keys(): readonly string[] {
    return [...this.#cells.keys()];
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Internal value equality — drives H3 conflict detection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Structural equality for two evidence values, used ONLY to decide whether a
 * second write to a key DISAGREES (H3 conflict) or is an idempotent re-read.
 * Deterministic; handles primitives, arrays, and plain objects (the shapes
 * evidence values take). NaN is treated as equal-to-NaN here (a re-read of a
 * NaN-valued field is not a conflict). Conservative: when in doubt about deep
 * structural identity it returns `false`, so the SAFE direction (flag a
 * conflict) is the default — never a missed conflict.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // Object.is distinguishes NaN===NaN as true already; +0/-0 as false. Treat
  // -0 and +0 as the same value for a re-read (not a conflict).
  if (a === 0 && b === 0) return true;

  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false; // primitives already handled above

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;

  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameValue(a[i], b[i])) return false;
    }
    return true;
  }

  // Plain objects: compare own enumerable keys structurally.
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!sameValue(aObj[k], bObj[k])) return false;
  }
  return true;
}
