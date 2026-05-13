import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadScenario,
  loadIntentAndState,
  ScenarioParseError,
} from "../src/lib/scenario.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-scenarios");

async function writeJson(filename: string, data: unknown): Promise<string> {
  const filePath = path.join(FIXTURES_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

const validIntent = {
  kind: "pix.charge.refund",
  payload: { chargeId: "c-1", refundCentavos: 1000, reason: "test" },
  actor: { principal: "llm", sessionId: "sess-1" },
  taint: "UNTRUSTED",
  nonce: "n-1",
  createdAt: "2026-04-29T12:00:00.000Z",
};

const validState = {
  charges: {
    "c-1": {
      id: "c-1",
      amountCentavos: 100000,
      status: "confirmed",
    },
  },
};

describe("loadScenario — accepts well-formed input", () => {
  it("loads a bundled scenario with intent + state + expected", async () => {
    const filePath = await writeJson("ok-bundled.json", {
      intent: validIntent,
      state: validState,
      expected: { kind: "EXECUTE" },
    });

    const scenario = await loadScenario(filePath);
    expect(scenario.intent.kind).toBe("pix.charge.refund");
    expect(scenario.intent.taint).toBe("UNTRUSTED");
    expect(scenario.state).toEqual(validState);
    expect(scenario.expected).toEqual({ kind: "EXECUTE" });
  });

  it("loads a bundled scenario without expected", async () => {
    const filePath = await writeJson("ok-no-expected.json", {
      intent: validIntent,
      state: validState,
    });

    const scenario = await loadScenario(filePath);
    expect(scenario.expected).toBeUndefined();
  });

  it("loads intent + state from separate files", async () => {
    const intentPath = await writeJson("intent-only.json", validIntent);
    const statePath = await writeJson("state-only.json", validState);

    const scenario = await loadIntentAndState(intentPath, statePath);
    expect(scenario.intent.kind).toBe("pix.charge.refund");
    expect(scenario.state).toEqual(validState);
  });

  it("accepts an intent without explicit createdAt (optional field)", async () => {
    const intentMinus = { ...validIntent };
    delete (intentMinus as { createdAt?: string }).createdAt;
    const filePath = await writeJson("ok-no-createdat.json", {
      intent: intentMinus,
      state: validState,
    });

    const scenario = await loadScenario(filePath);
    expect(scenario.intent.createdAt).toBeUndefined();
  });
});

describe("loadScenario — rejects malformed input with structured errors", () => {
  it("rejects an unknown taint value", async () => {
    const filePath = await writeJson("bad-taint.json", {
      intent: { ...validIntent, taint: "MEGATRUSTED" },
      state: validState,
    });

    await expect(loadScenario(filePath)).rejects.toBeInstanceOf(
      ScenarioParseError,
    );
    await expect(loadScenario(filePath)).rejects.toThrow(/taint/);
  });

  it("rejects an unknown expected decision kind", async () => {
    const filePath = await writeJson("bad-expected.json", {
      intent: validIntent,
      state: validState,
      expected: { kind: "MAYBE" },
    });
    await expect(loadScenario(filePath)).rejects.toThrow(/expected.kind/);
  });

  it("rejects an intent missing required fields", async () => {
    const filePath = await writeJson("bad-missing.json", {
      intent: { kind: "pix.charge.refund" },
      state: validState,
    });
    await expect(loadScenario(filePath)).rejects.toBeInstanceOf(
      ScenarioParseError,
    );
  });

  it("rejects an intent with extra top-level keys (strict mode)", async () => {
    const filePath = await writeJson("bad-extra.json", {
      intent: { ...validIntent, mystery: true },
      state: validState,
    });
    await expect(loadScenario(filePath)).rejects.toBeInstanceOf(
      ScenarioParseError,
    );
  });

  it("rejects malformed JSON with a readable error", async () => {
    const filePath = path.join(FIXTURES_DIR, "bad-json.json");
    await fs.writeFile(filePath, "{ not valid json", "utf8");
    await expect(loadScenario(filePath)).rejects.toThrow(/JSON/);
  });
});

describe("ScenarioParseError — error message format", () => {
  it("includes the path and a bullet list of issues", async () => {
    const filePath = await writeJson("bad-multi.json", {
      intent: { ...validIntent, taint: "BOGUS", nonce: "" },
      state: validState,
    });
    try {
      await loadScenario(filePath);
      throw new Error("expected ScenarioParseError");
    } catch (err) {
      expect(err).toBeInstanceOf(ScenarioParseError);
      const e = err as ScenarioParseError;
      expect(e.path).toBe(filePath);
      expect(e.issues.length).toBeGreaterThanOrEqual(2);
      expect(e.message).toContain(filePath);
      expect(e.message).toContain("•");
    }
  });
});
