/**
 * PR #45 code-review fixes — regression suite (one `describe` per finding).
 *
 * Each behavioral fix has a test that FAILS against the pre-fix code and PASSES
 * after. The kernel posture is fail-closed + demote-only + additive; these tests
 * pin exactly that. F2 is a documentation-scope fix (no behavior change), so its
 * block is a CHARACTERIZATION test that pins the precise, now-documented scope of
 * the C6 / CanonicalClaim guarantee.
 *
 * Imports the code-under-test via the package self-reference `@adjudicate/core`
 * (vitest aliases it to src/index.ts), the repo `tests/` convention.
 */

import { describe, expect, it } from "vitest";
import {
  EvidenceLedger,
  STAGE_FAIL_CLOSED_TERMINAL,
  claimAllowed,
  classifyEvidenceRequirementDiff,
  compileClaimDefinition,
  defineClaim,
  detectCrossKeyConflicts,
  isFalsifierSetMonotone,
  lit,
  prop,
  runClaimsKernel,
  unwrapCanonical,
  validateClaimDefinition,
  type CandidateClaim,
  type ClaimsKernelDeps,
  type ClaimsKernelResult,
  type CompiledRegistrySpec,
  type CrossKeyConflict,
  type EvidenceRequirement,
  type MinimalClaim,
  type SoundnessDeps,
} from "@adjudicate/core";

const NOW = 10_000;

/** A public (ownerless), static, structured evidence requirement. */
function req(key: string, over: Partial<EvidenceRequirement> = {}): EvidenceRequirement {
  return {
    key,
    ownershipPolicy: "not_applicable",
    freshnessPolicy: "static",
    sourceIntegrity: "structured",
    provenancePolicy: "preserve",
    ...over,
  };
}

/** Record a present, live, trusted ledger entry. */
function recordTrusted(ledger: EvidenceLedger, key: string, value: unknown): void {
  ledger.record({
    key,
    value,
    source: "test",
    fetchedAt: NOW,
    sourceMode: "live",
    taint: "TRUSTED",
    // A generic trusted read is NOT first-party (fail-closed origin, §G/§J.3).
    originProvenance: "TRUSTED_THIRD_PARTY",
  });
}

/**
 * A falsifier-COMPLETE public claim (validates when its key is present). The
 * default falsifier targets a key that is never recorded, so it never fires.
 */
function publicClaim(
  r: EvidenceRequirement,
  over: Partial<MinimalClaim> = {},
): MinimalClaim {
  return {
    requiredEvidence: [r],
    minSourceIntegrity: "structured",
    kind: "read_claim",
    actor: "actor-1",
    falsifierComplete: true,
    falsifiers: [req("_never_recorded")],
    ...over,
  };
}

const DEPS: ClaimsKernelDeps = {
  soundness: { owns: () => false, outcomeConfirmed: () => false, now: NOW },
};

// ─────────────────────────────────────────────────────────────────────────
// F1 — renderableCanonical must be EMPTY on every non-RENDER terminal.
// ─────────────────────────────────────────────────────────────────────────

describe("F1 — renderableCanonical is empty on a non-RENDER (ESCALATE) terminal", () => {
  it("does NOT mint a CanonicalClaim when the turn ESCALATEs but a lone survivor exists", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "key-a", "present");
    recordTrusted(ledger, "key-b", "present");

    // subjectA: two SAME-type VALIDATED claims with CONFLICTING rendered values →
    // SAME_TYPE_VALUE_CONFLICT → both suppressed → consistency terminal ESCALATE.
    // (Value-agnostic: no valueBinding, so both validate regardless of value.)
    // subjectB: a lone VALIDATED claim with no same-subject peer → it SURVIVES into
    // consistency.renderable even though the TURN escalated.
    const candidates: readonly CandidateClaim[] = [
      { soundness: publicClaim(req("key-a")), subject: "orderA", type: "STORE_HOURS", value: "10-22" },
      { soundness: publicClaim(req("key-a")), subject: "orderA", type: "STORE_HOURS", value: "08-18" },
      { soundness: publicClaim(req("key-b")), subject: "orderB", type: "STORE_HOURS", value: "ok" },
    ];

    const result = runClaimsKernel(ledger, candidates, DEPS);

    // The TURN ESCALATEs (subjectA conflicted)…
    expect(result.terminal).toBe("ESCALATE");
    // …yet consistency still carries subjectB's lone survivor in `renderable`…
    expect(result.renderable.length).toBeGreaterThan(0);
    // …but the kernel-minted RENDERER INPUT is EMPTY on a non-RENDER terminal (F1).
    expect(result.renderableCanonical).toHaveLength(0);
  });

  it("still mints on a genuine RENDER terminal (non-vacuity)", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "key-b", "present");
    const result = runClaimsKernel(
      ledger,
      [{ soundness: publicClaim(req("key-b")), subject: "orderB", type: "STORE_HOURS", value: "ok" }],
      DEPS,
    );
    expect(result.terminal).toBe("RENDER");
    expect(result.renderableCanonical).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F2 — the minted CanonicalClaim value is NARROWED to its C6-proven slice.
