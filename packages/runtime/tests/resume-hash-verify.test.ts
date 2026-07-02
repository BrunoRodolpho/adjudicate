/**
 * T-008: integration test for resume-hash verification.
 *
 * Per ADR-106 (resume-hash verification, M1): if the parked envelope blob
 * is mutated between park and resume — e.g. an attacker with Redis write
 * access modifies the stored payload — the resume side MUST detect the
 * tamper and refuse to resume.
 *
 * The verification works by re-deriving `sha256Canonical({version, kind,
 * payload, nonce, actor, taint, origin})` (041 added `origin` to the recipe)
 * and comparing to the stored `intentHash`.
 */
import { describe, expect, it } from "vitest"
import { buildEnvelope, deriveIntentHash, sha256Canonical } from "@adjudicate/core"
import {
  parkDeferredIntent,
  resumeDeferredIntent,
  verifyParkedEnvelopeHash,
  verifyResourceBinding,
  type DeferRedis,
  type ParkRedis,
  type ParkedEnvelope,
} from "../src/index.js"

// Minimal in-memory Redis shim matching DeferRedis & ParkRedis.
function createMemoryRedis(): DeferRedis & ParkRedis {
  const map = new Map<string, { value: string; expiresAt: number }>()
  const counters = new Map<string, number>()
  const alive = (e?: { expiresAt: number }) =>
    e !== undefined && e.expiresAt > Date.now()
  return {
    async get(k) {
      const e = map.get(k)
      return alive(e) ? (e!.value as string) : null
    },
    async set(k: string, v: string, opts: { NX?: true; EX: number }) {
      const e = map.get(k)
      if (opts.NX && alive(e)) return null
      map.set(k, { value: v, expiresAt: Date.now() + opts.EX * 1000 })
      return "OK"
    },
    async del(k) {
      map.delete(k)
      counters.delete(k)
      return 1
    },
    async incr(k) {
      const n = (counters.get(k) ?? 0) + 1
      counters.set(k, n)
      return n
    },
    async decr(k) {
      const n = (counters.get(k) ?? 0) - 1
      counters.set(k, n)
      return n
    },
    async expire() {
      return 1
    },
  }
}

const ENVELOPE = buildEnvelope({
  kind: "pix.charge.create",
  payload: { amountCentavos: 1000 },
  actor: { principal: "llm" as const, sessionId: "s-1" },
  taint: "UNTRUSTED" as const,
  nonce: "fixed-nonce-001",
})

const RK = (raw: string) => raw

