import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runDev, COMPOSE_FILENAME } from "../src/commands/dev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, ".test-dev-fixtures");

beforeAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
});

describe("dev — compose generation", () => {
  it("writes docker-compose.dev.yml on first run", async () => {
    const cwd = path.join(FIXTURES_DIR, "first-run");
    await fs.mkdir(cwd, { recursive: true });

    const lines: string[] = [];
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];

    await runDev({
      cwd,
      stdout: (l) => lines.push(l),
      dockerCheck: () => true,
      spawn: (cmd, args) => {
        spawnCalls.push({ cmd, args });
        return { status: 0 };
      },
    });

    const composePath = path.join(cwd, COMPOSE_FILENAME);
    const composeText = await fs.readFile(composePath, "utf8");
    expect(composeText).toMatch(/redis:7-alpine/);
    expect(composeText).toMatch(/postgres:16-alpine/);
    expect(composeText).toMatch(/POSTGRES_DB: adjudicate/);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.args).toContain("up");
    expect(spawnCalls[0]!.args).toContain("-d");
  });

  it("does not overwrite an existing compose file", async () => {
    const cwd = path.join(FIXTURES_DIR, "no-overwrite");
    await fs.mkdir(cwd, { recursive: true });
    const existing = "# user custom compose\n";
    await fs.writeFile(path.join(cwd, COMPOSE_FILENAME), existing);

    await runDev({
      cwd,
      stdout: () => {
        // ignore
      },
      dockerCheck: () => true,
      spawn: () => ({ status: 0 }),
    });

    const after = await fs.readFile(path.join(cwd, COMPOSE_FILENAME), "utf8");
    expect(after).toBe(existing);
  });

  it("--stop runs `docker compose down`", async () => {
    const cwd = path.join(FIXTURES_DIR, "stop");
    await fs.mkdir(cwd, { recursive: true });

    const spawnCalls: string[][] = [];
    await runDev({
      cwd,
      stop: true,
      stdout: () => {
        // ignore
      },
      dockerCheck: () => true,
      spawn: (_cmd, args) => {
        spawnCalls.push(args);
        return { status: 0 };
      },
    });
    expect(spawnCalls[0]).toContain("down");
  });

  it("exits 1 with a friendly message when docker is missing", async () => {
    const cwd = path.join(FIXTURES_DIR, "no-docker");
    await fs.mkdir(cwd, { recursive: true });

    const lines: string[] = [];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runDev({
          cwd,
          stdout: (l) => lines.push(l),
          dockerCheck: () => false,
          spawn: () => ({ status: 0 }),
        }),
      ).rejects.toThrow(/process.exit:1/);
      const stripped = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
      expect(stripped).toMatch(/docker.*not found/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
