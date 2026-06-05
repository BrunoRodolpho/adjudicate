import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runSimulate } from "../src/commands/simulate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-simulate-fixtures");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PIX_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-payments-pix",
  "src",
  "index.ts",
);
const KYC_INDEX = path.join(
  REPO_ROOT,
  "packages",
  "pack-identity-kyc",
  "src",
  "index.ts",
);

interface CaptureSession {
  readonly lines: string[];
  readonly write: (line: string) => void;
  readonly joined: () => string;
}

function capture(): CaptureSession {
  const lines: string[] = [];
  return {
    lines,
    write: (line) => {
      lines.push(line);
    },
    joined: () => lines.join("\n"),
  };
}

async function writeScenario(
  filename: string,
  scenario: unknown,
): Promise<string> {
  const filePath = path.join(FIXTURES_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(scenario, null, 2), "utf8");
  return filePath;
}

const pixActor = { principal: "llm", sessionId: "sess-pix" };
const kycActor = { principal: "llm", sessionId: "sess-kyc" };

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

// ─── PIX scenarios ─────────────────────────────────────────────────────────

describe("simulate — PIX pack integration", () => {
  it("EXECUTE: small refund against a confirmed charge", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.refund",
        payload: {
          chargeId: "c-1",
          refundCentavos: 1_000,
          reason: "customer_request",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-execute",
      },
      state: {
        charges: {
          "c-1": {
            id: "c-1",
            amountCentavos: 100_000,
            status: "confirmed",
          },
        },
      },
    };

    const scenarioPath = await writeScenario("pix-execute.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      pack: { id: string };
      decision: { kind: string };
      trace: Array<{ phase: string; outcome: string; index?: number }>;
    };
    expect(result.pack.id).toBe("pack-payments-pix");
    expect(result.decision.kind).toBe("EXECUTE");
    const matches = result.trace.filter((e) => e.outcome === "match");
    expect(matches).toHaveLength(1);
    expect(result.trace.at(-1)?.outcome).toBe("match");
  });

  it("REQUEST_CONFIRMATION: medium refund triggers user confirmation", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.refund",
        payload: {
          chargeId: "c-1",
          refundCentavos: 60_000,
          reason: "customer_request",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-confirm",
      },
      state: {
        charges: {
          "c-1": {
            id: "c-1",
            amountCentavos: 100_000,
            status: "confirmed",
          },
        },
      },
    };

    const scenarioPath = await writeScenario("pix-confirm.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as { decision: { kind: string } };
    expect(result.decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("ESCALATE: large refund exceeds the supervisor threshold", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.refund",
        payload: {
          chargeId: "c-1",
          refundCentavos: 150_000,
          reason: "customer_request",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-escalate",
      },
      state: {
        charges: {
          "c-1": {
            id: "c-1",
            amountCentavos: 200_000,
            status: "confirmed",
          },
        },
      },
    };

    const scenarioPath = await writeScenario("pix-escalate.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      decision: { kind: string; to?: string };
    };
    expect(result.decision.kind).toBe("ESCALATE");
    expect(result.decision.to).toBe("supervisor");
  });

  it("DEFER: charge.create parks awaiting the provider webhook signal", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.create",
        payload: {
          amountCentavos: 50_000,
          payerDocument: "12345678901",
          description: "test",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-defer",
      },
      state: { charges: {} },
    };

    const scenarioPath = await writeScenario("pix-defer.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      decision: { kind: string; signal?: string };
    };
    expect(result.decision.kind).toBe("DEFER");
    expect(result.decision.signal).toBe("payment.confirmed");
  });

  it("REWRITE: refund > charge amount is clamped to the original", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.refund",
        payload: {
          chargeId: "c-1",
          refundCentavos: 300_000,
          reason: "customer_request",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-rewrite",
      },
      state: {
        charges: {
          "c-1": {
            id: "c-1",
            amountCentavos: 100_000,
            status: "confirmed",
          },
        },
      },
    };

    const scenarioPath = await writeScenario("pix-rewrite.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      decision: { kind: string; reason?: string };
    };
    expect(result.decision.kind).toBe("REWRITE");
  });
});

// ─── KYC scenarios ─────────────────────────────────────────────────────────