describe("T-008: park + resume with hash verification", () => {
  it("happy path: park then resume verifies and returns parked", async () => {
    const redis = createMemoryRedis()
    const parkResult = await parkDeferredIntent({
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      ttlSeconds: 600,
      redis,
      rk: RK,
    })
    expect(parkResult.parked).toBe(true)

    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "strict",
    })
    expect(result.resumed).toBe(true)
    expect(result.intentHash).toBe(ENVELOPE.intentHash)
  })

  it("tampered payload → resume refuses with park_blob_tampered", async () => {
    const redis = createMemoryRedis()
    await parkDeferredIntent({
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      ttlSeconds: 600,
      redis,
      rk: RK,
    })

    // Attacker mutates the parked blob: change the amount.
    const parkKey = `defer:pending:${ENVELOPE.actor.sessionId}`
    const raw = await redis.get(parkKey)
    expect(raw).not.toBeNull()
    const tampered = JSON.parse(raw!) as ParkedEnvelope
    const mutatedBlob = {
      ...tampered,
      envelope: {
        ...tampered.envelope,
        payload: { amountCentavos: 999_999_999 }, // 10x the original
      },
    }
    await redis.set(parkKey, JSON.stringify(mutatedBlob), { EX: 600 })

    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "warn", // warn mode still fails-closed on tamper
    })
    expect(result.resumed).toBe(false)
    expect(result.reason).toBe("park_blob_tampered")
  })

  it("legacy blob (no verification fields) + strict mode → fails-closed", async () => {
    const redis = createMemoryRedis()
    // Park without verification fields (simulate a v0.1 adopter blob).
    const legacyBlob: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    await redis.set(
      `defer:pending:${ENVELOPE.actor.sessionId}`,
      JSON.stringify(legacyBlob),
      { EX: 600 },
    )

    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "strict",
    })
    expect(result.resumed).toBe(false)
    expect(result.reason).toBe("park_blob_unverifiable")
  })

  it("legacy blob + warn mode → resumes with warning", async () => {
    const redis = createMemoryRedis()
    const legacyBlob: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    await redis.set(
      `defer:pending:${ENVELOPE.actor.sessionId}`,
      JSON.stringify(legacyBlob),
      { EX: 600 },
    )

    const warned: Record<string, unknown>[] = []
    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "warn",
      log: { warn: (obj) => warned.push(obj) },
    })
    expect(result.resumed).toBe(true)
    expect(warned.some((w) => "intentHash" in w)).toBe(true)
  })

  it("verifyHash=off skips verification entirely", async () => {
    const redis = createMemoryRedis()
    const tamperedBlob: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash, // stored hash unchanged
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: { amountCentavos: 1 }, // mutated
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      parkedAt: new Date().toISOString(),
    }
    await redis.set(
      `defer:pending:${ENVELOPE.actor.sessionId}`,
      JSON.stringify(tamperedBlob),
      { EX: 600 },
    )

    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "off",
    })
    expect(result.resumed).toBe(true) // bypass: NOT recommended
  })

  it("SecurityReviewer-010: default is strict — a legacy blob is refused when verifyHash is omitted", async () => {
    const redis = createMemoryRedis()
    // Legacy blob (no version/nonce/taint/actorPrincipal) → unverifiable.
    const legacyBlob: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    await redis.set(
      `defer:pending:${ENVELOPE.actor.sessionId}`,
      JSON.stringify(legacyBlob),
      { EX: 600 },
    )

    const result = await resumeDeferredIntent({
      sessionId: ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      // verifyHash intentionally OMITTED — exercises the default (now "strict").
    })
    // Under the old "warn" default this resumed:true; strict-by-default fails closed.
    expect(result.resumed).toBe(false)
    expect(result.reason).toBe("park_blob_unverifiable")
  })
})

describe("verifyParkedEnvelopeHash unit tests", () => {
  it("returns verified=true for honest blob", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBe(true)
  })

  it("041: a blob missing only `origin` is treated as missing_fields (post-041 recipe)", () => {
    // origin is part of the intentHash recipe since 041; a blob carrying the
    // other verification fields but no origin cannot re-derive its stored
    // hash, so it falls on the legacy missing_fields path (fail-closed).
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        // origin intentionally absent
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBeNull()
    expect(v.reason).toBe("missing_fields")
  })

  it("returns verified=null when fields missing", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBeNull()
    expect(v.reason).toBe("missing_fields")
  })

  it("returns verified=false on derivation mismatch", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: "0000000000000000",
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBe(false)
    if (v.verified === false) {
      expect(v.derived).not.toBe("0000000000000000")
      expect(v.stored).toBe("0000000000000000")
    }
  })

  it("derivation reproduces buildEnvelope hash exactly", () => {
    // Belt + braces: the verification math matches buildEnvelope's math.
    // 041 added `origin` to the recipe, so the shadow re-derivation includes
    // it too — otherwise it drifts from buildEnvelope and the check is vacuous.
    const derived = sha256Canonical({
      version: ENVELOPE.version,
      kind: ENVELOPE.kind,
      payload: ENVELOPE.payload,
      nonce: ENVELOPE.nonce,
      actor: ENVELOPE.actor,
      taint: ENVELOPE.taint,
      origin: ENVELOPE.origin,
    })
    expect(derived).toBe(ENVELOPE.intentHash)
  })
})

