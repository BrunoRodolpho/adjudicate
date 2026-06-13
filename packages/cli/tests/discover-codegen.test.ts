import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runDiscover } from "../src/commands/discover.js";
import type { McpTool } from "../src/lib/mcp-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Codegen conformance test for `adjudicate discover`.
 *
 * Feeds a MOCKED `tools/list` (3 tools, one of which needs sanitization)
 * through the discover command with an injected transport (no network).
 * Scaffolds into a fixture path inside the workspace — so the generated
 * Pack's `@adjudicate/core` / `@adjudicate/conformance` imports resolve
 * via the hoisted node_modules without an install — then dynamically
 * imports the generated Pack and asserts it passes BOTH
 * `assertPackConformance` AND `runConformance`, plus that one REFUSE
 * scenario exists per discovered tool.
 */

const FIXTURES_DIR = path.join(__dirname, ".test-fixtures-discover");
const PACK_NAME = "pack-discover-fixture";
const PACK_DIR = path.join(FIXTURES_DIR, PACK_NAME);

// Mock MCP tool list: 3 tools, including `create_order` (underscore →
// must be sanitized so the wire name is not an ambiguous bare a_b).
const MOCK_TOOLS: ReadonlyArray<McpTool> = [
  { name: "create_order", description: "Create a new order" },
  { name: "cancel.order", description: "Cancel an order" },
  { name: "List Items", description: "List items" },
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("discover — codegen produces a conformant deny-by-default Pack", () => {
  beforeAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await runDiscover("https://example.test/mcp", {
      name: PACK_NAME,
      target: FIXTURES_DIR,
      fetchToolList: async () => MOCK_TOOLS,
      stdout: () => {
        // silence
      },
    });
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it("renders the canonical file layout", async () => {
    const expected = [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/policy.ts",
      "tests/conformance.test.ts",
    ];
    for (const rel of expected) {
      expect(
        await fileExists(path.join(PACK_DIR, rel)),
        `Expected ${rel} to exist in scaffolded discover Pack`,
      ).toBe(true);
    }
  });

  it("substitutes every placeholder (no leftover {{...}} markers)", async () => {
    const files = ["src/index.ts", "src/policy.ts", "tests/conformance.test.ts"];
    for (const rel of files) {
      const src = await fs.readFile(path.join(PACK_DIR, rel), "utf8");
      expect(src, `${rel} has leftover placeholders`).not.toContain("{{");
      expect(src, `${rel} has leftover placeholders`).not.toContain("}}");
    }
  });

  it("generated Pack passes assertPackConformance", async () => {
    const mod = (await import(path.join(PACK_DIR, "src", "index.ts"))) as Record<
      string,
      unknown
    >;
    const pack = mod.DiscoverFixturePack;
    expect(pack).toBeDefined();

    const { assertPackConformance } = await import("@adjudicate/core");
    expect(() => assertPackConformance(pack as never)).not.toThrow();
  });

  it("generated Pack passes runConformance (AC-001..AC-006)", async () => {
    const mod = (await import(path.join(PACK_DIR, "src", "index.ts"))) as Record<
      string,
      unknown
    >;
    const pack = mod.DiscoverFixturePack;

    const { runConformance } = await import("@adjudicate/conformance");
    const report = runConformance(pack as never);
    expect(report.passed, JSON.stringify(report.results, null, 2)).toBe(true);
  });

  it("classifies every tool MUTATING and defaults to REFUSE", async () => {
    const mod = (await import(path.join(PACK_DIR, "src", "index.ts"))) as Record<
      string,
      unknown
    >;
    const pack = mod.DiscoverFixturePack as {
      intents: readonly string[];
      basisCodes: readonly string[];
      policy: { default: string };
    };
    expect(pack.policy.default).toBe("REFUSE");
    // One intent per discovered tool (3 tools, all distinct after sanitize).
    expect(pack.intents).toHaveLength(MOCK_TOOLS.length);
    // basisCodes must be non-empty (assertPackConformance throws otherwise).
    expect(pack.basisCodes.length).toBeGreaterThan(0);
    // The underscore tool was sanitized — no ambiguous bare a_b kind.
    expect(pack.intents).toContain("discover-fixture.create-order");
    expect(pack.intents).toContain("discover-fixture.cancel-order");
    expect(pack.intents).toContain("discover-fixture.list-items");
  });

  it("emits exactly one REFUSE scenario per discovered tool", async () => {
    const scenariosDir = path.join(PACK_DIR, "scenarios");
    const files = (await fs.readdir(scenariosDir)).filter((f) =>
      f.endsWith(".json"),
    );
    expect(files).toHaveLength(MOCK_TOOLS.length);
    for (const file of files) {
      const raw = await fs.readFile(path.join(scenariosDir, file), "utf8");
      const scenario = JSON.parse(raw) as {
        intent: { kind: string; taint: string };
        expected: { kind: string };
      };
      expect(scenario.expected.kind).toBe("REFUSE");
      expect(scenario.intent.taint).toBe("UNTRUSTED");
      expect(scenario.intent.kind).toMatch(/^discover-fixture\./);
    }
  });
});
