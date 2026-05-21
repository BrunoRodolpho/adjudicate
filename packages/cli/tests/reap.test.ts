import { describe, expect, it, vi } from "vitest";
import {
  runReap,
  type ReapRedisClient,
} from "../src/commands/reap.js";

interface CaptureSession {
  readonly lines: string[];
  readonly write: (line: string) => void;
  readonly joined: () => string;
}

function capture(): CaptureSession {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => {
      lines.push(line);
    },
    joined: () => lines.join("\n"),
  };
}

/** Build a fake redis client that yields a scripted sequence of keys+ttls. */
function fakeClient(
  pairs: ReadonlyArray<readonly [string, number]>,
): ReapRedisClient {
  const ttlByKey = new Map(pairs);
  const keys = pairs.map(([k]) => k);
  let scanned = false;
  return {
    async scan() {
      if (scanned) return { cursor: "0", keys: [] };
      scanned = true;
      return { cursor: "0", keys };
    },
    async ttl(key) {
      return ttlByKey.get(key) ?? -2;
    },
    async disconnect() {
      // no-op
    },
  };
}

describe("reap — scan + tally", () => {
  it("reports active + expired counts in JSON format", async () => {
    const cap = capture();
    await runReap({
      url: "redis://fake:6379",
      format: "json",
      stdout: cap.write,
      clientFactory: async () =>
        fakeClient([
          ["defer:pending:a", 60],
          ["defer:pending:b", 0],
          ["defer:pending:c", 120],
        ]),
    });
    const report = JSON.parse(cap.joined()) as {
      url: string;
      scanned: number;
      active: number;
      expired: number;
      reaped: number;
      dryRun: boolean;
    };
    expect(report.url).toBe("redis://fake:6379");
    expect(report.scanned).toBe(3);
    expect(report.active).toBe(2);
    expect(report.expired).toBe(1);
    // Redis owns eviction — `reaped` is always 0 in v0.5
    expect(report.reaped).toBe(0);
    expect(report.dryRun).toBe(false);
  });

  it("dry-run flag is preserved in the output", async () => {
    const cap = capture();
    await runReap({
      url: "redis://fake:6379",
      dryRun: true,
      format: "json",
      stdout: cap.write,
      clientFactory: async () => fakeClient([]),
    });
    const report = JSON.parse(cap.joined()) as { dryRun: boolean };
    expect(report.dryRun).toBe(true);
  });

  it("text format mentions the URL and tally", async () => {
    const cap = capture();
    await runReap({
      url: "redis://fake:6379",
      format: "text",
      stdout: cap.write,
      clientFactory: async () =>
        fakeClient([["defer:pending:only", 30]]),
    });
    const text = cap.joined();
    expect(text).toMatch(/adjudicate reap/);
    expect(text).toMatch(/redis:\/\/fake:6379/);
    expect(text).toMatch(/scanned:\s+1/);
    expect(text).toMatch(/active:\s+1/);
  });

  it("exits non-zero with a helpful message when Redis is unreachable", async () => {
    const cap = capture();
    const errCap = capture();
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);

    try {
      await expect(
        runReap({
          url: "redis://nope:6379",
          format: "json",
          stdout: cap.write,
          stderr: errCap.write,
          clientFactory: async () => {
            throw new Error("ECONNREFUSED");
          },
        }),
      ).rejects.toThrow(/process.exit:1/);
      const err = errCap.joined();
      expect(err).toMatch(/Failed to connect/);
      expect(err).toMatch(/ECONNREFUSED/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
