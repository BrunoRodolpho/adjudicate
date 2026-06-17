import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Taint } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState, type AccessGrant } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";
let n = 0;

function run(
  kind: string,
  payload: unknown,
  taint: Taint,
  opts: { grants?: Record<string, AccessGrant>; createdAt?: string } = {},
) {
  const env = buildEnvelope({
    kind,
    payload,
    actor: { principal: taint === "TRUSTED" ? "user" : "llm", sessionId: "s" },
    taint,
    nonce: `n-${n++}`,
    createdAt: opts.createdAt ?? at,
  });
  return adjudicate(
    env,
    rehydrateAccessState({ reviews: {}, grants: opts.grants ?? {} }),
    accessGovernancePack.policy,
  );
}

const bg = (over: Record<string, unknown> = {}) => ({
  resourceId: "db.prod",
  principal: "alice",
  privilegeLevel: 2,
  justification: "prod outage",
  ttlMs: 15 * 60 * 1000,
  ...over,
});

describe("pack-access-governance — break-glass (ADR-142)", () => {
  it("EXECUTE: TRUSTED break-glass with a valid ttlMs", () => {
    const d = run("access.breakglass", bg(), "TRUSTED");
    expect(d.kind).toBe("EXECUTE");
    expect(d.basis.some((b) => b.category === "business" && b.code === "breakglass_granted")).toBe(true);
  });

  it("REFUSE (SECURITY): UNTRUSTED break-glass is refused at the taint gate (forging blocked)", () => {
    const d = run("access.breakglass", bg(), "UNTRUSTED");
    expect(d.kind).toBe("REFUSE");
    if (d.kind === "REFUSE") expect(d.refusal.kind).toBe("SECURITY");
  });

  it("REFUSE: missing ttlMs → BREAKGLASS_TTL_INVALID", () => {
    const d = run("access.breakglass", bg({ ttlMs: undefined }), "TRUSTED");
    expect(d.kind).toBe("REFUSE");
    expect(d.basis.some((b) => b.code === "breakglass_ttl_invalid")).toBe(true);
  });

  it("REFUSE: non-positive or over-cap ttlMs → BREAKGLASS_TTL_INVALID", () => {
    expect(run("access.breakglass", bg({ ttlMs: 0 }), "TRUSTED").kind).toBe("REFUSE");
    expect(run("access.breakglass", bg({ ttlMs: -5 }), "TRUSTED").kind).toBe("REFUSE");
    expect(run("access.breakglass", bg({ ttlMs: 99 * 60 * 60 * 1000 }), "TRUSTED").kind).toBe("REFUSE");
  });

  it("REFUSE: break-glass on an unknown resource", () => {
    expect(run("access.breakglass", bg({ resourceId: "nope" }), "TRUSTED").kind).toBe("REFUSE");
  });

  it("DETERMINISM: identical break-glass envelope+state → identical decision", () => {
    const a = run("access.breakglass", bg(), "TRUSTED", { createdAt: at });
    const b = run("access.breakglass", bg(), "TRUSTED", { createdAt: at });
    expect(a.kind).toBe(b.kind);
    expect(JSON.stringify(a.basis)).toBe(JSON.stringify(b.basis));
  });
});

describe("pack-access-governance — grant expiry (ADR-142)", () => {
  const grantKey = "db.prod::alice";
  const grant = (expiresAt?: string): Record<string, AccessGrant> => ({
    [grantKey]: { principal: "alice", resourceId: "db.prod", privilegeLevel: 1, grantedAt: at, expiresAt },
  });

  it("REFUSE: revoking a grant whose expiresAt is before createdAt → GRANT_EXPIRED", () => {
    const d = run(
      "access.revoke",
      { principal: "alice", resourceId: "db.prod", confirmationToken: "t" },
      "TRUSTED",
      { grants: grant("2026-05-01T11:00:00.000Z"), createdAt: at },
    );
    expect(d.kind).toBe("REFUSE");
    expect(d.basis.some((b) => b.category === "state" && b.code === "grant_expired")).toBe(true);
  });

  it("boundary: createdAt == expiresAt counts as expired", () => {
    const d = run(
      "access.revoke",
      { principal: "alice", resourceId: "db.prod", confirmationToken: "t" },
      "TRUSTED",
      { grants: grant(at), createdAt: at },
    );
    expect(d.kind).toBe("REFUSE");
    expect(d.basis.some((b) => b.code === "grant_expired")).toBe(true);
  });

  it("a non-expired grant revokes normally (not GRANT_EXPIRED)", () => {
    const d = run(
      "access.revoke",
      { principal: "alice", resourceId: "db.prod", confirmationToken: "t" },
      "TRUSTED",
      { grants: grant("2026-05-01T13:00:00.000Z"), createdAt: at },
    );
    expect(d.kind).toBe("EXECUTE");
    expect(d.basis.some((b) => b.code === "grant_expired")).toBe(false);
  });

  it("a grant with no expiresAt never expires", () => {
    const d = run(
      "access.revoke",
      { principal: "alice", resourceId: "db.prod", confirmationToken: "t" },
      "TRUSTED",
      { grants: grant(undefined), createdAt: at },
    );
    expect(d.kind).toBe("EXECUTE");
  });
});