/**
 * 023 T4 — drift cross-check: the resource-binding pre-image
 * (`verifyResourceBinding` / `deriveIntentHash`) and the parked-envelope
 * pre-image (`verifyParkedEnvelopeHash`) MUST be the SAME canonical recipe. If
 * they diverge, the executor seam would honor a payload the resume path rejects
 * (or vice-versa) and replay (#5) breaks. This pins they re-derive the SAME hash
 * for the SAME envelope (non-vacuous: it equals the stored intentHash).
 */
describe("023 — resource-binding pre-image equals the parked-envelope pre-image (no drift)", () => {
  it("both verifiers re-derive the SAME intentHash for the same envelope", () => {
    // The parked-envelope verifier's pre-image (re-derived inside it).
    const parkedPreimage = sha256Canonical({
      version: ENVELOPE.version,
      kind: ENVELOPE.kind,
      payload: ENVELOPE.payload,
      nonce: ENVELOPE.nonce,
      actor: ENVELOPE.actor,
      taint: ENVELOPE.taint,
      origin: ENVELOPE.origin,
    })
    // The resource-binding verifier's pre-image (deriveIntentHash).
    const bindingPreimage = deriveIntentHash(ENVELOPE)
    expect(bindingPreimage).toBe(parkedPreimage)
    expect(bindingPreimage).toBe(ENVELOPE.intentHash)

    // And both verifiers agree the honest envelope is intact/bound.
    expect(verifyResourceBinding(ENVELOPE).bound).toBe(true)
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(true)
  })

  it("a payload swap breaks BOTH verifiers identically (shared fence)", () => {
    const swapped = { ...ENVELOPE, payload: { amountCentavos: 999_999_999 } }
    // Resource-binding: not bound.
    expect(verifyResourceBinding(swapped).bound).toBe(false)
    // Parked-envelope verifier over the same swapped content + stale stored hash.
    const tamperedParked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash, // stale (bound to original payload)
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: swapped.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(tamperedParked).verified).toBe(false)
  })
})

/**
 * H2 — the parked-envelope verifier MUST include `resourceRefs` (031) in its
 * re-derivation, because `buildEnvelope`/`deriveIntentHash` bind it into the
 * `intentHash`. Before this fix the verifier OMITTED `resourceRefs`, so any
 * resource-BOUND DEFER (the canonical pack-payments-pix charge-awaiting-webhook
 * flow) re-derived a DIFFERENT hash and false-tampered → `park_blob_tampered`
 * under the default strict policy, refusing a LEGITIMATE resume.
 *
 * Non-vacuity: `RES_ENVELOPE` carries NON-EMPTY `resourceRefs`, so its
 * `intentHash` differs from the no-refs envelope's. With the verifier omitting
 * `resourceRefs`, the round-trip below derives the no-refs hash and FAILS
 * (`verified:false`/`park_blob_tampered`); the fix makes it match.
 */
const RES_ENVELOPE = buildEnvelope({
  kind: "pix.charge.create",
  payload: { amountCentavos: 1000 },
  actor: { principal: "llm" as const, sessionId: "s-res" },
  taint: "UNTRUSTED" as const,
  nonce: "fixed-nonce-res-001",
  resourceRefs: { account: "acct_7", owner: "user_42" },
})

