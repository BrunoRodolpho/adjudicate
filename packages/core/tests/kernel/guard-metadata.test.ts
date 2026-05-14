/**
 * Guard metadata surface — unit + property tests for ADR-105.
 *
 * Pins:
 *   - `withMetadata(g, m) === g` (identity preservation, ADR-105 rule 10)
 *   - `withMetadata` attaches via non-configurable, non-writable,
 *     non-enumerable symbol property
 *   - `readGuardMetadata` round-trips the attached object byte-equal
 *   - `readGuardMetadata(g)` returns `undefined` for guards without
 *     metadata (rule 7 — absence of metadata MUST remain legal)
 *   - `withMetadata` is write-once — second call throws (rule 10)
 *   - `nameGuard` is a facade over `withMetadata({ name })` and continues
 *     to populate `AdjudicationTraceEntry.guardName` for back-compat
 */

import { describe, expect, it } from "vitest";
import {
  GuardMetadataSymbol,
  adjudicateWithTrace,
  nameGuard,
  readGuardMetadata,
  withMetadata,
  type Guard,
  type GuardMetadata,
} from "../../src/kernel/index.js";
import { decisionExecute, decisionRefuse } from "../../src/decision.js";
import { refuse } from "../../src/refusal.js";
import {
  buildEnvelope,
  type IntentEnvelope,
} from "../../src/envelope.js";
import type { TaintPolicy } from "../../src/taint.js";

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function envOf(kind: string): IntentEnvelope<string, { x: number }> {
  return buildEnvelope({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-meta-test",
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

describe("withMetadata + readGuardMetadata (ADR-105)", () => {
  it("identity preservation: withMetadata(g, m) === g (rule 10)", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    const wrapped = withMetadata(g, { name: "myGuard" });
    expect(wrapped).toBe(g);
  });

  it("attaches via non-enumerable, non-configurable, non-writable symbol property", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { name: "myGuard" });
    const descriptor = Object.getOwnPropertyDescriptor(g, GuardMetadataSymbol);
    expect(descriptor).toBeDefined();
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
    expect(descriptor?.writable).toBe(false);
  });

  it("metadata slot cannot be reassigned or deleted (immutability test)", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { name: "original" });

    // strict-mode redefinition of the slot itself throws (non-configurable)
    expect(() => {
      Object.defineProperty(g, GuardMetadataSymbol, { value: { name: "hijack" } });
    }).toThrow(TypeError);

    // delete on non-configurable returns false in strict mode (or throws)
    expect(() => {
      // @ts-expect-error deleting a symbol property
      delete (g as unknown as Record<symbol, unknown>)[GuardMetadataSymbol];
    }).toThrow(TypeError);

    // metadata still present
    expect(readGuardMetadata(g)?.name).toBe("original");
  });

  it("individual metadata fields are non-configurable / non-writable once set", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { name: "original" });
    const slot = (g as unknown as Record<symbol, Record<string, unknown>>)[
      GuardMetadataSymbol
    ];
    const descriptor = Object.getOwnPropertyDescriptor(slot, "name");
    expect(descriptor?.configurable).toBe(false);
    expect(descriptor?.writable).toBe(false);
  });

  it("readGuardMetadata round-trips the attached fields", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    const meta: GuardMetadata = {
      name: "round-trip",
      author: "test@adjudicate.io",
      since: "2026-05-13",
      description: { kind: "opaque", note: "human breadcrumb" },
    };
    withMetadata(g, meta);
    const read = readGuardMetadata(g);
    expect(read?.name).toBe(meta.name);
    expect(read?.author).toBe(meta.author);
    expect(read?.since).toBe(meta.since);
    expect(read?.description).toEqual(meta.description);
  });

  it("readGuardMetadata returns undefined for guards without metadata (rule 7)", () => {
    const bare: Guard<string, unknown, unknown> = () => null;
    expect(readGuardMetadata(bare)).toBeUndefined();
  });

  it("withMetadata is per-field write-once — same field with different value throws", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { name: "first" });
    expect(() => withMetadata(g, { name: "second" })).toThrow(TypeError);
    expect(readGuardMetadata(g)?.name).toBe("first");
  });

  it("withMetadata is idempotent on identical-value reattachment of the same field", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { name: "stable" });
    expect(() => withMetadata(g, { name: "stable" })).not.toThrow();
    expect(readGuardMetadata(g)?.name).toBe("stable");
  });

  it("withMetadata composes additively across disjoint fields (the nameGuard + L2-factory case)", () => {
    // This is the canonical PIX/KYC pattern:
    //   nameGuard("escalateLargeRefunds", createThresholdGuard({ ... }))
    // The L2 factory attaches `description`; nameGuard later attaches `name`.
    // Both succeed because they write disjoint fields.
    const g: Guard<string, unknown, unknown> = () => null;
    withMetadata(g, { description: { kind: "opaque" } });
    withMetadata(g, { name: "composed" });
    const meta = readGuardMetadata(g);
    expect(meta?.name).toBe("composed");
    expect(meta?.description?.kind).toBe("opaque");
  });

  it("preserves stack-trace identity — Function.name is unchanged by withMetadata", () => {
    function namedGuard(): null {
      return null;
    }
    const meta: GuardMetadata = { name: "metaName" };
    withMetadata(namedGuard as unknown as Guard<string, unknown, unknown>, meta);
    expect(namedGuard.name).toBe("namedGuard");
  });
});

