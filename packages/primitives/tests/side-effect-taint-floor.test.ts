import { describe, expect, it } from "vitest";
import { buildEnvelope, DEFAULT_SIDE_EFFECT_FLOOR, type Taint } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import {
  createSideEffectTaintFloor,
  type SideEffectTaintFloorOptions,
} from "../src/index.js";

type Kind = "data.read" | "order.write" | "account.delete" | "mystery.op";

const env = (kind: Kind, taint: Taint) =>
  buildEnvelope({
    kind,
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: `n-${kind}-${taint}`,
    createdAt: "2026-04-29T12:00:00.000Z",
  });

const SIDE_EFFECTS: Readonly<Partial<Record<Kind, "none" | "read" | "write" | "destructive">>> = {
  "data.read": "read",
  "order.write": "write",
  "account.delete": "destructive",
  // mystery.op intentionally unmapped -> defaultClass
};

const guard = (
  extra: Partial<SideEffectTaintFloorOptions<Kind, unknown, unknown>> = {},
) =>
  createSideEffectTaintFloor<Kind, unknown, unknown>({
    sideEffects: SIDE_EFFECTS,
    ...extra,
  });

describe("createSideEffectTaintFloor — default floor", () => {
  it("read clears the floor at UNTRUSTED (no opinion)", () => {
    expect(guard()(env("data.read", "UNTRUSTED"), {})).toBeNull();
  });

  it("write below floor (UNTRUSTED < TRUSTED) REFUSEs with taint.level_insufficient", () => {
    const d = guard()(env("order.write", "UNTRUSTED"), {});
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.refusal.kind).toBe("SECURITY");
    expect(d.refusal.code).toBe("side_effect.taint_floor");
    expect(d.basis[0]).toMatchObject({ category: "taint", code: "level_insufficient" });
    expect(d.basis[0]!.detail).toMatchObject({
      rule: "side_effect_taint_floor",
      sideEffectClass: "write",
      requiredTaint: "TRUSTED",
      actualTaint: "UNTRUSTED",
    });
  });

  it("write clears the floor at TRUSTED", () => {
    expect(guard()(env("order.write", "TRUSTED"), {})).toBeNull();
  });

  it("destructive requires SYSTEM — TRUSTED is below floor", () => {
    const d = guard()(env("account.delete", "TRUSTED"), {});
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.basis[0]!.detail).toMatchObject({ sideEffectClass: "destructive", requiredTaint: "SYSTEM" });
  });

  it("destructive clears the floor at SYSTEM", () => {
    expect(guard()(env("account.delete", "SYSTEM"), {})).toBeNull();
  });
});

describe("createSideEffectTaintFloor — fail-closed default class", () => {
  it("unmapped kind defaults to destructive -> UNTRUSTED is below floor (REFUSE)", () => {
    const d = guard()(env("mystery.op", "UNTRUSTED"), {});
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE (fail-closed)");
    expect(d.basis[0]!.detail).toMatchObject({ sideEffectClass: "destructive" });
  });

  it("unmapped kind with explicit defaultClass 'read' clears at UNTRUSTED", () => {
    expect(guard({ defaultClass: "read" })(env("mystery.op", "UNTRUSTED"), {})).toBeNull();
  });
});

describe("createSideEffectTaintFloor — options", () => {
  it("onBelowFloor ESCALATE routes to supervisor", () => {
    const d = guard({ onBelowFloor: "ESCALATE" })(env("order.write", "UNTRUSTED"), {});
    if (d?.kind !== "ESCALATE") throw new Error("expected ESCALATE");
    expect(d.to).toBe("supervisor");
    expect(d.basis[0]).toMatchObject({ category: "taint", code: "level_insufficient" });
  });

  it("matches predicate false short-circuits to null", () => {
    expect(guard({ matches: () => false })(env("account.delete", "UNTRUSTED"), {})).toBeNull();
  });

  it("custom floor table lowers the write requirement", () => {
    const customFloor = { ...DEFAULT_SIDE_EFFECT_FLOOR, write: "UNTRUSTED" as Taint };
    expect(guard({ floor: customFloor })(env("order.write", "UNTRUSTED"), {})).toBeNull();
  });

  it("metadata is opaque (no GuardDescription widening)", () => {
    expect(readGuardMetadata(guard())?.description?.kind).toBe("opaque");
  });
});
