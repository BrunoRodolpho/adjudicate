import { describe, expect, it } from "vitest";
import type { AuditRecord } from "@adjudicate/core";
import { composeFolds, composeMetadataProviders } from "../src/index.js";

describe("composeFolds", () => {
  it("applies folds left-to-right, each seeing the prior output", () => {
    const add = (s: { n: number }, r: number) => ({ n: s.n + r });
    const double = (s: { n: number }) => ({ n: s.n * 2 });
    const folded = composeFolds(add, double)({ n: 1 }, 4); // (1+4)*2
    expect(folded).toEqual({ n: 10 });
  });

  it("returns prevState unchanged with no folds", () => {
    expect(composeFolds<{ n: number }, number>()({ n: 7 }, 1)).toEqual({ n: 7 });
  });
});

describe("composeMetadataProviders", () => {
  const rec = {} as AuditRecord;

  it("merges provider outputs (later keys win)", () => {
    const m = composeMetadataProviders(
      () => ({ a: 1, shared: "first" }),
      () => ({ b: 2, shared: "second" }),
    )(rec);
    expect(m).toEqual({ a: 1, b: 2, shared: "second" });
  });

  it("returns undefined when every provider abstains (byte-identical audit hash)", () => {
    expect(composeMetadataProviders(() => undefined, () => undefined)(rec)).toBeUndefined();
  });

  it("skips abstaining providers but keeps the rest", () => {
    expect(composeMetadataProviders(() => undefined, () => ({ x: 1 }))(rec)).toEqual({ x: 1 });
  });
});
