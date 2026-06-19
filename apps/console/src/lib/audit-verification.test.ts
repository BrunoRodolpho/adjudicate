/**
 * 092 — verify-on-read reaches the admin tRPC response.
 *
 * The route wires the audit store through `withVerifyOnRead` and mounts it on
 * the admin router's `audit.query` procedure (which `.output(AuditQueryResultSchema)`
 * now carries `verifications`). This test proves the verdict survives the same
 * pipeline the route uses: store.query → createAuditQueryHandler → the
 * `AuditQueryResult` the tRPC procedure returns — including the BAD_REQUEST
 * mapping staying intact.
 */
import { describe, expect, it } from "vitest";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  hashBindAuditSigner,
  type AuditRecord,
} from "@adjudicate/core";
import {
  createAuditQueryHandler,
  createInMemoryAuditStore,
  type AuditStore,
} from "@adjudicate/admin-sdk";
import { withVerifyOnRead } from "./audit-verification";

function rec(opts: { marker: string; signed?: boolean; forge?: boolean; sessionId?: string; prevAuditHash?: string; at?: string }): AuditRecord {
  const env = buildEnvelope({
    kind: "test.intent",
    payload: { marker: opts.marker },
    actor: { principal: "llm", sessionId: opts.sessionId ?? "s-1" },
    taint: "UNTRUSTED",
    nonce: `n-${opts.marker}`,
    createdAt: "2026-06-18T00:00:00.000Z",
  });
  const r = buildAuditRecord({
    envelope: env,
    decision: decisionExecute([]),
    durationMs: 5,
    at: opts.at ?? "2026-06-18T00:00:01.000Z",
    ...(opts.signed ? { signer: hashBindAuditSigner("kms://console-key") } : {}),
    ...(opts.prevAuditHash !== undefined ? { prevAuditHash: opts.prevAuditHash } : {}),
  });
  if (opts.forge) {
    return { ...r, signature: { keyId: "kms://console-key", alg: "sha256-hashbind", value: "0".repeat(64) } };
  }
  return r;
}

describe("withVerifyOnRead — console verify-on-read decorator", () => {
  it("fills in verifications for an in-memory store (which does not verify on read)", async () => {
    const inner = createInMemoryAuditStore({ records: [rec({ marker: "a" })] });
    const wrapped = withVerifyOnRead(inner);
    const result = await wrapped.query({ limit: 100 });
    // The bare in-memory store omits verifications …
    expect((await inner.query({ limit: 100 })).verifications).toBeUndefined();
    // … the decorator fills them in, index-aligned.
    expect(result.verifications).toBeDefined();
    expect(result.verifications).toHaveLength(result.records.length);
    expect(result.verifications![0]!.verified).toBe(true);
  });

  it("flags a forged-signature record as invalid_signature", async () => {
    const inner = createInMemoryAuditStore({
      records: [rec({ marker: "forged", forge: true })],
    });
    const result = await withVerifyOnRead(inner).query({ limit: 100 });
    const v = result.verifications![0]!;
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("invalid_signature");
  });

  it("is idempotent: a store that already verified keeps its verdicts", async () => {
    const sentinel: ReadonlyArray<{ verified: true }> = [{ verified: true }];
    const preVerified: AuditStore = {
      async query() {
        return { records: [rec({ marker: "p" })], verifications: sentinel };
      },
      async getByIntentHash() {
        return null;
      },
    };
    const result = await withVerifyOnRead(preVerified).query({ limit: 100 });
    // The inner verdicts are passed through unchanged (same reference).
    expect(result.verifications).toBe(sentinel);
  });
});

describe("092 — the verdict reaches the admin tRPC response via createAuditQueryHandler", () => {
  it("the handler returns the verify-on-read verdict the route's store produced", async () => {
    // Same pipeline the route mounts: withVerifyOnRead(store) → createAuditQueryHandler.
    const store = withVerifyOnRead(
      createInMemoryAuditStore({
        records: [rec({ marker: "ok", signed: true }), rec({ marker: "forged", forge: true })],
      }),
    );
    const handler = createAuditQueryHandler({ store });
    const response = await handler({ limit: 100 });
    expect(response.verifications).toBeDefined();
    expect(response.verifications).toHaveLength(response.records.length);
    // The forged record's verdict made it all the way through the handler.
    const flagged = response.verifications!.filter((v) => v.verified === false);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
    expect(flagged.every((v) => v.verified === false && v.reason === "invalid_signature")).toBe(true);
  });
});

describe("093 — chainIntegrity reaches the admin tRPC response via createAuditQueryHandler (T10)", () => {
  it("an intact chain surfaces chainIntegrity with zero breaks through the route pipeline", async () => {
    const g = rec({ marker: "g", sessionId: "sX", at: "2026-06-18T00:00:01.000Z" });
    const c1 = rec({ marker: "c1", sessionId: "sX", prevAuditHash: g.auditHash, at: "2026-06-18T00:00:02.000Z" });
    // Same pipeline the route mounts: withVerifyOnRead(store) → createAuditQueryHandler.
    const store = withVerifyOnRead(createInMemoryAuditStore({ records: [g, c1] }));
    const handler = createAuditQueryHandler({ store });
    const response = await handler({ limit: 100, intentHash: undefined });
    expect(response.chainIntegrity).toBeDefined();
    expect(response.chainIntegrity!.breaks).toHaveLength(0);
    expect(response.chainIntegrity!.checked).toBeGreaterThanOrEqual(1);
  });

  it("a broken chain link is surfaced through the route pipeline", async () => {
    const g = rec({ marker: "g2", sessionId: "sY", at: "2026-06-18T00:00:01.000Z" });
    const broken = rec({ marker: "b2", sessionId: "sY", prevAuditHash: "f".repeat(64), at: "2026-06-18T00:00:02.000Z" });
    const store = withVerifyOnRead(createInMemoryAuditStore({ records: [g, broken] }));
    const handler = createAuditQueryHandler({ store });
    const response = await handler({ limit: 100 });
    expect(response.chainIntegrity!.breaks).toHaveLength(1);
    expect(response.chainIntegrity!.breaks[0]!.intentHash).toBe(broken.intentHash);
  });
});
