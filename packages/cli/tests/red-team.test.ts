import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runRedTeamCommand } from "../src/commands/red-team.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(REPO_ROOT, "packages", "pack-payments-pix", "src", "index.ts");
const ORIGIN_REQUIRED_PACK = path.join(__dirname, "fixtures", "origin-required-pack.ts");

function capture() {
  const lines: string[] = [];
  return { lines, write: (l: string) => lines.push(l) };
}

const priorExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = priorExitCode;
});

describe("adjudicate red-team (CLI)", () => {
  it("PIX withstands every vector → 0 escapes, exit 0", async () => {
    const cap = capture();
    await runRedTeamCommand({ pack: PIX_INDEX, stdout: cap.write, format: "text" });
    const text = cap.lines.join("\n");
    expect(text).toContain("0 escaped");
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
  });

  it("emits parseable JSON with --format json", async () => {
    const cap = capture();
    await runRedTeamCommand({ pack: PIX_INDEX, stdout: cap.write, format: "json" });
    const parsed = JSON.parse(cap.lines.join("\n"));
    expect(parsed.summary.escaped).toBe(0);
    expect(parsed.pack.id).toBe("pack-payments-pix");
  });

  it("042: the provenance_injection vector is wired, fires, and is DEFENDED for the real PIX pack", async () => {
    const cap = capture();
    await runRedTeamCommand({
      pack: PIX_INDEX,
      stdout: cap.write,
      format: "json",
      vectors: ["provenance_injection"],
    });
    const parsed = JSON.parse(cap.lines.join("\n"));
    // The generator actually fires for PIX (pix.charge.confirm is system-only),
    // and every contaminated proposal is DEFENDED (no clean EXECUTE escape).
    expect(parsed.summary.total).toBeGreaterThan(0);
    expect(parsed.summary.escaped).toBe(0);
    const provResults = parsed.results.filter(
      (r: { vector: string }) => r.vector === "provenance_injection",
    );
    expect(provResults.length).toBeGreaterThan(0);
    expect(
      provResults.every((r: { status: string }) => r.status === "defended"),
    ).toBe(true);
    // NOTE: for PIX a STATE precondition refuses `pix.charge.confirm` in the
    // initial state BEFORE the taint gate (kernel order state→taint), so these
    // are defended upstream of the taint gate. The taint-gate propagation path
    // itself is proven non-vacuously by the red-team generators suite against a
    // pack whose state guards do not pre-empt the taint gate.
  });

  it("043: the read_inject_intent vector is wired into the CLI and runs cleanly for PIX (no escapes)", async () => {
    // PIX declares no origin-required kind, so the 043 vector is a no-op for it —
    // but the CLI must accept the vector key and run without error / escapes.
    const cap = capture();
    await runRedTeamCommand({
      pack: PIX_INDEX,
      stdout: cap.write,
      format: "json",
      vectors: ["read_inject_intent"],
    });
    const parsed = JSON.parse(cap.lines.join("\n"));
    expect(parsed.summary.escaped).toBe(0);
    expect(parsed.summary.errors).toBe(0);
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
  });

  it("043: the read_inject_intent vector FIRES and is DEFENDED for an origin-required pack (laundering caught at the kernel)", async () => {
    const cap = capture();
    await runRedTeamCommand({
      pack: ORIGIN_REQUIRED_PACK,
      stdout: cap.write,
      format: "json",
      vectors: ["read_inject_intent"],
    });
    const parsed = JSON.parse(cap.lines.join("\n"));
    // The generator actually fires for the fixture (memo.write is origin-required)
    // and every laundered proposal is DEFENDED via the 043 origin branch.
    expect(parsed.summary.total).toBeGreaterThan(0);
    expect(parsed.summary.escaped).toBe(0);
    const results = parsed.results.filter(
      (r: { vector: string }) => r.vector === "read_inject_intent",
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.status).toBe("defended");
      expect(r.decision).toBe("REFUSE");
      // The defense came from the 043 origin branch (propagation_violation), not
      // the trust-rank floor (level_insufficient).
      expect(r.basisCodes).toContain("taint:propagation_violation");
      expect(r.basisCodes).not.toContain("taint:level_insufficient");
    }
  });

  // H13 — a baseline that PARSES but is structurally malformed (missing the numeric
  // ceilings) must FAIL CLOSED (exit 2), not silently void the §C gate. The void
  // case: `{packId:'<match>',scenarios:[]}` — the packId matches so the gate is
  // reached, but `escaped`/`errors`/`ownershipEscaped` are undefined, so every
  // `N > undefined` count check is false ⇒ a clean exit 0 PROMOTE despite escapes.
  // Without the structural validation this test fails (exitCode would be 0/undef).
  it("H13: a malformed baseline missing the numeric ceilings FAILS CLOSED (exit 2), not a clean PROMOTE", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "redteam-baseline-"));
    const bad = path.join(dir, "baseline.json");
    // packId MATCHES so we pass the packId guard and reach the gate; the body is
    // the void-the-gate shape (no numeric ceilings, empty scenarios).
    writeFileSync(bad, JSON.stringify({ packId: "pack-payments-pix", scenarios: [] }), "utf8");
    const cap = capture();
    await runRedTeamCommand({ pack: PIX_INDEX, baseline: bad, stdout: cap.write, format: "text" });
    const text = cap.lines.join("\n");
    expect(text).toContain("malformed canary baseline");
    expect(process.exitCode).toBe(2); // fail-closed — never a clean 0 set -e cannot catch
  });

  it("H13: an empty-scenarios baseline that is otherwise WELL-FORMED is accepted (validation is shape-only, not posture)", async () => {
    // Guard against over-rejection: a legitimately empty `scenarios` array with all
    // numeric ceilings present is structurally valid and must NOT be rejected as
    // malformed (the gate then evaluates posture normally).
    const dir = mkdtempSync(path.join(os.tmpdir(), "redteam-baseline-ok-"));
    const ok = path.join(dir, "baseline.json");
    writeFileSync(
      ok,
      JSON.stringify({
        packId: "pack-payments-pix",
        escaped: 0,
        errors: 0,
        ownershipEscaped: 0,
        taintVacuous: false,
        scenarios: [],
      }),
      "utf8",
    );
    const cap = capture();
    await runRedTeamCommand({ pack: PIX_INDEX, baseline: ok, stdout: cap.write, format: "text" });
    expect(cap.lines.join("\n")).not.toContain("malformed canary baseline");
  });
});