describe("H2 — resource-bound DEFER resume includes resourceRefs in the verifier", () => {
  it("non-vacuity guard: carrying resourceRefs changes the intentHash", () => {
    // If resourceRefs did NOT affect the hash, omitting it from the verifier
    // would be harmless and this whole suite would be vacuous. It DOES change it.
    const noRefs = buildEnvelope({
      kind: "pix.charge.create",
      payload: { amountCentavos: 1000 },
      actor: { principal: "llm" as const, sessionId: "s-res" },
      taint: "UNTRUSTED" as const,
      nonce: "fixed-nonce-res-001",
    })
    expect(RES_ENVELOPE.intentHash).not.toBe(noRefs.intentHash)
    // The verifier's full recipe (incl. resourceRefs) reproduces the bound hash.
    const derivedWithRefs = sha256Canonical({
      version: RES_ENVELOPE.version,
      kind: RES_ENVELOPE.kind,
      payload: RES_ENVELOPE.payload,
      nonce: RES_ENVELOPE.nonce,
      actor: RES_ENVELOPE.actor,
      taint: RES_ENVELOPE.taint,
      origin: RES_ENVELOPE.origin,
      resourceRefs: RES_ENVELOPE.resourceRefs,
    })
    expect(derivedWithRefs).toBe(RES_ENVELOPE.intentHash)
    // …and the recipe that OMITS resourceRefs (the pre-fix verifier) does NOT.
    const derivedWithoutRefs = sha256Canonical({
      version: RES_ENVELOPE.version,
      kind: RES_ENVELOPE.kind,
      payload: RES_ENVELOPE.payload,
      nonce: RES_ENVELOPE.nonce,
      actor: RES_ENVELOPE.actor,
      taint: RES_ENVELOPE.taint,
      origin: RES_ENVELOPE.origin,
    })
    expect(derivedWithoutRefs).not.toBe(RES_ENVELOPE.intentHash)
  })

  it("verifyParkedEnvelopeHash verifies a resource-bound blob (not tampered)", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: RES_ENVELOPE.intentHash,
        kind: RES_ENVELOPE.kind,
        actor: { sessionId: RES_ENVELOPE.actor.sessionId },
        payload: RES_ENVELOPE.payload,
        version: RES_ENVELOPE.version,
        nonce: RES_ENVELOPE.nonce,
        taint: RES_ENVELOPE.taint,
        actorPrincipal: RES_ENVELOPE.actor.principal,
        origin: RES_ENVELOPE.origin,
        resourceRefs: RES_ENVELOPE.resourceRefs,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    // Pre-fix this returned { verified:false, reason:"tampered" }.
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(true)
  })

  it("strict park → resume round-trip with NON-EMPTY resourceRefs resumes (not tampered)", async () => {
    const redis = createMemoryRedis()
    const parkResult = await parkDeferredIntent({
      envelope: {
        intentHash: RES_ENVELOPE.intentHash,
        kind: RES_ENVELOPE.kind,
        actor: { sessionId: RES_ENVELOPE.actor.sessionId },
        payload: RES_ENVELOPE.payload,
        version: RES_ENVELOPE.version,
        nonce: RES_ENVELOPE.nonce,
        taint: RES_ENVELOPE.taint,
        actorPrincipal: RES_ENVELOPE.actor.principal,
        origin: RES_ENVELOPE.origin,
        resourceRefs: RES_ENVELOPE.resourceRefs,
      },
      signal: "pix.confirmed",
      ttlSeconds: 600,
      redis,
      rk: RK,
    })
    expect(parkResult.parked).toBe(true)

    const result = await resumeDeferredIntent({
      sessionId: RES_ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "strict",
    })
    // Pre-fix: { resumed:false, reason:"park_blob_tampered" } — a legitimate
    // resume refused. Post-fix: resumes cleanly.
    expect(result.resumed).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.intentHash).toBe(RES_ENVELOPE.intentHash)
  })

  it("no-regression (WS7): a NO-role blob still verifies byte-identically", () => {
    // ENVELOPE has no actor.role. The verifier reconstructs the actor with
    // `role: e.actorRole` (undefined here), which canonicalize drops — so the
    // derived hash is byte-identical to the pre-role verifier and this blob
    // must STILL verify (no golden-vector regression).
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
        // actorRole intentionally absent
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(true)
  })

  it("no-regression: a NO-resourceRefs blob still verifies byte-identically", () => {
    // ENVELOPE has no resourceRefs. Passing `resourceRefs: undefined` is
    // canonical-dropped, so the derived hash is byte-identical to the pre-fix
    // verifier — this blob must STILL verify (no golden-vector regression).
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ENVELOPE.intentHash,
        kind: ENVELOPE.kind,
        actor: { sessionId: ENVELOPE.actor.sessionId },
        payload: ENVELOPE.payload,
        version: ENVELOPE.version,
        nonce: ENVELOPE.nonce,
        taint: ENVELOPE.taint,
        actorPrincipal: ENVELOPE.actor.principal,
        origin: ENVELOPE.origin,
        // resourceRefs intentionally absent
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(true)
    // Belt + braces: the verifier's no-refs derivation equals buildEnvelope's.
    const derivedNoRefs = sha256Canonical({
      version: ENVELOPE.version,
      kind: ENVELOPE.kind,
      payload: ENVELOPE.payload,
      nonce: ENVELOPE.nonce,
      actor: ENVELOPE.actor,
      taint: ENVELOPE.taint,
      origin: ENVELOPE.origin,
      resourceRefs: undefined,
    })
    expect(derivedNoRefs).toBe(ENVELOPE.intentHash)
  })
})

