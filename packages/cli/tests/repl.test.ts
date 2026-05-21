import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepl } from "../src/commands/repl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);

async function* fromArray(items: ReadonlyArray<string>): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

describe("repl — interactive adjudication", () => {
  it("runs one adjudicate cycle and prints a colored badge", async () => {
    const lines: string[] = [];
    await runRepl({
      pack: PIX_INDEX,
      stdout: (l) => lines.push(l),
      input: fromArray([
        "pix.charge.refund",
        JSON.stringify({
          chargeId: "c-1",
          refundCentavos: 1000,
          reason: "customer_request",
        }),
        JSON.stringify({
          charges: {
            "c-1": { id: "c-1", amountCentavos: 100000, status: "confirmed" },
          },
        }),
      ]),
    });
    const joined = lines.join("\n");
    // Strip ANSI for safe matching
    const stripped = joined.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toMatch(/adjudicate repl/);
    expect(stripped).toMatch(/EXECUTE/);
    expect(stripped).toMatch(/basis:/);
  });

  it(".intents lists the Pack's intent kinds", async () => {
    const lines: string[] = [];
    await runRepl({
      pack: PIX_INDEX,
      stdout: (l) => lines.push(l),
      input: fromArray([".intents"]),
    });
    const joined = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(joined).toMatch(/pix\.charge\.create/);
    expect(joined).toMatch(/pix\.charge\.confirm/);
    expect(joined).toMatch(/pix\.charge\.refund/);
  });

  it(".quit exits cleanly", async () => {
    const lines: string[] = [];
    await runRepl({
      pack: PIX_INDEX,
      stdout: (l) => lines.push(l),
      input: fromArray([".quit"]),
    });
    const joined = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(joined).toMatch(/bye\./);
  });

  it("reports payload JSON parse errors without crashing", async () => {
    const lines: string[] = [];
    await runRepl({
      pack: PIX_INDEX,
      stdout: (l) => lines.push(l),
      input: fromArray(["pix.charge.refund", "{not json"]),
    });
    const joined = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(joined).toMatch(/Payload JSON parse error/);
  });
});
