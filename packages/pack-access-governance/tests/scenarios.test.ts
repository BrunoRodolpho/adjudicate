import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { adjudicate, buildEnvelope } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, "..", "scenarios");

describe("pack-access-governance — scenario fixtures", () => {
  it("every scenario produces its expected decision", async () => {
    const files = (await readdir(SCENARIOS_DIR)).filter((f) => f.endsWith(".json")).sort();
    expect(files.length).toBe(6);
    for (const file of files) {
      const s = JSON.parse(await readFile(path.join(SCENARIOS_DIR, file), "utf8")) as {
        intent: { kind: string; payload: unknown; actor: { principal: "llm" | "user" | "system"; sessionId: string }; taint: "SYSTEM" | "TRUSTED" | "UNTRUSTED"; nonce: string; createdAt?: string };
        state: unknown;
        expected: { kind: string };
      };
      const env = buildEnvelope({
        kind: s.intent.kind,
        payload: s.intent.payload,
        actor: s.intent.actor,
        taint: s.intent.taint,
        nonce: s.intent.nonce,
        ...(s.intent.createdAt ? { createdAt: s.intent.createdAt } : {}),
      });
      const decision = adjudicate(env, rehydrateAccessState(s.state), accessGovernancePack.policy);
      expect(decision.kind, `${file}`).toBe(s.expected.kind);
    }
  });
});