// (RESOLVED — a BEHAVIOR fix: the mint now strips unbound model siblings.)
// ─────────────────────────────────────────────────────────────────────────

describe("F2 — minted CanonicalClaim value is narrowed to the C6-bound path", () => {
  it("carries the ledger-derived bound path and STRIPS the unvalidated sibling", () => {
    const ledger = new EvidenceLedger();
    // The ledger holds ONLY the bound field; the model adds a surplus sibling.
    recordTrusted(ledger, "schedule", { open: true });

    const claim = publicClaim(req("schedule"), {
      valueBinding: { key: "schedule", path: ["open"] },
    });
    const candidates: readonly CandidateClaim[] = [
      {
        soundness: claim,
        subject: "store-1",
        type: "STORE_OPEN_NOW",
        value: { open: true, message: "venha nos visitar!" }, // sibling = model prose
      },
    ];

    const result = runClaimsKernel(ledger, candidates, DEPS);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderableCanonical).toHaveLength(1);

    const minted = unwrapCanonical(result.renderableCanonical[0]!);
    const value = minted.value as { open?: boolean; message?: string };
    // GUARANTEE that holds: the C6-bound path is still present and equals the ledger
    // value — projectValue(value, ["open"]) yields the same bound scalar as before.
    expect(value.open).toBe(true);
    // CORRECTED EXPECTATION — F2 previously asserted the sibling RODE THROUGH
    // UNVALIDATED (`value.message === "venha nos visitar!"`). The mint now NARROWS the
    // value to ONLY the bound path (kernels.ts `pickPath`), so the model-authored
    // sibling is GONE — it can no longer be reached via `unwrapCanonical`.
    expect("message" in value).toBe(false);
    expect(value.message).toBeUndefined();
  });

  it("a no-valueBinding renderable type carries its value UNCHANGED (non-vacuity control)", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "key-b", "present");
    // No `valueBinding` declared → C6 never ran, and INV-1 means the render block has
    // no proposition slot reading this value, so the whole model value must survive
    // the mint untouched (the narrowing must NOT regress the value-agnostic path).
    const modelValue = { open: true, message: "venha nos visitar!" };
    const candidates: readonly CandidateClaim[] = [
      { soundness: publicClaim(req("key-b")), subject: "store-2", type: "STORE_HOURS", value: modelValue },
    ];

    const result = runClaimsKernel(ledger, candidates, DEPS);
    expect(result.terminal).toBe("RENDER");
    expect(result.renderableCanonical).toHaveLength(1);

    const minted = unwrapCanonical(result.renderableCanonical[0]!);
    expect(minted.value).toEqual({ open: true, message: "venha nos visitar!" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F3 — a THROW in the P1 stage fails CLOSED (ESCALATE+empty), never crashes.
// ─────────────────────────────────────────────────────────────────────────

describe("F3 — a P1 (claimAllowed) throw fails CLOSED, never escapes runClaimsKernel", () => {
  it("a falsifierComplete-with-no-falsifiers candidate → ESCALATE + empty, no throw", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "k", "v");
    const candidates: readonly CandidateClaim[] = [
      {
        soundness: {
          requiredEvidence: [req("k")],
          minSourceIntegrity: "structured",
          kind: "read_claim",
          actor: "a",
          falsifierComplete: true,
          falsifiers: [], // §R lying case → assertFalsifierDeclaration THROWS in P1.
        },
        subject: "s",
        type: "T",
        value: 1,
      },
    ];
    const run = (): ClaimsKernelResult => runClaimsKernel(ledger, candidates, DEPS);
    expect(run).not.toThrow();
    const result = run();
    expect(result.terminal).toBe(STAGE_FAIL_CLOSED_TERMINAL);
    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(0);
    expect(result.renderableCanonical).toHaveLength(0);
    expect(result.perClaim).toHaveLength(0); // no trustworthy verdicts survive a P1 throw.
  });

  it("a valueBinding.key outside requiredEvidence (registry typo) → ESCALATE + empty, no throw", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "k", "v");
    const candidates: readonly CandidateClaim[] = [
      {
        soundness: publicClaim(req("k"), { valueBinding: { key: "not-a-required-key" } }),
        subject: "s",
        type: "T",
        value: 1,
      },
    ];
    const run = (): ClaimsKernelResult => runClaimsKernel(ledger, candidates, DEPS);
    expect(run).not.toThrow();
    const result = run();
    expect(result.terminal).toBe("ESCALATE");
    expect(result.renderable).toHaveLength(0);
    expect(result.renderableCanonical).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F4 — isFalsifierSetMonotone also guards the source-integrity FLOOR.
// ─────────────────────────────────────────────────────────────────────────

describe("F4 — isFalsifierSetMonotone catches a lowered source-integrity floor", () => {
  const base: CompiledRegistrySpec = {
    kind: "read_claim",
    minSourceIntegrity: "first_party_verified",
    requiredEvidence: [req("k")],
    customerScoped: false,
    falsifierComplete: true,
    falsifiers: [req("f")],
  };

  it("LOWERING minSourceIntegrity (same falsifier keys) is NOT monotone-safe", () => {
    const newer: CompiledRegistrySpec = { ...base, minSourceIntegrity: "free_text" };
    expect(isFalsifierSetMonotone(base, newer)).toBe(false);
  });

  it("an EQUAL or RAISED floor (same falsifier keys) stays monotone-safe (non-vacuity)", () => {
    expect(isFalsifierSetMonotone(base, { ...base })).toBe(true); // equal floor
    const lowFloor: CompiledRegistrySpec = { ...base, minSourceIntegrity: "free_text" };
    expect(isFalsifierSetMonotone(lowFloor, base)).toBe(true); // raised free_text → first_party_verified
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F5 — a cacheable ttl change to/from reindex_bound is not silently dropped.
// ─────────────────────────────────────────────────────────────────────────

describe("F5 — cacheable ttl change to/from reindex_bound is classified, not dropped", () => {
  const cacheable = (ttl: number | "reindex_bound"): EvidenceRequirement =>
    req("price", { freshnessPolicy: { kind: "cacheable", ttl } });

  it("numeric → reindex_bound is RELAXATION (not provably non-loosening)", () => {
    const findings = classifyEvidenceRequirementDiff(cacheable(30), cacheable("reindex_bound"));
    expect(findings.some((f) => f.kind === "RELAXATION")).toBe(true);
  });

  it("reindex_bound → numeric is RELAXATION", () => {
    const findings = classifyEvidenceRequirementDiff(cacheable("reindex_bound"), cacheable(30));
    expect(findings.some((f) => f.kind === "RELAXATION")).toBe(true);
  });

  it("reindex_bound → reindex_bound is NO change (no relaxation) — non-vacuity", () => {
    const findings = classifyEvidenceRequirementDiff(
      cacheable("reindex_bound"),
      cacheable("reindex_bound"),
    );
    expect(findings.filter((f) => f.kind === "RELAXATION")).toHaveLength(0);
  });

  it("numeric widen still RELAXATION; numeric shrink still ADDITIVE (preserved)", () => {
    expect(
      classifyEvidenceRequirementDiff(cacheable(30), cacheable(3600)).some((f) => f.kind === "RELAXATION"),
    ).toBe(true);
    expect(
      classifyEvidenceRequirementDiff(cacheable(3600), cacheable(30)).some((f) => f.kind === "ADDITIVE"),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F6 — an error/conflict falsifier DEMOTES the base claim (fail-closed).
// ─────────────────────────────────────────────────────────────────────────

describe("F6 — an error/conflict falsifier demotes the base claim, symmetric with the base axis", () => {
  const deps: SoundnessDeps = { owns: () => false, outcomeConfirmed: () => false, now: NOW };
  const paidClaim: MinimalClaim = {
    requiredEvidence: [req("payment-paid")],
    minSourceIntegrity: "structured",
    kind: "read_claim",
    actor: "a",
    falsifierComplete: true,
    falsifiers: [req("refund")],
  };

  it("a declared falsifier whose read ERRORED demotes VALIDATED → UNKNOWN (end-to-end)", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "payment-paid", true);
    ledger.recordError("refund", "read failed this turn");
    expect(claimAllowed(paidClaim, ledger, deps)).toBe("UNKNOWN");
  });

  it("an ABSENT falsifier lets the claim STAND (VALIDATED) — non-vacuity", () => {
    const ledger = new EvidenceLedger();
    recordTrusted(ledger, "payment-paid", true);
    // "refund" never recorded → absent → does not fire.
    expect(claimAllowed(paidClaim, ledger, deps)).toBe("VALIDATED");
  });

  it("ledger primitive: error falsifier → conflict; absent falsifier → base stands", () => {
    const led = new EvidenceLedger();
    recordTrusted(led, "base", "v");
    led.recordError("err", "boom");
    expect(led.resolveAgainstFalsifiers("base", ["err"]).state).toBe("conflict");
    expect(led.resolveAgainstFalsifiers("base", ["missing"]).state).toBe("present");
  });

  it("detectCrossKeyConflicts is SYMMETRIC: an ERRORED falsifier falsifies the base; an ABSENT one does not", () => {
    const led = new EvidenceLedger();
    recordTrusted(led, "payment-paid", true);
    recordTrusted(led, "open-now", "aberto");
    led.recordError("refund", "read failed this turn"); // falsifier ERRORED → fires.
    // "override" never recorded → absent → does NOT fire.
    const table: readonly CrossKeyConflict[] = [
      { key: "payment-paid", falsifierKey: "refund" },
      { key: "open-now", falsifierKey: "override" },
    ];
    // payment-paid is falsified by the errored refund (fail-closed); open-now stands.
    expect(detectCrossKeyConflicts(led, table)).toEqual(["payment-paid"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F7 — the compiler rejects a render PROPOSITION with no valueBinding.
// ─────────────────────────────────────────────────────────────────────────

describe("F7 — compiler rejects a render proposition with no valueBinding (no self-failing fixture)", () => {
  it("a render PROPOSITION with NO valueBinding → compile THROWS (fail-closed)", () => {
    const bad = defineClaim({
      type: "F7_BAD",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      requiredEvidence: [req("k")],
      render: { validated: [lit("Período: "), prop("mealPeriod"), lit(".")] },
    });
    expect(() => compileClaimDefinition(bad)).toThrow(/valueBinding/);
  });

  it("the SAME source WITH a valueBinding compiles and its fixtures.valid VALIDATES", () => {
    const good = defineClaim({
      type: "F7_GOOD",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      requiredEvidence: [req("k")],
      valueBinding: { key: "k" },
      render: { validated: [lit("Período: "), prop("mealPeriod"), lit(".")] },
    });
    const out = compileClaimDefinition(good);
    expect(validateClaimDefinition(out.fixtures.valid).ok).toBe(true);
  });

  it("a LITERAL-only render with no valueBinding does NOT throw (non-vacuity)", () => {
    const litOnly = defineClaim({
      type: "F7_LIT",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      requiredEvidence: [req("k")],
      render: { validated: [lit("Olá.")] },
    });
    expect(() => compileClaimDefinition(litOnly)).not.toThrow();
  });
});
