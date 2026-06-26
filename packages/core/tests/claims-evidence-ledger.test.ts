/**
 * Q2 — The Evidence Ledger (SDD §G; v1.1 §7; Inv 7).
 *
 * Proves the seven acceptance clauses of §G / Inv 7:
 *   AC1 per-turn snapshot + monotonic version/sequence token (identifies snapshot)
 *   AC2 entry shape EXACTLY §G (fetchedAt timestamp NOT boolean; PerEnvelopeResult)
 *   AC3 same-key conflict → UNKNOWN (H3) — last-write-wins AND conflict flag
 *   AC4 read ERROR ≠ read ABSENCE (Inv 7) — both UNKNOWN-or-safer, distinct states
 *   AC5 originProvenance survives persistence (C3) — UNTRUSTED never washes to TRUSTED
 *   AC6 sourceMode faithfully recorded — "cache" distinguishable from "live"
 *   AC7 kernel purity (§R) — no downstream import
 *
 * Imports the code-under-test via the package self-reference `@adjudicate/core`
 * (vitest aliases it to src/index.ts), the repo `tests/` convention.
 *
 * NON-VACUITY: the AC3 (conflict→UNKNOWN) and AC4 (error≠absence) suites each
 * carry a comment naming the guard whose removal/inversion turns the test RED;
 * verified RED transiently during authoring (see sdd_selfcheck).
 */

import { describe, expect, it } from "vitest";
import {
  EvidenceLedger,
  LEDGER_TAINTS,
  ORIGIN_PROVENANCES,
  isLedgerTaint,
  isOriginProvenance,
  type EvidenceEntry,
  type EvidenceResolution,
  type LedgerTaint,
  type OriginProvenance,
  type PerEnvelopeResult,
  type SourceMode,
} from "@adjudicate/core";

