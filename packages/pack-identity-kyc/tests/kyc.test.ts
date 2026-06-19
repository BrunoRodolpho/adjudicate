import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import { IdentityKycPack } from "../src/index.js";
import {
  KYC_DOCUMENTS_UPLOADED_SIGNAL,
  KYC_VENDOR_COMPLETED_SIGNAL,
  type AmlStatus,
  type IdentityKycState,
  type KycSession,
} from "../src/types.js";

/**
 * Async lifecycle simulation — proves the framework handles time.
 *
 * The "runtime" is simulated inline: between adjudicate() calls, the
 * test updates the state map as a real runtime would (parking the
 * intent on DEFER, waking it on signal, advancing the session through
 * status transitions). This exercises the kernel's deterministic
 * adjudication on a multi-stage state machine — the property that
 * separates adjudicate from atomic-only rules engines.
 */

const policy = IdentityKycPack.policy;

function emptyState(): IdentityKycState {
  return { sessions: new Map() };
}

function withSession(
  state: IdentityKycState,
  session: KycSession,
): IdentityKycState {
  const next = new Map(state.sessions);
  next.set(session.id, session);
  return { sessions: next };
}

function timestamp(): string {
  return new Date("2026-04-28T12:00:00.000Z").toISOString();
}

describe("pack-identity-kyc — full async happy path", () => {
  it("start → DEFER, upload → DEFER, vendor callback (CLEAR, score 95) → EXECUTE", () => {
    let state = emptyState();

    // ─── Step 1 ─── kyc.start
    // The user begins the KYC flow. The kernel must DEFER, parking the
    // intent until the user uploads documents.
    const start = buildEnvelope({
      kind: "kyc.start",
      payload: { sessionId: "s1", userId: "u1" },
      actor: { principal: "user", sessionId: "u1" },
      taint: "UNTRUSTED",
      nonce: "n1-start",
      createdAt: timestamp(),
    });
    const d1 = adjudicate(start, state, policy);
    expect(d1.kind).toBe("DEFER");
    if (d1.kind === "DEFER") {
      expect(d1.signal).toBe(KYC_DOCUMENTS_UPLOADED_SIGNAL);
      expect(d1.timeoutMs).toBeGreaterThan(0);
    }

    // ─── Runtime simulation ─── intent parked. Adopter creates the
    // session in DOCS_REQUIRED state.
    state = withSession(state, {
      id: "s1",
      userId: "u1",
      status: "DOCS_REQUIRED",
      documents: [],
      createdAt: timestamp(),
    });

    // ─── Step 2 ─── kyc.document.upload
    // User uploads passport. Kernel DEFERs again, parking the intent
    // until the vendor verification webhook arrives.
    const upload = buildEnvelope({
      kind: "kyc.document.upload",
      payload: {
        sessionId: "s1",
        documentType: "PASSPORT",
        documentRef: "doc-abc",
      },
      actor: { principal: "user", sessionId: "u1" },
      taint: "UNTRUSTED",
      nonce: "n2-upload",
      createdAt: timestamp(),
    });
    const d2 = adjudicate(upload, state, policy);
    expect(d2.kind).toBe("DEFER");
    if (d2.kind === "DEFER") {
      expect(d2.signal).toBe(KYC_VENDOR_COMPLETED_SIGNAL);
    }

    // ─── Runtime simulation ─── doc accepted, vendor verification
    // initiated. Session advances to VENDOR_PENDING.
    state = withSession(state, {
      id: "s1",
      userId: "u1",
      status: "VENDOR_PENDING",
      documents: [
        { type: "PASSPORT", status: "PENDING", uploadedAt: timestamp() },
      ],
      createdAt: timestamp(),
    });

    // ─── Step 3 ─── kyc.vendor.callback (CLEAR, score 95)
    // Vendor webhook fires with a passing score and clear AML check.
    // Kernel EXECUTEs — the verification completes successfully.
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 95, amlStatus: "CLEAR" },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n3-callback",
      createdAt: timestamp(),
    });
    const d3 = adjudicate(callback, state, policy);
    expect(d3.kind).toBe("EXECUTE");
    if (d3.kind === "EXECUTE") {
      const flat = d3.basis.map((b) => `${b.category}:${b.code}`);
      expect(flat).toContain("business:rule_satisfied");
      expect(flat).toContain("state:transition_valid");
    }
  });
});

