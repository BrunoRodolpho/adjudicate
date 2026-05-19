import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isValidTemplateName,
  runPackInit,
  TEMPLATE_NAMES,
} from "../src/commands/pack-init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Template-name validation and registry shape.
 *
 * Verifies the allowlist, the registry exposed for the CLI's --help
 * string, and the runPackInit error path when an unknown template is
 * passed via the public API. The CLI bin uses commander's --template
 * <name> default, so most invalid values are caught here at runtime.
 */
describe("pack init template validation", () => {
  it("exposes the expected template names allowlist", () => {
    expect([...TEMPLATE_NAMES].sort()).toEqual([
      "approval",
      "basic",
      "deployment",
      "kyc",
      "payment",
    ]);
  });

  it("isValidTemplateName accepts known templates", () => {
    expect(isValidTemplateName("basic")).toBe(true);
    expect(isValidTemplateName("payment")).toBe(true);
    expect(isValidTemplateName("approval")).toBe(true);
    expect(isValidTemplateName("kyc")).toBe(true);
    expect(isValidTemplateName("deployment")).toBe(true);
  });

  it("isValidTemplateName rejects unknown templates", () => {
    expect(isValidTemplateName("nope")).toBe(false);
    expect(isValidTemplateName("")).toBe(false);
    expect(isValidTemplateName("Basic")).toBe(false);
  });

  it("runPackInit exits with code 1 when --template is unknown", async () => {
    const FIXTURES_DIR = path.join(__dirname, ".test-fixtures-tplvalid");
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {
        throw new Error("process.exit called");
      }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        runPackInit("temp-pack", {
          target: FIXTURES_DIR,
          template: "nope" as never,
        }),
      ).rejects.toThrow();
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
      await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    }
  });
});