// A small builder so each test states only the field it exercises; the rest are
// faithful §G defaults (a live, trusted, this-turn read). The origin axis
// defaults to TRUSTED_THIRD_PARTY — a generic trusted read is NOT first-party
// (fail-closed mapping, SDD §G / §J.3); only an explicit first-party mint earns
// FIRST_PARTY.
function entry(over: Partial<EvidenceEntry> & Pick<EvidenceEntry, "key">): EvidenceEntry {
  return {
    value: "v",
    source: "test-read",
    fetchedAt: 1_000,
    sourceMode: "live",
    taint: "TRUSTED",
    originProvenance: "TRUSTED_THIRD_PARTY",
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// AC1 — per-turn snapshot + monotonic version/sequence token
// ─────────────────────────────────────────────────────────────────────────

describe("AC1 — per-turn snapshot with a monotonic version token (§G/§7)", () => {
  it("a fresh ledger starts at version 0 with a stable snapshot identity", () => {
    const led = new EvidenceLedger("turn-42");
    expect(led.version).toBe(0);
    expect(led.snapshotId).toBe("turn-42");
  });

  it("each mutation advances the version token monotonically (record + recordError)", () => {
    const led = new EvidenceLedger();
    expect(led.version).toBe(0);

    led.record(entry({ key: "a" }));
    expect(led.version).toBe(1);

    led.record(entry({ key: "b" }));
    expect(led.version).toBe(2);

    // recordError is ALSO a mutation — it must advance the token (not just record).
    led.recordError("c", "read failed");
    expect(led.version).toBe(3);

    // A second write to an existing key still advances (it changes the snapshot).
    led.record(entry({ key: "a", value: "v2" }));
    expect(led.version).toBe(4);
  });

  it("the version strictly increases across a sequence of mutations (never resets/decreases)", () => {
    const led = new EvidenceLedger();
    const versions: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      led.record(entry({ key: `k${i}` }));
      versions.push(led.version);
    }
    // Strictly increasing 1..5 — monotonic, no reset, no repeat.
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < versions.length; i += 1) {
      expect(versions[i]!).toBeGreaterThan(versions[i - 1]!);
    }
  });

  it("two distinct ledger instances are distinct snapshots (the (id,version) pair names a revision)", () => {
    const a = new EvidenceLedger();
    const b = new EvidenceLedger();
    // Auto-assigned ids are distinct — a per-turn snapshot is per-instance, not
    // shared global state.
    expect(a.snapshotId).not.toBe(b.snapshotId);
    a.record(entry({ key: "x" }));
    // Mutating one snapshot does not advance the other's token.
    expect(a.version).toBe(1);
    expect(b.version).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC2 — entry shape EXACTLY §G (fetchedAt timestamp; PerEnvelopeResult)
// ─────────────────────────────────────────────────────────────────────────

describe("AC2 — entry shape EXACTLY §G/§7 (fetchedAt is a timestamp, not a boolean)", () => {
  it("a recorded entry round-trips every §G field through resolve", () => {
    const led = new EvidenceLedger();
    const e = entry({
      key: "ORDER_FULFILLMENT_STAGE",
      value: { stage: "EN_ROUTE" },
      source: "getById:order-1",
      fetchedAt: 1_718_000_000_000,
      sourceMode: "live",
      taint: "TRUSTED",
      originProvenance: "TRUSTED_THIRD_PARTY",
    });
    led.record(e);

    const r = led.resolve("ORDER_FULFILLMENT_STAGE");
    expect(r.state).toBe("present");
    expect(r.entry).toBeDefined();
    const got = r.entry!;
    expect(got.key).toBe("ORDER_FULFILLMENT_STAGE");
    expect(got.value).toEqual({ stage: "EN_ROUTE" });
    expect(got.source).toBe("getById:order-1");
    expect(got.fetchedAt).toBe(1_718_000_000_000);
    expect(got.sourceMode).toBe("live");
    expect(got.taint).toBe("TRUSTED");
    expect(got.originProvenance).toBe("TRUSTED_THIRD_PARTY");
  });

  it("fetchedAt is a numeric timestamp — H4: cache cannot masquerade as live via a boolean", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "k", fetchedAt: 1_500 }));
    const got = led.resolve("k").entry!;
    // The field is a NUMBER (timestamp), never a boolean. A boolean `true` would
    // erase the live-vs-cache distinction H4 protects.
    expect(typeof got.fetchedAt).toBe("number");
    expect(typeof got.fetchedAt).not.toBe("boolean");
  });

  it("taint uses the §G two-value vocabulary EXACTLY {TRUSTED, UNTRUSTED_DATA}", () => {
    // §G / §7: taint is "TRUSTED" | "UNTRUSTED_DATA" — NOT the payload Taint
    // lattice {SYSTEM,TRUSTED,UNTRUSTED}. Exactly two members, in spec order.
    expect(LEDGER_TAINTS).toEqual(["TRUSTED", "UNTRUSTED_DATA"]);
    expect(LEDGER_TAINTS).toHaveLength(2);
    for (const t of LEDGER_TAINTS) expect(isLedgerTaint(t)).toBe(true);
    // Lattice-only / junk values are rejected — proves it is NOT the Taint type.
    for (const notLedgerTaint of ["SYSTEM", "UNTRUSTED", "trusted", "", "TAINTED"]) {
      expect(isLedgerTaint(notLedgerTaint)).toBe(false);
    }
    for (const notString of [null, undefined, 0, {}, []]) {
      expect(isLedgerTaint(notString)).toBe(false);
    }
  });

  it("PerEnvelopeResult[] is representable on dispatch — partial commits (H10/Inv4)", () => {
    const led = new EvidenceLedger();
    // A fan-out where envelope A settled but envelope B failed — the partial
    // commit IS representable as distinct per-envelope results (Inv 4), not a
    // single turn-wide boolean.
    const dispatch: PerEnvelopeResult[] = [
      { envelopeId: "env-A", success: true, settled: true },
      { envelopeId: "env-B", success: false, settled: false },
    ];
    led.record(entry({ key: "ACTION_OUTCOME", value: "done", dispatch }));
    const got = led.resolve("ACTION_OUTCOME").entry!;
    expect(got.dispatch).toEqual(dispatch);
    expect(got.dispatch).toHaveLength(2);
    // settlement ≠ session (Inv 4): success and settled are distinct fields.
    expect(got.dispatch![0]!.success).toBe(true);
    expect(got.dispatch![0]!.settled).toBe(true);
    expect(got.dispatch![1]!.success).toBe(false);
    expect(got.dispatch![1]!.settled).toBe(false);
  });

  it("dispatch is OPTIONAL — a plain read entry carries no dispatch", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "plain-read" }));
    expect(led.resolve("plain-read").entry!.dispatch).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC3 — same-key conflict → UNKNOWN (H3) — NON-VACUITY GUARD
