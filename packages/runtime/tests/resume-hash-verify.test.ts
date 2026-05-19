/**
 * T-008: integration test for resume-hash verification.
 *
 * Per ADR-106 (resume-hash verification, M1): if the parked envelope blob
 * is mutated between park and resume — e.g. an attacker with Redis write
 * access modifies the stored payload — the resume side MUST detect the
 * tamper and refuse to resume.
 *
 * The verification works by re-deriving `sha256Canonical({version, kind,
 * payload, nonce, actor, taint})` and comparing to the stored `intentHash`.
 */
import { describe, expect, it } from "vitest"
import { buildEnvelope, sha256Canonical } from "@adjudicate/core"
import {
  parkDeferredIntent,
  resumeDeferredIntent,
  verifyParkedEnvelopeHash,
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
      },
      signal: "any",
      parkedAt: "2024-01-01T00:00:00.000Z",
    }
    const v = verifyParkedEnvelopeHash(parked)
    expect(v.verified).toBe(true)
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
    const derived = sha256Canonical({
      version: ENVELOPE.version,
      kind: ENVELOPE.kind,
      payload: ENVELOPE.payload,
      nonce: ENVELOPE.nonce,
      actor: ENVELOPE.actor,
      taint: ENVELOPE.taint,
    })
    expect(derived).toBe(ENVELOPE.intentHash)
  })
})