/**
 * WS7 — a role-CARRYING envelope (`actor.role`, the opaque adopter role
 * carrier) binds the role into `intentHash` via `actor`, so the parked blob
 * MUST store it (`actorRole`) and the verifier MUST re-derive with it —
 * otherwise every role-carrying resume false-tampers (`park_blob_tampered`),
 * exactly the 031/H2 failure mode replayed on the actor axis.
 *
 * Non-vacuity: `ROLE_ENVELOPE` carries a role, so its `intentHash` differs
 * from the no-role envelope's; a re-derivation that DROPS the role derives
 * the no-role hash and fails.
 */
const ROLE_ENVELOPE = buildEnvelope({
  kind: "pix.charge.create",
  payload: { amountCentavos: 1000 },
  actor: { principal: "user" as const, sessionId: "s-role", role: "MANAGER" },
  taint: "UNTRUSTED" as const,
  nonce: "fixed-nonce-role-001",
})

describe("WS7 — role-carrying DEFER park/resume round-trips with an identical intentHash", () => {
  it("non-vacuity guard: carrying actor.role changes the intentHash", () => {
    const noRole = buildEnvelope({
      kind: "pix.charge.create",
      payload: { amountCentavos: 1000 },
      actor: { principal: "user" as const, sessionId: "s-role" },
      taint: "UNTRUSTED" as const,
      nonce: "fixed-nonce-role-001",
    })
    expect(ROLE_ENVELOPE.intentHash).not.toBe(noRole.intentHash)
    // The verifier's recipe (role threaded through the actor) reproduces it.
    const derivedWithRole = sha256Canonical({
      version: ROLE_ENVELOPE.version,
      kind: ROLE_ENVELOPE.kind,
      payload: ROLE_ENVELOPE.payload,
      nonce: ROLE_ENVELOPE.nonce,
      actor: ROLE_ENVELOPE.actor,
      taint: ROLE_ENVELOPE.taint,
      origin: ROLE_ENVELOPE.origin,
    })
    expect(derivedWithRole).toBe(ROLE_ENVELOPE.intentHash)
    // …and the recipe that DROPS the role (a verifier that failed to thread
    // `actorRole`) does NOT — it would false-tamper this resume.
    const derivedWithoutRole = sha256Canonical({
      version: ROLE_ENVELOPE.version,
      kind: ROLE_ENVELOPE.kind,
      payload: ROLE_ENVELOPE.payload,
      nonce: ROLE_ENVELOPE.nonce,
      actor: {
        principal: ROLE_ENVELOPE.actor.principal,
        sessionId: ROLE_ENVELOPE.actor.sessionId,
      },
      taint: ROLE_ENVELOPE.taint,
      origin: ROLE_ENVELOPE.origin,
    })
    expect(derivedWithoutRole).not.toBe(ROLE_ENVELOPE.intentHash)
  })

  it("verifyParkedEnvelopeHash verifies a role-carrying blob (not tampered)", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ROLE_ENVELOPE.intentHash,
        kind: ROLE_ENVELOPE.kind,
        actor: { sessionId: ROLE_ENVELOPE.actor.sessionId },
        payload: ROLE_ENVELOPE.payload,
        version: ROLE_ENVELOPE.version,
        nonce: ROLE_ENVELOPE.nonce,
        taint: ROLE_ENVELOPE.taint,
        actorPrincipal: ROLE_ENVELOPE.actor.principal,
        actorRole: ROLE_ENVELOPE.actor.role,
        origin: ROLE_ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(true)
  })

  it("a role-carrying blob that DROPPED actorRole false-tampers (the trap this seam closes)", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ROLE_ENVELOPE.intentHash,
        kind: ROLE_ENVELOPE.kind,
        actor: { sessionId: ROLE_ENVELOPE.actor.sessionId },
        payload: ROLE_ENVELOPE.payload,
        version: ROLE_ENVELOPE.version,
        nonce: ROLE_ENVELOPE.nonce,
        taint: ROLE_ENVELOPE.taint,
        actorPrincipal: ROLE_ENVELOPE.actor.principal,
        // actorRole NOT stored — the park side failed to thread it
        origin: ROLE_ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBe(false)
    if (v.verified === false) expect(v.reason).toBe("tampered")
  })

  it("a SWAPPED actorRole in the blob is tamper-evident", () => {
    const parked: ParkedEnvelope = {
      envelope: {
        intentHash: ROLE_ENVELOPE.intentHash,
        kind: ROLE_ENVELOPE.kind,
        actor: { sessionId: ROLE_ENVELOPE.actor.sessionId },
        payload: ROLE_ENVELOPE.payload,
        version: ROLE_ENVELOPE.version,
        nonce: ROLE_ENVELOPE.nonce,
        taint: ROLE_ENVELOPE.taint,
        actorPrincipal: ROLE_ENVELOPE.actor.principal,
        actorRole: "OWNER", // parked as MANAGER; swapped in Redis
        origin: ROLE_ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    expect(verifyParkedEnvelopeHash(parked).verified).toBe(false)
  })

  it("strict park → resume round-trip with a role resumes with the IDENTICAL intentHash and the role intact", async () => {
    const redis = createMemoryRedis()
    const parkResult = await parkDeferredIntent({
      envelope: {
        intentHash: ROLE_ENVELOPE.intentHash,
        kind: ROLE_ENVELOPE.kind,
        actor: { sessionId: ROLE_ENVELOPE.actor.sessionId },
        payload: ROLE_ENVELOPE.payload,
        version: ROLE_ENVELOPE.version,
        nonce: ROLE_ENVELOPE.nonce,
        taint: ROLE_ENVELOPE.taint,
        actorPrincipal: ROLE_ENVELOPE.actor.principal,
        actorRole: ROLE_ENVELOPE.actor.role,
        origin: ROLE_ENVELOPE.origin,
      },
      signal: "pix.confirmed",
      ttlSeconds: 600,
      redis,
      rk: RK,
    })
    expect(parkResult.parked).toBe(true)

    const result = await resumeDeferredIntent({
      sessionId: ROLE_ENVELOPE.actor.sessionId,
      signal: "pix.confirmed",
      redis,
      rk: RK,
      verifyHash: "strict",
    })
    // Without the actorRole threading this is { resumed:false,
    // reason:"park_blob_tampered" } — a legitimate resume false-flagged.
    expect(result.resumed).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.intentHash).toBe(ROLE_ENVELOPE.intentHash)
    // The role rides the parked blob intact for downstream consumers.
    expect(result.parked?.envelope.actorRole).toBe("MANAGER")
  })
})
