import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runRedTeamCommand } from "../src/commands/red-team.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(REPO_ROOT, "packages", "pack-payments-pix", "src", "index.ts");

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
});
