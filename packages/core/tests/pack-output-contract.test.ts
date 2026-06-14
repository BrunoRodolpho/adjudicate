import { describe, expect, it } from "vitest";
import { validateOutputShape, type OutputShape } from "@adjudicate/core";

describe("validateOutputShape", () => {
  it("unknown matches any value", () => {
    const shape: OutputShape = { kind: "unknown" };
    for (const v of ["x", 1, true, null, undefined, {}, [], { a: 1 }]) {
      expect(validateOutputShape(v, shape)).toBeNull();
    }
  });

  it("primitive match returns null", () => {
    expect(validateOutputShape("hi", { kind: "string" })).toBeNull();
    expect(validateOutputShape(3, { kind: "number" })).toBeNull();
    expect(validateOutputShape(false, { kind: "boolean" })).toBeNull();
  });

  it("primitive mismatch reports root path + expected/actual", () => {
    expect(validateOutputShape(3, { kind: "string" })).toEqual({ path: "", expected: "string", actual: "number" });
    expect(validateOutputShape(null, { kind: "number" })).toEqual({ path: "", expected: "number", actual: "null" });
    expect(validateOutputShape([], { kind: "boolean" })).toEqual({ path: "", expected: "boolean", actual: "array" });
  });

  it("object: required fields present and typed (extra fields allowed)", () => {
    const shape: OutputShape = {
      kind: "object",
      fields: { id: { kind: "string" }, n: { kind: "number" } },
    };
    expect(validateOutputShape({ id: "a", n: 1 }, shape)).toBeNull();
    expect(validateOutputShape({ id: "a", n: 1, extra: true }, shape)).toBeNull();
  });

  it("object: required field absent -> mismatch with actual 'absent'", () => {
    const shape: OutputShape = { kind: "object", fields: { id: { kind: "string" } } };
    expect(validateOutputShape({}, shape)).toEqual({ path: "id", expected: "string", actual: "absent" });
  });

  it("object: optional field may be absent", () => {
    const shape: OutputShape = {
      kind: "object",
      fields: { id: { kind: "string" }, note: { kind: "string" } },
      optional: ["note"],
    };
    expect(validateOutputShape({ id: "a" }, shape)).toBeNull();
  });

  it("object: wrong-typed nested field reports the nested path", () => {
    const shape: OutputShape = {
      kind: "object",
      fields: { meta: { kind: "object", fields: { count: { kind: "number" } } } },
    };
    expect(validateOutputShape({ meta: { count: "x" } }, shape)).toEqual({
      path: "meta.count",
      expected: "number",
      actual: "string",
    });
  });

  it("object: non-object value -> mismatch", () => {
    const shape: OutputShape = { kind: "object", fields: {} };
    expect(validateOutputShape(null, shape)).toEqual({ path: "", expected: "object", actual: "null" });
    expect(validateOutputShape([], shape)).toEqual({ path: "", expected: "object", actual: "array" });
    expect(validateOutputShape(5, shape)).toEqual({ path: "", expected: "object", actual: "number" });
  });

  it("array: each item validated; mismatch reports [i]; non-array rejected", () => {
    const shape: OutputShape = { kind: "array", items: { kind: "number" } };
    expect(validateOutputShape([1, 2, 3], shape)).toBeNull();
    expect(validateOutputShape([1, "x", 3], shape)).toEqual({ path: "[1]", expected: "number", actual: "string" });
    expect(validateOutputShape("nope", shape)).toEqual({ path: "", expected: "array", actual: "string" });
  });

  it("reports the FIRST mismatch only, in declared-field order", () => {
    const shape: OutputShape = {
      kind: "object",
      fields: { a: { kind: "string" }, b: { kind: "number" } },
    };
    expect(validateOutputShape({ a: 1, b: "x" }, shape)).toEqual({ path: "a", expected: "string", actual: "number" });
  });

  it("nested array of objects reports a deep path", () => {
    const shape: OutputShape = {
      kind: "object",
      fields: {
        items: {
          kind: "array",
          items: { kind: "object", fields: { amount: { kind: "number" } } },
        },
      },
    };
    expect(validateOutputShape({ items: [{ amount: 1 }, { amount: "bad" }] }, shape)).toEqual({
      path: "items[1].amount",
      expected: "number",
      actual: "string",
    });
  });

  it("is deterministic (same value+shape -> same result)", () => {
    const shape: OutputShape = { kind: "object", fields: { id: { kind: "string" } } };
    const a = validateOutputShape({ id: 7 }, shape);
    const b = validateOutputShape({ id: 7 }, shape);
    expect(a).toEqual(b);
  });
});
