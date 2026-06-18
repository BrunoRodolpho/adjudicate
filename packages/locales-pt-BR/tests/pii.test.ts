import { describe, expect, it } from "vitest";
import { brazilianPiiPatterns, cnpjPattern, cpfPattern } from "../src/index.js";

describe("pt-BR PII patterns", () => {
  it("cpfPattern matches CPF with and without separators", () => {
    expect(cpfPattern.pattern.test("123.456.789-09")).toBe(true);
    expect(cpfPattern.pattern.test("12345678909")).toBe(true);
    expect(cpfPattern.pattern.test("not a cpf")).toBe(false);
  });

  it("cnpjPattern matches CNPJ with and without separators", () => {
    expect(cnpjPattern.pattern.test("12.345.678/0001-95")).toBe(true);
    expect(cnpjPattern.pattern.test("12345678000195")).toBe(true);
    expect(cnpjPattern.pattern.test("not a cnpj")).toBe(false);
  });

  it("brazilianPiiPatterns bundles cnpj + cpf", () => {
    expect(brazilianPiiPatterns.map((p) => p.id).sort()).toEqual(["cnpj", "cpf"]);
  });
});