describe("nameGuard (facade over withMetadata, back-compat)", () => {
  it("attaches metadata.name and surfaces in AdjudicationTraceEntry.guardName", () => {
    const escalateLargeRefunds: Guard<string, unknown, unknown> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "test", "test"), []);
    nameGuard("escalateLargeRefunds", escalateLargeRefunds);

    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissiveTaint,
      business: [escalateLargeRefunds],
      default: "EXECUTE" as const,
    };
    const { trace } = adjudicateWithTrace(envOf("any.kind"), {}, policy);

    const matched = trace.find((e) => e.outcome === "match");
    expect(matched?.guardName).toBe("escalateLargeRefunds");
  });

  it("falls back to Function.name when no metadata is attached", () => {
    function namedFallback(): null {
      return null;
    }
    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissiveTaint,
      business: [namedFallback as unknown as Guard<string, unknown, unknown>],
      default: "EXECUTE" as const,
    };
    const { trace } = adjudicateWithTrace(envOf("any.kind"), {}, policy);
    const businessEntry = trace.find((e) => e.phase === "business");
    expect(businessEntry?.guardName).toBe("namedFallback");
  });

  it("returns the same function reference (identity preserved)", () => {
    const g: Guard<string, unknown, unknown> = () => null;
    const result = nameGuard("myName", g);
    expect(result).toBe(g);
  });
});

describe("trace metadata.name takes precedence over Function.name", () => {
  it("uses metadata.name when both are present", () => {
    function packAuthorName(): null {
      return decisionExecute([]);
    }
    const guard = packAuthorName as unknown as Guard<string, unknown, unknown>;
    nameGuard("metadataName", guard);

    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissiveTaint,
      business: [guard],
      default: "REFUSE" as const,
    };
    const { trace } = adjudicateWithTrace(envOf("any.kind"), {}, policy);
    const matched = trace.find((e) => e.outcome === "match");
    expect(matched?.guardName).toBe("metadataName");
    // Function.name itself is unchanged.
    expect(packAuthorName.name).toBe("packAuthorName");
  });

  it("omits guardName when both metadata.name and Function.name are empty", () => {
    const anon: Guard<string, unknown, unknown> = () => decisionExecute([]);
    // Make sure Function.name is empty (anonymous expression has name === "anon" via const-binding;
    // strip it via Object.defineProperty for a true anonymous test).
    Object.defineProperty(anon, "name", { value: "", configurable: true });

    const policy = {
      stateGuards: [],
      authGuards: [],
      taint: permissiveTaint,
      business: [anon],
      default: "REFUSE" as const,
    };
    const { trace } = adjudicateWithTrace(envOf("any.kind"), {}, policy);
    const matched = trace.find((e) => e.outcome === "match");
    expect(matched).toBeDefined();
    expect(matched?.guardName).toBeUndefined();
  });
});