// ── 101 §6 / T6: FROZEN AmlStatus enum-shape lock (two-valued, UPPERCASE) ──
// The escalate discriminator (`amlStatus !== "FLAGGED"`) is only well-defined
// if the enum stays exactly {"CLEAR","FLAGGED"}. This is a COMPILE-TIME lock:
// if AmlStatus ever drifts (extra value, lowercase, rename), one of these
// assignments stops type-checking and `pnpm build`/`test` fails. It is the
// type-side complement to the runtime drift-closure tests below.
type _AmlIsExactlyClearOrFlagged = AmlStatus extends "CLEAR" | "FLAGGED"
  ? "CLEAR" | "FLAGGED" extends AmlStatus
    ? true
    : never
  : never;
const _amlEnumFrozen: _AmlIsExactlyClearOrFlagged = true;
void _amlEnumFrozen;

describe("pack-identity-kyc — terminal Decision branches", () => {
  const baseState = withSession(emptyState(), {
    id: "s1",
    userId: "u1",
    status: "VENDOR_PENDING",
    documents: [
      { type: "PASSPORT", status: "PENDING", uploadedAt: timestamp() },
    ],
    createdAt: timestamp(),
  });

  it("AML flag → ESCALATE with operator-actionable reason", () => {
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: {
        sessionId: "s1",
        score: 88,
        amlStatus: "FLAGGED",
        amlMatchScore: 88,
        amlMatchEntity: "OFAC SDN List",
      },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-aml",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    expect(d.kind).toBe("ESCALATE");
    if (d.kind === "ESCALATE") {
      expect(d.to).toBe("human");
      // The reason must surface match score + entity for the Operator
      // Console (Phase 2a) governance event log. Visible in the
      // KillSwitchPanel's `<EmergencyHistoryList>` analogue once the
      // Console renders ESCALATE events.
      expect(d.reason).toMatch(/AML Watchlist Hit/);
      expect(d.reason).toMatch(/88%/);
      expect(d.reason).toMatch(/OFAC SDN List/);
    }
  });

  it("AML flag wins even with high score (guard ordering)", () => {
    // Critical ordering invariant: a high-score callback that ALSO has
    // AML flag must escalate, not execute. The escalateOnAmlFlag guard
    // appears before executeOnHighScore in the business list.
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: {
        sessionId: "s1",
        score: 99,
        amlStatus: "FLAGGED",
        amlMatchScore: 92,
        amlMatchEntity: "Interpol Red Notice",
      },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-aml-highscore",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    expect(d.kind).toBe("ESCALATE");
  });

  it("low score (no AML flag) → REFUSE with structured reason", () => {
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 30, amlStatus: "CLEAR" },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-low",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    expect(d.kind).toBe("REFUSE");
    if (d.kind === "REFUSE") {
      expect(d.refusal.kind).toBe("BUSINESS_RULE");
      expect(d.refusal.code).toBe("kyc.verification_score_too_low");
      expect(d.refusal.detail).toContain("score=30/100");
    }
  });

  it("borderline score (75, CLEAR) falls through to default REFUSE", () => {
    // 50 ≤ score < 90 with CLEAR aml: no specific guard fires;
    // policy.default = REFUSE produces the conservative outcome.
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 75, amlStatus: "CLEAR" },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-border",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    expect(d.kind).toBe("REFUSE");
  });

  it("high score, CLEAR → EXECUTE", () => {
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 92, amlStatus: "CLEAR" },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-high",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    expect(d.kind).toBe("EXECUTE");
  });

  // ── 101 §3 drift-closure backstop (the defect this contract closes) ──
  // The escalate discriminator is `amlStatus !== "FLAGGED"`. The public web
  // schema USED to advertise the lowercase 3-value enum `"clear" | "hit" |
  // "pending"`. A callback sent with a documented-but-unenforced value (e.g.
  // "hit") silently fails the `=== "FLAGGED"` check, never escalates, and falls
  // through to score handling / default REFUSE. This is exactly the silent
  // non-escalation path 101 closes by aligning the doc to the enforced enum.
  // These tests PIN that only the enforced "FLAGGED" value escalates, so the
  // doc-vs-enforced drift can never silently re-open a bypass.
  it("a documented-but-unenforced AML value (lowercase \"hit\") does NOT escalate", () => {
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      // High score; if "hit" silently fell through to score handling, it would
      // EXECUTE. The drift fix means "hit" is no longer a documented value at
      // all; the enforced enum is "FLAGGED". This pins the non-escalation so the
      // hazard is visible and the doc must track the enforced shape.
      payload: { sessionId: "s1", score: 99, amlStatus: "hit" as unknown as "FLAGGED" },
      actor: { principal: "system", sessionId: "vendor-webhook" },
      taint: "TRUSTED",
      nonce: "n-aml-lowercase",
      createdAt: timestamp(),
    });
    const d = adjudicate(callback, baseState, policy);
    // The escalate guard does NOT fire on "hit"; the high score EXECUTEs. This
    // demonstrates WHY the documented enum must equal the enforced enum: a
    // documented value that is not "FLAGGED" bypasses escalation entirely.
    expect(d.kind).not.toBe("ESCALATE");
  });

  it("ONLY the enforced UPPERCASE \"FLAGGED\" value escalates over any score", () => {
    // Conformance fixture for the frozen contract: across the whole score range,
    // FLAGGED always ESCALATEs (signal beats score), and CLEAR never does.
    for (const score of [0, 30, 49, 50, 75, 89, 90, 99, 100]) {
      const flagged = buildEnvelope({
        kind: "kyc.vendor.callback",
        payload: { sessionId: "s1", score, amlStatus: "FLAGGED" },
        actor: { principal: "system", sessionId: "vendor-webhook" },
        taint: "TRUSTED",
        nonce: `n-flagged-${score}`,
        createdAt: timestamp(),
      });
      expect(adjudicate(flagged, baseState, policy).kind).toBe("ESCALATE");

      const clear = buildEnvelope({
        kind: "kyc.vendor.callback",
        payload: { sessionId: "s1", score, amlStatus: "CLEAR" },
        actor: { principal: "system", sessionId: "vendor-webhook" },
        taint: "TRUSTED",
        nonce: `n-clear-${score}`,
        createdAt: timestamp(),
      });
      // CLEAR never escalates (it EXECUTEs / REFUSEs by score), proving the
      // discriminator is the AML enum, not a side effect of the score path.
      expect(adjudicate(clear, baseState, policy).kind).not.toBe("ESCALATE");
    }
  });
});

describe("pack-identity-kyc — taint policy", () => {
  it("rejects kyc.vendor.callback with UNTRUSTED taint (LLM cannot forge webhooks)", () => {
    // The vendor callback intent kind requires TRUSTED taint. An LLM
    // proposing a vendor callback with UNTRUSTED is the classic attack
    // vector ("LLM tells the system the verification passed"). The
    // kernel's taint guard refuses before any business guard runs.
    const callback = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 99, amlStatus: "CLEAR" },
      actor: { principal: "llm", sessionId: "session-llm-attack" },
      taint: "UNTRUSTED", // ← the offending value
      nonce: "n-attack",
      createdAt: timestamp(),
    });
    const d = adjudicate(
      callback,
      withSession(emptyState(), {
        id: "s1",
        userId: "u1",
        status: "VENDOR_PENDING",
        documents: [],
        createdAt: timestamp(),
      }),
      policy,
    );
    expect(d.kind).toBe("REFUSE");
    if (d.kind === "REFUSE") {
      // Kernel's taint guard surfaces a basis with category "taint".
      const flat = d.basis.map((b) => `${b.category}:${b.code}`);
      expect(flat.some((b) => b.startsWith("taint:"))).toBe(true);
    }
  });
});