// ─────────────────────────────────────────────────────────────────────────

describe("AC3 — same-key conflict → UNKNOWN (H3): last-write-wins AND a conflict flag", () => {
  // NON-VACUITY: the guard under test is `resolve`'s `cell.conflicted` branch
  // (returns {state:"conflict", verdict:"UNKNOWN"} with NO entry) combined with
  // `record`'s `disagrees` conflict detection. Disable EITHER — make resolve
  // expose the last-written entry on conflict, OR drop the disagrees flag — and
  // the two assertions below ("state is conflict, NOT present" / "no concrete
  // value escapes") go RED. Verified RED transiently when the guard was inverted.
  it("two DISAGREEING writes to a key → resolve yields UNKNOWN/conflict, NOT v2-as-validated", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "ORDER_STATUS", value: "v1" }));
    led.record(entry({ key: "ORDER_STATUS", value: "v2" }));

    const r = led.resolve("ORDER_STATUS");
    // The conflicted key resolves UNKNOWN/conflict — NEVER the last value as a
    // readable concrete. This is the H3 guard; if `resolve` returned the entry on
    // conflict, `state` would be "present" and `entry` would be v2 → RED.
    expect(r.state).toBe("conflict");
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.entry).toBeUndefined(); // no concrete value escapes (the safety floor)
  });

  it("repeated write of the SAME value is an idempotent re-read — NOT a conflict", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "STORE_OPEN_NOW", value: { open: true } }));
    led.record(entry({ key: "STORE_OPEN_NOW", value: { open: true } }));
    const r = led.resolve("STORE_OPEN_NOW");
    // Equal re-reads do NOT poison the key — only DISAGREEMENT is a conflict (§G).
    expect(r.state).toBe("present");
    expect(r.entry!.value).toEqual({ open: true });
  });

  it("last-write-wins is preserved for the STORED entry even though resolve hides it (§G)", () => {
    // §G: "last-write-wins AND a conflict flag". The conflict flag forces resolve
    // to UNKNOWN, but the snapshot still retains v2 as the last write — so a fresh
    // disagreeing write that AGREES with v2 leaves it conflicted (sticky), proving
    // the conflict is not silently cleared by convergence.
    const led = new EvidenceLedger();
    led.record(entry({ key: "k", value: "v1" }));
    led.record(entry({ key: "k", value: "v2" })); // disagree → conflict raised
    led.record(entry({ key: "k", value: "v2" })); // agrees with last write
    const r = led.resolve("k");
    // Conflict is sticky — a later agreeing write does not "heal" a poisoned key.
    expect(r.state).toBe("conflict");
    expect(r.entry).toBeUndefined();
  });

  it("a single un-conflicted write resolves present (the conflict branch is not spuriously taken)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "solo", value: 7 }));
    const r = led.resolve("solo");
    expect(r.state).toBe("present");
    expect(r.entry!.value).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC4 — read ERROR ≠ read ABSENCE (Inv 7) — NON-VACUITY GUARD
// ─────────────────────────────────────────────────────────────────────────

describe("AC4 — read ERROR ≠ read ABSENCE (Inv 7): both UNKNOWN-or-safer, distinct states", () => {
  // NON-VACUITY: the guard is the separate `state: "error"` vs `state: "absent"`
  // branches in `resolve`. Collapse them — make recordError a no-op so an errored
  // key reads "absent", OR make resolve return the same state for both — and the
  // "states are DISTINCT" assertion goes RED while the "both UNKNOWN" assertion
  // stays green (proving the test pins distinctness, not just the verdict).
  // Verified RED transiently when the two states were collapsed to one.
  it("an errored key and an absent key are DISTINCT states, both resolving UNKNOWN-or-safer", () => {
    const led = new EvidenceLedger();
    led.recordError("READ_FAILED_KEY", "downstream 500");
    // ABSENT_KEY is never written.

    const err = led.resolve("READ_FAILED_KEY");
    const absent = led.resolve("ABSENT_KEY");

    // BOTH resolve to UNKNOWN-or-safer with NO concrete value (the fail-closed floor).
    expect(err.verdict).toBe("UNKNOWN");
    expect(absent.verdict).toBe("UNKNOWN");
    expect(err.entry).toBeUndefined();
    expect(absent.entry).toBeUndefined();

    // YET they are DISTINGUISHABLE states — error ≠ absence (Inv 7). If the two
    // collapsed, this is RED.
    expect(err.state).toBe("error");
    expect(absent.state).toBe("absent");
    expect(err.state).not.toBe(absent.state);
  });

  it("the error reason is retained (audit) and distinguishes error from absence", () => {
    const led = new EvidenceLedger();
    led.recordError("k", "redis timeout");
    // An errored key surfaces its reason; an absent key has none.
    expect(led.errorReason("k")).toBe("redis timeout");
    expect(led.errorReason("never-written")).toBeUndefined();
  });

  it("recording an error on a key that has a value → conflict (fail closed, never silent overwrite)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "k", value: "live-value" }));
    led.recordError("k", "later read failed");
    const r = led.resolve("k");
    // A value and an error disagree about read success → conflict (UNKNOWN, no
    // value). The recorded value must NOT win silently over a subsequent error.
    expect(r.state).toBe("conflict");
    expect(r.entry).toBeUndefined();
  });

  it("a value written AFTER an error → conflict (an error is never silently erased by a value)", () => {
    const led = new EvidenceLedger();
    led.recordError("k", "first read failed");
    led.record(entry({ key: "k", value: "late-value" }));
    const r = led.resolve("k");
    expect(r.state).toBe("conflict");
    expect(r.entry).toBeUndefined();
  });

  it("has() is true ONLY for a clean present value (false for absent/error/conflict)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "present" }));
    led.recordError("errored", "boom");
    led.record(entry({ key: "conflicted", value: "a" }));
    led.record(entry({ key: "conflicted", value: "b" }));

    expect(led.has("present")).toBe(true);
    expect(led.has("absent")).toBe(false);
    expect(led.has("errored")).toBe(false);
    expect(led.has("conflicted")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC5 — originProvenance survives persistence (C3)
// ─────────────────────────────────────────────────────────────────────────

describe("AC5 — originProvenance survives persistence (C3): UNTRUSTED never washes to TRUSTED", () => {
  it("an UNTRUSTED_DATA-origin row keeps originProvenance=UNTRUSTED_DATA across reads", () => {
    const led = new EvidenceLedger();
    // A row written from an UNTRUSTED ingress — its content trust may differ, but
    // its ORIGIN provenance must persist as UNTRUSTED_DATA (Inv 3 / C3).
    led.record(
      entry({
        key: "USER_SUPPLIED_ADDRESS",
        value: "Rua X, 123",
        taint: "UNTRUSTED_DATA",
        originProvenance: "UNTRUSTED_DATA",
      }),
    );
    // Read it back twice — provenance does not "wash" to TRUSTED on persistence.
    const r1 = led.resolve("USER_SUPPLIED_ADDRESS");
    const r2 = led.resolve("USER_SUPPLIED_ADDRESS");
    expect(r1.entry!.originProvenance).toBe("UNTRUSTED_DATA");
    expect(r2.entry!.originProvenance).toBe("UNTRUSTED_DATA");
    // It is NOT silently upgraded to a trusted class — never washes up to
    // FIRST_PARTY (nor TRUSTED_THIRD_PARTY); the origin axis only ever stays-or-
    // is the recorded class (SDD §G C3).
    expect(r1.entry!.originProvenance).not.toBe("FIRST_PARTY");
    expect(r1.entry!.originProvenance).not.toBe("TRUSTED_THIRD_PARTY");
  });

  it("originProvenance is INDEPENDENT of the content taint (a TRUSTED-content/UNTRUSTED-origin row keeps both)", () => {
    const led = new EvidenceLedger();
    // Two distinct axes (§G): a value can be content-TRUSTED yet originate from an
    // UNTRUSTED ingress — both survive, neither overwrites the other.
    led.record(
      entry({
        key: "mixed",
        taint: "TRUSTED",
        originProvenance: "UNTRUSTED_DATA",
      }),
    );
    const got = led.resolve("mixed").entry!;
    expect(got.taint).toBe("TRUSTED");
    expect(got.originProvenance).toBe("UNTRUSTED_DATA"); // origin axis preserved
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1 — OriginProvenance is a 3-value origin axis, distinct from the 2-value
// read-layer LedgerTaint (SDD §G / §J.3). DE-VACUUMS the first_party_only gate.
// ─────────────────────────────────────────────────────────────────────────

describe("R1 — OriginProvenance: a 3-value origin axis DISTINCT from the 2-value LedgerTaint (§G/§J.3)", () => {
  it("ORIGIN_PROVENANCES has EXACTLY the three §G origin classes in spec order", () => {
    // Acceptance (a): exactly the three values. A 4th/renamed member fails toEqual.
    expect(ORIGIN_PROVENANCES).toEqual([
      "FIRST_PARTY",
      "TRUSTED_THIRD_PARTY",
      "UNTRUSTED_DATA",
    ]);
    expect(ORIGIN_PROVENANCES).toHaveLength(3);
    for (const o of ORIGIN_PROVENANCES) expect(isOriginProvenance(o)).toBe(true);
  });

  it("the two axes are DISTINCT: LedgerTaint stays 2-valued; neither vocabulary subsumes the other", () => {
    // NON-VACUITY: if originProvenance were still typed/valued as LedgerTaint, a
    // first-party / trusted-third-party origin would be unrepresentable and these
    // membership facts would not hold. The two membership sets are disjoint at the
    // distinguishing members.
    expect(LEDGER_TAINTS).toHaveLength(2);
    expect(LEDGER_TAINTS).not.toContain("FIRST_PARTY");
    expect(LEDGER_TAINTS).not.toContain("TRUSTED_THIRD_PARTY");
    // A TRUSTED_THIRD_PARTY / FIRST_PARTY origin class is NOT a ledger taint.
    expect(isLedgerTaint("TRUSTED_THIRD_PARTY")).toBe(false);
    expect(isLedgerTaint("FIRST_PARTY")).toBe(false);
    // The read-layer-only "TRUSTED" is NOT an origin class (the axes differ).
    expect(isOriginProvenance("TRUSTED")).toBe(false);
    expect(ORIGIN_PROVENANCES).not.toContain("TRUSTED");
  });

  it("type-level witness: a TRUSTED_THIRD_PARTY origin types as OriginProvenance and lands on an entry", () => {
    // A compile-time + runtime witness that EvidenceEntry.originProvenance carries
    // the 3-value axis (not LedgerTaint). If originProvenance were retyped back to
    // LedgerTaint, this annotation/assignment would not type-check.
    const origin: OriginProvenance = "TRUSTED_THIRD_PARTY";
    const led = new EvidenceLedger();
    led.record(entry({ key: "k", originProvenance: origin }));
    const got = led.resolve("k").entry!;
    expect(got.originProvenance).toBe("TRUSTED_THIRD_PARTY");
    expect(isOriginProvenance(got.originProvenance)).toBe(true);
  });
});

describe("R1 — fail-closed origin default: a generic trusted read is NOT first-party (§G)", () => {
  it("a record built from a generic trusted read carries TRUSTED_THIRD_PARTY, NOT FIRST_PARTY", () => {
    // Acceptance (c) [non-vacuous]: the fail-closed mapping maps a generic/old-style
    // trusted read to TRUSTED_THIRD_PARTY — which a later first_party_only gate MUST
    // REFUSE. A FIRST_PARTY default would wrongly pass that gate (the very money
    // guarantee this de-vacuuming protects). Nothing is auto-promoted to FIRST_PARTY.
    const led = new EvidenceLedger();
    led.record(entry({ key: "generic-trusted-read" })); // builder default origin
    const got = led.resolve("generic-trusted-read").entry!;
    expect(got.originProvenance).toBe("TRUSTED_THIRD_PARTY");
    expect(got.originProvenance).not.toBe("FIRST_PARTY");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1 — sameValue conservative reject of non-plain objects (H3 conflict for
// distinct exotics) — NON-VACUITY GUARD (evidence-ledger.ts sameValue)
// ─────────────────────────────────────────────────────────────────────────

describe("R1 — sameValue rejects non-plain objects so distinct exotics surface an H3 conflict", () => {
  // NON-VACUITY: the guard is sameValue's prototype reject. Remove it (fall through
  // to own-enumerable-key compare) and two DISTINCT Dates compare EQUAL (each has
  // zero own enumerable keys) → the second write is treated as an idempotent re-read
  // → state "present" instead of "conflict" → every assertion below goes RED.
  it("two DISTINCT Date values under one key → conflict/UNKNOWN (not silently equal)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "T", value: new Date(1_000) }));
    led.record(entry({ key: "T", value: new Date(2_000) }));
    const r = led.resolve("T");
    expect(r.state).toBe("conflict");
    expect(r.entry).toBeUndefined();
  });

  it("two DISTINCT Map values under one key → conflict/UNKNOWN", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "M", value: new Map([["a", 1]]) }));
    led.record(entry({ key: "M", value: new Map([["a", 2]]) }));
    expect(led.resolve("M").state).toBe("conflict");
  });

  it("two DISTINCT Set values under one key → conflict/UNKNOWN", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "S", value: new Set([1]) }));
    led.record(entry({ key: "S", value: new Set([2]) }));
    expect(led.resolve("S").state).toBe("conflict");
  });

  it("two NON-reference-identical class instances → conflict (conservative; cannot prove identity)", () => {
    class Box {
      constructor(readonly n: number) {}
    }
    const led = new EvidenceLedger();
    led.record(entry({ key: "B", value: new Box(1) }));
    led.record(entry({ key: "B", value: new Box(1) })); // equal fields, distinct ref
    expect(led.resolve("B").state).toBe("conflict");
  });

  it("the SAME exotic reference re-read is idempotent (Object.is short-circuit) → present (no false conflict)", () => {
    // Proves the reject does not OVER-flag: a genuine idempotent re-read of the SAME
    // Date reference is not a conflict (Object.is returns true before the reject).
    const d = new Date(1_000);
    const led = new EvidenceLedger();
    led.record(entry({ key: "T", value: d }));
    led.record(entry({ key: "T", value: d }));
    expect(led.resolve("T").state).toBe("present");
  });
});

describe("R1 — sameValue still equates equal primitives + equal PLAIN objects (no false conflicts)", () => {
  // NON-VACUITY: if the reject were too broad (also rejecting plain objects), these
  // idempotent re-reads would FALSELY conflict → RED. It pins that the reject is
  // scoped to non-plain objects only.
  it("equal primitives re-read → present (no conflict)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "p", value: 42 }));
    led.record(entry({ key: "p", value: 42 }));
    expect(led.resolve("p").state).toBe("present");
  });

  it("structurally-equal PLAIN objects (nested arrays + objects) re-read → present", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "o", value: { a: 1, b: [2, 3], c: { d: 4 } } }));
    led.record(entry({ key: "o", value: { a: 1, b: [2, 3], c: { d: 4 } } }));
    expect(led.resolve("o").state).toBe("present");
  });

  it("null-prototype plain objects are still structurally compared (getPrototypeOf === null) → present", () => {
    const mk = (): Record<string, unknown> => {
      const o = Object.create(null) as Record<string, unknown>;
      o.x = 1;
      return o;
    };
    const led = new EvidenceLedger();
    led.record(entry({ key: "np", value: mk() }));
    led.record(entry({ key: "np", value: mk() }));
    expect(led.resolve("np").state).toBe("present");
  });

  it("DISTINCT plain objects still conflict (the reject did NOT disable plain-object compare)", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "o2", value: { a: 1 } }));
    led.record(entry({ key: "o2", value: { a: 2 } }));
    expect(led.resolve("o2").state).toBe("conflict");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC6 — sourceMode faithfully recorded ("cache" distinguishable from "live")
