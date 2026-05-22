/**
 * `adjudicate reap` — Idle-DeferStore garbage-collection probe.
 *
 * Scans a Redis instance for keys matching `defer:pending:*` and
 * reports their TTL status. Redis itself owns the eviction lifecycle:
 * keys with an expired TTL are removed automatically by Redis's own
 * GC. This command is primarily a *verification* tool — operators run
 * it to confirm that the DeferStore is not accumulating stale rows
 * (e.g. due to mis-configured TTLs or a worker that crashed
 * mid-park).
 *
 * Output shape:
 *   {
 *     scanned: number,     // total keys matched
 *     active: number,      // keys with TTL > 0
 *     expired: number,     // keys whose TTL has reached 0 since scan
 *                          // (Redis evicts these eagerly; usually 0)
 *     reaped: number,      // keys this command actively removed
 *                          // (always 0 — Redis owns eviction)
 *   }
 *
 * `--dry-run` prints what *would* be reaped without acting. Since the
 * v0.5 implementation never calls `DEL`, `--dry-run` and the normal
 * run produce identical output; the flag is reserved for future
 * versions when proactive eviction is needed.
 *
 * If `redis` is not installed (the package is an optional dep on the
 * CLI), or the URL is unreachable, the command exits with a non-zero
 * code and a helpful message — it does NOT crash with an uncaught
 * exception.
 */

import chalk from "chalk";
import { errorMessage } from "../lib/error-message.js";

export interface ReapOptions {
  /** Redis connection URL. Defaults to `redis://localhost:6379`. */
  readonly url?: string;
  /** Print what would be reaped without modifying state. */
  readonly dryRun?: boolean;
  /** Output format. Defaults to `text`. */
  readonly format?: "text" | "json";
  /** Test injection. Defaults to `process.stdout.write`. */
  readonly stdout?: (line: string) => void;
  /** Test injection. Defaults to `process.stderr.write`. */
  readonly stderr?: (line: string) => void;
  /**
   * Test injection. Replaces the redis client constructor so unit tests
   * don't need a live Redis. The injected factory yields the same
   * minimal surface the production path uses (`connect`, `scan`, `ttl`,
   * `disconnect`).
   */
  readonly clientFactory?: (url: string) => Promise<ReapRedisClient>;
}

/**
 * Minimal Redis surface this command needs. Modeled after the
 * `redis@4.x` client so a fake implementation can satisfy it without
 * pulling in the full type surface.
 */
export interface ReapRedisClient {
  scan(
    cursor: string,
    options: { MATCH: string; COUNT: number },
  ): Promise<{ cursor: string; keys: string[] }>;
  ttl(key: string): Promise<number>;
  disconnect(): Promise<void>;
}

export interface ReapReport {
  readonly url: string;
  readonly scanned: number;
  readonly active: number;
  readonly expired: number;
  readonly reaped: number;
  readonly dryRun: boolean;
}

const KEY_PATTERN = "defer:pending:*";
const SCAN_COUNT = 100;

export async function runReap(options: ReapOptions): Promise<void> {
  const url = options.url ?? "redis://localhost:6379";
  const dryRun = options.dryRun ?? false;
  const format = options.format ?? "text";
  const out =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err =
    options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  let client: ReapRedisClient;
  try {
    client = options.clientFactory
      ? await options.clientFactory(url)
      : await defaultClientFactory(url);
  } catch (e) {
    err(
      chalk.red("✗") +
        ` Failed to connect to Redis at ${url}: ${errorMessage(e)}` +
        "\n  Hint: ensure Redis is running (`adjudicate dev` spins up a local instance)",
    );
    process.exit(1);
  }

  try {
    const report = await scanAndReport(client, url, dryRun);
    if (format === "json") {
      out(JSON.stringify(report, null, 2));
    } else {
      out(renderText(report));
    }
  } catch (e) {
    err(chalk.red("✗") + ` Reap scan failed: ${errorMessage(e)}`);
    process.exit(1);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // disconnect-time failures are not user-actionable
    }
  }
}

async function scanAndReport(
  client: ReapRedisClient,
  url: string,
  dryRun: boolean,
): Promise<ReapReport> {
  let cursor = "0";
  let scanned = 0;
  let active = 0;
  let expired = 0;
  do {
    const result = await client.scan(cursor, {
      MATCH: KEY_PATTERN,
      COUNT: SCAN_COUNT,
    });
    cursor = result.cursor;
    for (const key of result.keys) {
      scanned++;
      const ttl = await client.ttl(key);
      // ttl semantics: -2 = key missing, -1 = key exists with no TTL,
      // 0 = expired (rare — Redis evicts eagerly), >0 = seconds remaining.
      if (ttl > 0) active++;
      else if (ttl === 0) expired++;
      // -1 and -2 are treated as neither active nor expired
    }
  } while (cursor !== "0");

  return {
    url,
    scanned,
    active,
    expired,
    // Redis owns eviction in v0.5; this command never calls DEL.
    reaped: 0,
    dryRun,
  };
}

function renderText(report: ReapReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold("adjudicate reap"));
  lines.push("");
  lines.push(`  url:      ${chalk.cyan(report.url)}`);
  lines.push(`  pattern:  ${chalk.cyan(KEY_PATTERN)}`);
  lines.push(`  scanned:  ${chalk.bold(String(report.scanned))} key(s)`);
  lines.push(`  active:   ${chalk.green(String(report.active))} (TTL > 0)`);
  lines.push(`  expired:  ${chalk.yellow(String(report.expired))} (TTL == 0)`);
  lines.push(
    `  reaped:   ${chalk.dim(String(report.reaped))} (Redis owns eviction)`,
  );
  if (report.dryRun) {
    lines.push("");
    lines.push(chalk.dim("--dry-run: no state was modified."));
  }
  return lines.join("\n");
}

/**
 * Default factory: `import("redis")` and connect. Wrapped so tests can
 * substitute a fake without resolving the optional dep.
 */
async function defaultClientFactory(url: string): Promise<ReapRedisClient> {
  // dynamic import — keeps `redis` strictly optional. Adopters who
  // never run `adjudicate reap` never pay the install cost.
  const mod = (await import("redis")) as {
    createClient: (opts: { url: string }) => {
      connect(): Promise<unknown>;
      scan(
        cursor: number | string,
        options: { MATCH: string; COUNT: number },
      ): Promise<{ cursor: number | string; keys: string[] }>;
      ttl(key: string): Promise<number>;
      disconnect(): Promise<unknown>;
    };
  };
  const raw = mod.createClient({ url });
  await raw.connect();
  return {
    async scan(cursor, options) {
      // redis@4 cursors are numbers but the API tolerates strings.
      const result = await raw.scan(cursor, options);
      return {
        cursor: String(result.cursor),
        keys: result.keys,
      };
    },
    async ttl(key) {
      return raw.ttl(key);
    },
    async disconnect() {
      await raw.disconnect();
    },
  };
}
