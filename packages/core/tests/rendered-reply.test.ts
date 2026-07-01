/**
 * Plan 1 / Theorem E (E-1) — the RenderedReply runtime-non-forgeable egress
 * carrier. Verifies the three defense-in-depth legs:
 *   (b) runtime: mint→unwrap roundtrip succeeds; a forged structural literal
 *       throws at unwrap.
 *   (a) compile-time: the brand symbol is not exported (so no external module
 *       can name the brand key).
 *   (c) lint: `x as RenderedReply` is caught by the shared flat config's
 *       no-restricted-syntax rule, while the minter module is exempt.
 *
 * Runs under `pnpm -F @adjudicate/core test` (a §5 gate).
 */

import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import sharedConfig from "@adjudicate/eslint-config";
import {
  type RenderedReply,
  mintRenderedReply,
  mintCronReply,
  mintReceiptReply,
  mintOtpReply,
  mintBroadcastReply,
  mintFallbackReply,
  wrapLegacyResponderText,
  unwrapRendered,
} from "../src/rendered-reply.js";
import * as core from "../src/index.js";

describe("RenderedReply — runtime roundtrip (defense layer b)", () => {
  const minters = [
    ["mintRenderedReply", mintRenderedReply],
    ["mintCronReply", mintCronReply],
    ["mintReceiptReply", mintReceiptReply],
    ["mintOtpReply", mintOtpReply],
    ["mintBroadcastReply", mintBroadcastReply],
    ["mintFallbackReply", mintFallbackReply],
    ["wrapLegacyResponderText", wrapLegacyResponderText],
  ] as const;

  for (const [name, mint] of minters) {
    it(`${name}: mint → unwrap returns the original text`, () => {
      const reply = mint("olá, tudo certo com seu pedido");
      expect(unwrapRendered(reply)).toBe("olá, tudo certo com seu pedido");
    });
  }

  it("distinct minted replies are distinct heap objects (per-reply provenance)", () => {
    const a = mintRenderedReply("a");
    const b = mintRenderedReply("a");
    expect(a).not.toBe(b);
    expect(unwrapRendered(a)).toBe("a");
    expect(unwrapRendered(b)).toBe("a");
  });

  it("a minted reply is frozen / immutable", () => {
    const reply = mintRenderedReply("immutable");
    expect(Object.isFrozen(reply)).toBe(true);
  });
});

describe("RenderedReply — forgery is rejected at the egress gate", () => {
  it("a structural object literal cast to RenderedReply throws at unwrap", () => {
    // The ONLY way to get this past tsc is a cast — which the lint layer bans
    // in real source. Here we cast to prove the RUNTIME WeakSet gate also
    // rejects it, independent of lint.
    const forged = { text: "spoofed wire string" } as unknown as RenderedReply;
    expect(() => unwrapRendered(forged)).toThrow(/forged or non-minted/);
  });

  it("a plain string coerced to RenderedReply throws at unwrap", () => {
    const forged = "raw string" as unknown as RenderedReply;
    expect(() => unwrapRendered(forged)).toThrow();
  });
});

describe("RenderedReply — the brand symbol is not exported (defense layer a)", () => {
  it("@adjudicate/core does not re-export the brand symbol", () => {
    // The brand is a `declare const ... : unique symbol` — a type-only
    // declaration with no runtime value — so it cannot appear among exports.
    // Filter out the JS module-namespace artifact `Symbol.toStringTag`.
    const symbolExports = Object.getOwnPropertySymbols(core).filter(
      (s) => s !== Symbol.toStringTag,
    );
    expect(symbolExports).toEqual([]);
    // And no named export is the literal brand.
    expect(
      Object.keys(core).some((k) => k.toLowerCase().includes("renderedbrand")),
    ).toBe(false);
  });
});

describe("RenderedReply — `as` forgery is lint-caught (defense layer c)", () => {
  const linter = new Linter();

  function lintTs(code: string) {
    return linter.verify(code, sharedConfig as never, {
      filename: "src/forge.ts",
    });
  }

  it("flags `x as RenderedReply`", () => {
    const messages = lintTs(
      `const x: unknown = {}; const y = x as RenderedReply;`,
    );
    expect(
      messages.some((m) => m.ruleId === "no-restricted-syntax"),
    ).toBe(true);
  });

  it("flags `x as any as RenderedReply` (nested cast)", () => {
    const messages = lintTs(
      `const x: unknown = {}; const y = x as any as RenderedReply;`,
    );
    expect(
      messages.some((m) => m.ruleId === "no-restricted-syntax"),
    ).toBe(true);
  });

  it("does NOT flag the minter module (rendered-reply.ts) — it is exempt", () => {
    const messages = linter.verify(
      `const x: unknown = {}; const y = x as any as RenderedReply;`,
      sharedConfig as never,
      { filename: "packages/core/src/rendered-reply.ts" },
    );
    expect(
      messages.some((m) => m.ruleId === "no-restricted-syntax"),
    ).toBe(false);
  });
});