// ─────────────────────────────────────────────────────────────────────────

describe("AC6 — sourceMode faithfully recorded: cache distinguishable from live at read time", () => {
  it("a cache entry reads back sourceMode=cache; a live entry reads back live", () => {
    const led = new EvidenceLedger();
    led.record(entry({ key: "from-cache", sourceMode: "cache", fetchedAt: 500 }));
    led.record(entry({ key: "from-live", sourceMode: "live", fetchedAt: 999 }));

    const cached = led.resolve("from-cache").entry!;
    const live = led.resolve("from-live").entry!;

    // The distinction Q3's soundness rule depends on is preserved verbatim — a
    // cache row can NEVER masquerade as live (this is what lets Q3 reject a
    // must_read_this_turn validated from cache). Q2 only RECORDS it faithfully.
    expect(cached.sourceMode).toBe("cache");
    expect(live.sourceMode).toBe("live");
    expect(cached.sourceMode).not.toBe(live.sourceMode);
    // Each carries its OWN fetchedAt — a cache row's stamp is its own, not a
    // fabricated live one (H4).
    expect(cached.fetchedAt).toBe(500);
    expect(live.fetchedAt).toBe(999);
  });

  it("sourceMode is a faithful field, not derived — both members are representable", () => {
    const modes: SourceMode[] = ["live", "cache"];
    const led = new EvidenceLedger();
    for (const m of modes) led.record(entry({ key: m, sourceMode: m }));
    for (const m of modes) {
      expect(led.resolve(m).entry!.sourceMode).toBe(m);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC7 — kernel purity (§R): no downstream import
// ─────────────────────────────────────────────────────────────────────────

describe("AC7 — kernel purity (§R): the module imports nothing downstream/out-of-repo", () => {
  it("type-level: EvidenceResolution + LedgerTaint are usable from @adjudicate/core alone", () => {
    // A compile-time witness — these symbols resolve from the kernel package's
    // own barrel. If the module reached into @claustrum/@ibatexas, the build
    // (typecheck) would fail before this test ever ran.
    const t: LedgerTaint = LEDGER_TAINTS[0]!;
    const led = new EvidenceLedger();
    led.record(entry({ key: "k", taint: t }));
    const r: EvidenceResolution = led.resolve("k");
    expect(r.state).toBe("present");
  });
});
