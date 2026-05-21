import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runVisualize } from "../src/commands/visualize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-visualize-fixtures");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

describe("visualize — HTML emission", () => {
  it("writes a standalone HTML with SVG for the PIX pack", async () => {
    const output = path.join(FIXTURES_DIR, "pix.html");
    const lines: string[] = [];
    await runVisualize({
      pack: PIX_INDEX,
      output,
      stdout: (l) => lines.push(l),
    });

    const html = await fs.readFile(output, "utf8");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/pack-payments-pix/);
    expect(html).toMatch(/<svg/);
    expect(html).toMatch(/state/);
    expect(html).toMatch(/taint/);
    expect(html).toMatch(/auth/);
    expect(html).toMatch(/business/);
    // No <script> tags — purely static
    expect(html).not.toMatch(/<script/);
    expect(lines.join("\n")).toMatch(/Wrote/);
  });

  it("includes a decision-color legend", async () => {
    const output = path.join(FIXTURES_DIR, "pix-legend.html");
    await runVisualize({
      pack: PIX_INDEX,
      output,
      stdout: () => {
        // ignore
      },
    });
    const html = await fs.readFile(output, "utf8");
    expect(html).toMatch(/EXECUTE/);
    expect(html).toMatch(/REFUSE/);
    expect(html).toMatch(/DEFER/);
    expect(html).toMatch(/REWRITE/);
  });
});
