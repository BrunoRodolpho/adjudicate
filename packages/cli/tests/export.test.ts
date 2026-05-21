import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  type AuditRecord,
} from "@adjudicate/core";
import { runExport } from "../src/commands/export.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-export-fixtures");

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

function record(kind: string, decision: AuditRecord["decision"], at: string): AuditRecord {
  return buildAuditRecord({
    envelope: buildEnvelope({
      kind,
      payload: { x: 1 },
      actor: { principal: "llm", sessionId: "sess" },
      taint: "UNTRUSTED",
      nonce: `n-${at}`,
    }),
    decision,
    durationMs: 5,
    at,
  });
}

describe("export — JSON output", () => {
  it("emits a pretty-printed JSON array", async () => {
    const src = path.join(FIXTURES_DIR, "src1.json");
    const r1 = record("foo.bar", decisionExecute([]), "2026-01-01T00:00:00.000Z");
    await fs.writeFile(src, JSON.stringify([r1]));

    const lines: string[] = [];
    await runExport({
      source: src,
      format: "json",
      stdout: (l) => lines.push(l),
    });
    const out = JSON.parse(lines.join("\n")) as AuditRecord[];
    expect(out).toHaveLength(1);
    expect(out[0]!.envelope.kind).toBe("foo.bar");
  });
});

describe("export — CSV output", () => {
  it("emits a header row and one row per record with quoted strings", async () => {
    const src = path.join(FIXTURES_DIR, "src2.json");
    const r1 = record("foo.bar", decisionExecute([]), "2026-01-01T00:00:00.000Z");
    const r2 = record(
      'foo,"escape',
      decisionRefuse(
        {
          kind: "BUSINESS_RULE",
          code: "test_refuse",
          userFacing: "nope",
        },
        [],
      ),
      "2026-01-02T00:00:00.000Z",
    );
    await fs.writeFile(src, JSON.stringify([r1, r2]));

    const lines: string[] = [];
    await runExport({
      source: src,
      format: "csv",
      stdout: (l) => lines.push(l),
    });
    const text = lines.join("\n");
    expect(text).toMatch(/^intent_hash,kind,decision_kind,recorded_at,duration_ms/);
    expect(text).toMatch(/"foo\.bar"/);
    expect(text).toMatch(/"EXECUTE"/);
    expect(text).toMatch(/"REFUSE"/);
    // Inner quote escaped as ""
    expect(text).toMatch(/"foo,""escape"/);
  });
});

describe("export — filtering", () => {
  it("respects --since and --until ISO bounds", async () => {
    const src = path.join(FIXTURES_DIR, "src3.json");
    const old = record(
      "old.thing",
      decisionExecute([]),
      "2025-01-01T00:00:00.000Z",
    );
    const middle = record(
      "middle.thing",
      decisionExecute([]),
      "2026-03-15T00:00:00.000Z",
    );
    const newer = record(
      "new.thing",
      decisionExecute([]),
      "2027-01-01T00:00:00.000Z",
    );
    await fs.writeFile(src, JSON.stringify([old, middle, newer]));

    const lines: string[] = [];
    await runExport({
      source: src,
      format: "json",
      since: "2026-01-01T00:00:00.000Z",
      until: "2027-01-01T00:00:00.000Z",
      stdout: (l) => lines.push(l),
    });
    const out = JSON.parse(lines.join("\n")) as AuditRecord[];
    expect(out).toHaveLength(1);
    expect(out[0]!.envelope.kind).toBe("middle.thing");
  });
});

describe("export — parquet rejection", () => {
  it("returns a helpful message and exits 1 for parquet", async () => {
    const src = path.join(FIXTURES_DIR, "src4.json");
    await fs.writeFile(src, "[]");

    const stdLines: string[] = [];
    const errLines: string[] = [];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runExport({
          source: src,
          format: "parquet",
          stdout: (l) => stdLines.push(l),
          stderr: (l) => errLines.push(l),
        }),
      ).rejects.toThrow(/process.exit:1/);
      expect(errLines.join("\n")).toMatch(/Parquet/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
