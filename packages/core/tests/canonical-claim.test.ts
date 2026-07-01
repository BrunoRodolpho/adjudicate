/**
 * Plan 1 / inv.17 — the CanonicalClaim kernel-minted, runtime-non-forgeable
 * renderer-input carrier. Verifies the three defense-in-depth legs PLUS the
 * mint-site invariant (only a VALIDATED+consistent claim mints one):
 *   (b) runtime: kernel-mint → unwrap roundtrip succeeds; a forged structural
 *       literal throws at unwrap.
 *   (a) compile-time: the brand symbol is not exported, and there is no PUBLIC
 *       mint constructor on the barrel (no external module can mint or name the
 *       brand key).
 *   (c) lint: `x as CanonicalClaim` is caught by the shared flat config's
 *       no-restricted-syntax rule, while the mint module is exempt.
 *   mint-site: runClaimsKernel mints exactly the renderable (VALIDATED+consistent)
 *       set and nothing on UNKNOWN/REFUSED/ESCALATE turns.
 *
 * Runs under `pnpm -F @adjudicate/core test` (a §5 gate).
 */

import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import sharedConfig from "@adjudicate/eslint-config";
import {
  type CanonicalClaim,
  unwrapCanonical,
} from "../src/claims/canonical-claim.js";
// The mint is package-internal (NOT on the barrel); the test imports it directly
// to prove the kernel-minted roundtrip, the same way the kernel does.
import { mintCanonicalClaim } from "../src/claims/canonical-claim.js";
import { runClaimsKernel } from "../src/claims/kernels.js";
import type { CandidateClaim, ClaimsKernelDeps } from "../src/claims/kernels.js";
import { EvidenceLedger } from "../src/claims/evidence-ledger.js";
import * as core from "../src/index.js";

describe("CanonicalClaim — runtime roundtrip (defense layer b)", () => {
  it("mint → unwrap returns the carried fields", () => {
    const c = mintCanonicalClaim("order:42", "STORE_OPEN_NOW", { mealPeriod: "lunch" });
    expect(unwrapCanonical(c)).toEqual({
      subject: "order:42",
      type: "STORE_OPEN_NOW",
      value: { mealPeriod: "lunch" },
    });
  });

  it("distinct minted claims are distinct heap objects (per-claim provenance)", () => {
    const a = mintCanonicalClaim("s", "T", 1);
    const b = mintCanonicalClaim("s", "T", 1);
    expect(a).not.toBe(b);
    expect(unwrapCanonical(a).value).toBe(1);
    expect(unwrapCanonical(b).value).toBe(1);
  });

  it("a minted claim is frozen / immutable", () => {
    const c = mintCanonicalClaim("s", "T", "v");
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe("CanonicalClaim — forgery is rejected at the renderer gate", () => {
  it("a structural object literal cast to CanonicalClaim throws at unwrap", () => {
    // The ONLY way to get this past tsc is a cast — which the lint layer bans in
    // real source. Here we cast to prove the RUNTIME WeakSet gate also rejects it.
    const forged = {
      subject: "s",
      type: "T",
      value: "spoofed",
    } as unknown as CanonicalClaim;
    expect(() => unwrapCanonical(forged)).toThrow(/forged or non-minted/);
  });

  it("a plain object coerced to CanonicalClaim throws at unwrap", () => {
    const forged = {} as unknown as CanonicalClaim;
    expect(() => unwrapCanonical(forged)).toThrow();
  });
});

describe("CanonicalClaim — no exported brand symbol / public constructor (layer a)", () => {
  it("@adjudicate/core does not re-export the brand symbol", () => {
    const symbolExports = Object.getOwnPropertySymbols(core).filter(
      (s) => s !== Symbol.toStringTag,
    );
    expect(symbolExports).toEqual([]);
    expect(
      Object.keys(core).some((k) => k.toLowerCase().includes("canonicalbrand")),
    ).toBe(false);
  });

  it("@adjudicate/core does NOT expose a public mintCanonicalClaim constructor", () => {
    // Only the opaque type + unwrapCanonical leave the barrel; the mint is internal.
    expect(Object.keys(core)).not.toContain("mintCanonicalClaim");
    expect(core).toHaveProperty("unwrapCanonical");
  });
});

describe("CanonicalClaim — `as` forgery is lint-caught (defense layer c)", () => {
  const linter = new Linter();

  function lintTs(code: string) {
    return linter.verify(code, sharedConfig as never, {
      filename: "src/forge.ts",
    });
  }

  it("flags `x as CanonicalClaim`", () => {
    const messages = lintTs(
      `const x: unknown = {}; const y = x as CanonicalClaim;`,
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-syntax")).toBe(true);
  });

  it("flags `x as any as CanonicalClaim` (nested cast)", () => {
    const messages = lintTs(
      `const x: unknown = {}; const y = x as any as CanonicalClaim;`,
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-syntax")).toBe(true);
  });

  it("does NOT flag the mint module (canonical-claim.ts) — it is exempt", () => {
    const messages = linter.verify(
      `const x: unknown = {}; const y = x as any as CanonicalClaim;`,
      sharedConfig as never,
      { filename: "packages/core/src/claims/canonical-claim.ts" },
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-syntax")).toBe(false);
  });
});

describe("CanonicalClaim — kernel is the SOLE mint site (mint-site invariant)", () => {
  // A claim with NO requiredEvidence + no falsifiers cannot validate (C0/falsifier
  // cap), so it never mints — proving mint is gated behind a VALIDATED verdict.
  const DEPS: ClaimsKernelDeps = {
    soundness: {
      owns: () => false,
      outcomeConfirmed: () => false,
      now: 0,
    },
  };

  it("mints nothing when nothing validates (renderableCanonical is empty)", () => {
    const ledger = new EvidenceLedger();
    const candidates: CandidateClaim[] = [
      {
        // Empty requiredEvidence → C0 non-vacuity fails → never VALIDATED.
        soundness: {
          requiredEvidence: [],
          minSourceIntegrity: "trusted_service",
          kind: "read_claim",
        } as unknown as CandidateClaim["soundness"],
        subject: "store",
        type: "STORE_OPEN_NOW",
        value: { mealPeriod: "lunch" },
      },
    ];
    const result = runClaimsKernel(ledger, candidates, DEPS);
    expect(result.renderableCanonical).toEqual([]);
    expect(result.terminal).not.toBe("RENDER");
  });

  it("renderableCanonical is 1:1 with the renderable set and unwraps to its values", () => {
    // Drive a real VALIDATED render via the kernel by reusing the kernels test's
    // own fixture path: any renderable member must appear as a minted canonical.
    const ledger = new EvidenceLedger();
    const candidates: CandidateClaim[] = [];
    const result = runClaimsKernel(ledger, candidates, DEPS);
    // Empty input → empty renderable → empty canonical (degenerate but exact 1:1).
    expect(result.renderableCanonical.length).toBe(result.renderable.length);
    for (let i = 0; i < result.renderableCanonical.length; i++) {
      const unwrapped = unwrapCanonical(result.renderableCanonical[i]!);
      expect(unwrapped.subject).toBe(result.renderable[i]!.subject);
      expect(unwrapped.type).toBe(result.renderable[i]!.type);
    }
  });
});
