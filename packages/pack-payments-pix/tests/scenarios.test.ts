import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { adjudicate, buildEnvelope } from "@adjudicate/core";
import { paymentsPixPack, rehydratePixState } from "../src/index.js";

/**
 * Scenario conformance — every fixture in ./scenarios must produce its
 * declared `expected.kind` against the live Pack policy.
 *
 * The scenarios serve double duty: as adopter-facing documentation of
 * what the Pack does, and as a CI gate that fails when policy changes
 * unintentionally alter outcomes. The CLI's `adjudicate simulate
 * --scenarios` mode runs the same comparison; this test exists so the
 * Pack's own `pnpm test` covers it without requiring the CLI binary.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCENARIOS_DIR = path.join(__dirname, "..", "scenarios");

interface ScenarioFile {
  readonly intent: {
    readonly kind: string;
    readonly payload: unknown;
    readonly actor: { readonly principal: string; readonly sessionId: string };
    readonly taint: "SYSTEM" | "TRUSTED" | "UNTRUSTED";
    readonly nonce: string;
    readonly createdAt?: string;
  };
  readonly state: unknown;
  readonly expected: { readonly kind: string };
}

describe("scenarios — fixture conformance", () => {
  it("every scenario in ./scenarios produces its expected decision", async () => {
    const entries = await readdir(SCENARIOS_DIR);
    const files = entries.filter((f) => f.endsWith(".json")).sort();
    expect(files.length, "scenarios/ must contain at least one fixture").toBeGreaterThan(
      0,
    );

    for (const file of files) {
      const text = await readFile(path.join(SCENARIOS_DIR, file), "utf8");
      const scenario = JSON.parse(text) as ScenarioFile;

      const envelope = buildEnvelope({
        kind: scenario.intent.kind,
        payload: scenario.intent.payload,
        actor: scenario.intent.actor as {
          principal: "llm" | "user" | "system";
          sessionId: string;
        },
        taint: scenario.intent.taint,
        nonce: scenario.intent.nonce,
        ...(scenario.intent.createdAt !== undefined
          ? { createdAt: scenario.intent.createdAt }
          : {}),
      });
      const state = rehydratePixState(scenario.state);
      const decision = adjudicate(envelope, state, paymentsPixPack.policy);

      expect(
        decision.kind,
        `scenario ${file}: expected ${scenario.expected.kind}, got ${decision.kind}`,
      ).toBe(scenario.expected.kind);
    }
  });
});