describe("simulate — KYC pack integration", () => {
  it("DEFER: kyc.start always defers awaiting document upload", async () => {
    const scenario = {
      intent: {
        kind: "kyc.start",
        payload: {},
        actor: kycActor,
        taint: "UNTRUSTED",
        nonce: "n-kyc-start",
      },
      state: { sessions: {} },
    };

    const scenarioPath = await writeScenario("kyc-start.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: KYC_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      pack: { id: string };
      decision: { kind: string; signal?: string };
    };
    expect(result.pack.id).toBe("pack-identity-kyc");
    expect(result.decision.kind).toBe("DEFER");
    expect(result.decision.signal).toBe("kyc.documents.uploaded");
  });

  it("REFUSE on system-only kind with UNTRUSTED taint (taint primitive)", async () => {
    const scenario = {
      intent: {
        kind: "kyc.vendor.callback",
        payload: { sessionId: "s-1", score: 95, amlStatus: "CLEAR" },
        actor: kycActor,
        taint: "UNTRUSTED",
        nonce: "n-taint-attack",
      },
      state: { sessions: {} },
    };

    const scenarioPath = await writeScenario("kyc-taint.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: KYC_INDEX,
      scenario: scenarioPath,
      format: "json",
      stdout: cap.write,
    });

    const result = JSON.parse(cap.joined()) as {
      decision: { kind: string; refusal?: { code: string } };
      trace: Array<{ phase: string; outcome: string }>;
    };
    expect(result.decision.kind).toBe("REFUSE");
    expect(result.decision.refusal?.code).toBe("taint_level_insufficient");
    expect(result.trace.at(-1)).toEqual({ phase: "taint", outcome: "match" });
  });
});

// ─── Renderer + arg validation ─────────────────────────────────────────────

describe("simulate — output formats", () => {
  it("text format renders a DECISION header and trace lines", async () => {
    const scenario = {
      intent: {
        kind: "pix.charge.refund",
        payload: {
          chargeId: "c-1",
          refundCentavos: 1_000,
          reason: "customer_request",
        },
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-text",
      },
      state: {
        charges: {
          "c-1": { id: "c-1", amountCentavos: 100_000, status: "confirmed" },
        },
      },
    };

    const scenarioPath = await writeScenario("pix-text.json", scenario);
    const cap = capture();

    await runSimulate({
      pack: PIX_INDEX,
      scenario: scenarioPath,
      format: "text",
      stdout: cap.write,
    });

    const text = cap.joined();
    expect(text).toMatch(/DECISION:/);
    expect(text).toMatch(/EXECUTE/);
    expect(text).toMatch(/Trace/);
    expect(text).toMatch(/Basis/);
  });
});

// ─── Conformance gate (SecurityReviewer-006) ───────────────────────────────

describe("simulate — kernel conformance gate", () => {
  it("rejects a structurally-valid but non-conformant pack with a conformance error", async () => {
    // This pack passes the loader's `isLikelyPack` (intents+policy+contract)
    // and `isLoadedPack` (id+policy string id) structural checks, but fails
    // `assertPackConformance`: no `version`, no `planner`, empty `basisCodes`.
    const badPackPath = path.join(FIXTURES_DIR, "bad-pack-simulate.ts");
    await fs.writeFile(
      badPackPath,
      `export const badPack = {
        id: "bad-simulate",
        contract: "v0",
        intents: ["x.do"],
        basisCodes: [],
        policy: {
          stateGuards: [],
          authGuards: [],
          taint: undefined,
          business: [],
          default: "REFUSE",
        },
      };
`,
      "utf8",
    );

    const scenario = {
      intent: {
        kind: "x.do",
        payload: {},
        actor: pixActor,
        taint: "UNTRUSTED",
        nonce: "n-bad",
      },
      state: {},
    };
    const scenarioPath = await writeScenario("bad-scenario.json", scenario);

    const errLines: string[] = [];
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errLines.push(args.map((a) => String(a)).join(" "));
      });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runSimulate({
          pack: badPackPath,
          scenario: scenarioPath,
          format: "json",
          stdout: () => {},
        }),
      ).rejects.toThrow(/process.exit:1/);
      expect(errLines.join("\n")).toMatch(/Pack conformance failed/);
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
