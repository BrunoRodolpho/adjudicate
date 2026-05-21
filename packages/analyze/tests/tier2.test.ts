/**
 * Tier 2 AST analyzer tests.
 *
 * Each test constructs a fake guard source file in an in-memory project,
 * runs `rewriteScopeAstAnalyzer` against it, and asserts the expected
 * diagnostics. We use ts-morph's in-memory filesystem so tests do not
 * touch disk and produce no fixtures-on-disk drift.
 */

import { describe, expect, it } from "vitest";
import { Project, type SourceFile } from "ts-morph";
import { rewriteScopeAstAnalyzer } from "../src/tier2.js";
import { analyzePolicy } from "../src/analyze.js";
import type { PackV0 } from "@adjudicate/core";

function parseInMemory(code: string): SourceFile {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    useInMemoryFileSystem: true,
  });
  return project.createSourceFile("guard.ts", code);
}

// Minimal pack object that just satisfies the type contract. Tier 2
// analyzer ignores Pack contents — it only walks source.
const stubPack: PackV0<string, unknown, unknown, unknown> = {
  id: "test-pack",
  version: "0.0.1",
  contract: "v0",
  intents: ["x.y"] as ReadonlyArray<string>,
  basisCodes: ["x.y.code"],
  policy: {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [],
    default: "REFUSE",
  },
  planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [] }) },
} as unknown as PackV0<string, unknown, unknown, unknown>;

describe("Tier 2 — rewriteScopeAstAnalyzer (AJD-201)", () => {
  it("clean: declared mutatesPayloadFields matches actual REWRITE assignments", () => {
    const file = parseInMemory(`
      const clampGuard = withMetadata(
        (envelope) => {
          const rewritten = buildEnvelope({
            kind: envelope.kind,
            payload: { ...envelope.payload, refundCentavos: 100 },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          });
          return decisionRewrite(rewritten, "clamped", []);
        },
        {
          description: {
            kind: "rewrite",
            mutatesPayloadFields: ["refundCentavos"],
          },
        },
      );
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    // Spread + explicit refundCentavos override; analyzer counts the explicit
    // field. Declaration matches → no errors. There may be a note about the
    // spread itself, but no AJD-201 error or warning.
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(diagnostics.filter((d) => d.severity === "warning")).toEqual([]);
  });

  it("undeclared mutation: an additional field is set but not declared", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => {
          const rewritten = buildEnvelope({
            kind: envelope.kind,
            payload: { refundCentavos: 100, reason: "auto-clamped" },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          });
          return decisionRewrite(rewritten, "clamped", []);
        },
        {
          description: {
            kind: "rewrite",
            mutatesPayloadFields: ["refundCentavos"],
          },
        },
      );
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("AJD-201");
    expect(errors[0]?.message).toContain("reason");
    expect(errors[0]?.sourceLocation?.file).toBeTruthy();
    expect(errors[0]?.sourceLocation?.line).toBeGreaterThan(0);
  });

  it("stale declaration: declared field never appears in any rewrite", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => {
          const rewritten = buildEnvelope({
            kind: envelope.kind,
            payload: { refundCentavos: 100 },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          });
          return decisionRewrite(rewritten, "clamped", []);
        },
        {
          description: {
            kind: "rewrite",
            mutatesPayloadFields: ["refundCentavos", "nonexistentField"],
          },
        },
      );
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    expect(warnings.some((d) => d.message.includes("nonexistentField"))).toBe(
      true,
    );
  });

  it("unsafe spread: payload uses spread-only and declared fields cannot be verified", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => {
          const rewritten = buildEnvelope({
            kind: envelope.kind,
            payload: { ...envelope.payload },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          });
          return decisionRewrite(rewritten, "no-op", []);
        },
        {
          description: {
            kind: "rewrite",
            mutatesPayloadFields: ["x"],
          },
        },
      );
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    // Spread without explicit follow-on overrides — emit a note.
    expect(diagnostics.some((d) => d.severity === "note")).toBe(true);
  });

  it("inline buildEnvelope: walks directly without an intermediate const", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => decisionRewrite(
          buildEnvelope({
            kind: envelope.kind,
            payload: { unauthorized: true },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          }),
          "inline",
          [],
        ),
        {
          description: {
            kind: "rewrite",
            mutatesPayloadFields: [],
          },
        },
      );
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("unauthorized");
  });

  it("no rewrite calls: zero diagnostics", () => {
    const file = parseInMemory(`
      const guard = () => decisionRefuse(refuse("STATE", "x", "no"), []);
    `);
    const diagnostics = rewriteScopeAstAnalyzer.analyze(stubPack, [file]);
    expect(diagnostics).toEqual([]);
  });

  it("determinism: same source → same diagnostics across runs", () => {
    const code = `
      const guard = withMetadata(
        (envelope) => {
          const rewritten = buildEnvelope({
            kind: envelope.kind,
            payload: { a: 1, b: 2 },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          });
          return decisionRewrite(rewritten, "two", []);
        },
        { description: { kind: "rewrite", mutatesPayloadFields: ["a"] } },
      );
    `;
    const fileA = parseInMemory(code);
    const fileB = parseInMemory(code);
    const diagsA = rewriteScopeAstAnalyzer.analyze(stubPack, [fileA]);
    const diagsB = rewriteScopeAstAnalyzer.analyze(stubPack, [fileB]);
    const normalize = (d: ReturnType<typeof rewriteScopeAstAnalyzer.analyze>) =>
      d.map((x) => ({ code: x.code, severity: x.severity, message: x.message }));
    expect(normalize(diagsA)).toEqual(normalize(diagsB));
  });
});

describe("Tier 2 wired into analyzePolicy", () => {
  it("analyzePolicy includes Tier 2 diagnostics when sourceFiles supplied", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => decisionRewrite(
          buildEnvelope({
            kind: envelope.kind,
            payload: { unsafeField: true },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          }),
          "x",
          [],
        ),
        { description: { kind: "rewrite", mutatesPayloadFields: [] } },
      );
    `);
    const report = analyzePolicy({
      pack: stubPack,
      sourceFiles: [file],
    });
    expect(report.diagnostics.some((d) => d.code === "AJD-201")).toBe(true);
  });

  it("analyzePolicy skips Tier 2 entirely when sourceFiles is undefined", () => {
    const report = analyzePolicy({ pack: stubPack });
    expect(report.diagnostics.every((d) => d.code !== "AJD-201")).toBe(true);
  });

  it("Tier 2 severity respects severityOverrides", () => {
    const file = parseInMemory(`
      const guard = withMetadata(
        (envelope) => decisionRewrite(
          buildEnvelope({
            kind: envelope.kind,
            payload: { undeclared: true },
            actor: envelope.actor,
            taint: envelope.taint,
            nonce: envelope.nonce,
          }),
          "x",
          [],
        ),
        { description: { kind: "rewrite", mutatesPayloadFields: [] } },
      );
    `);
    const report = analyzePolicy({
      pack: stubPack,
      sourceFiles: [file],
      severityOverrides: { "AJD-201": "warning" },
    });
    const ajd201 = report.diagnostics.filter((d) => d.code === "AJD-201");
    expect(ajd201.length).toBeGreaterThan(0);
    expect(ajd201.every((d) => d.severity === "warning")).toBe(true);
  });
});
