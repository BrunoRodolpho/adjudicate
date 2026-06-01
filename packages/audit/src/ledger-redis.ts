/**
 * Redis implementation of the Execution Ledger.
 *
 * Uses SET NX + TTL. First writer wins; subsequent writers are no-ops.
 * Reads deserialize JSON. Keys are namespaced via an adopter-supplied
 * key builder (e.g., the IbateXas adopter passes its own `rk()` helper).
 *
 * This is NOT a durable audit sink. Use AuditSink for that.
 */

import { recordSinkFailure } from "@adjudicate/core/kernel";

import type {
  Ledger,
  LedgerHit,
  LedgerRecordInput,
  LedgerRecordOutcome,
} from "./ledger.js";

/**
 * Minimal Redis-like interface. Works with redis@4+ and any client that
 * exposes these three methods. Adopters inject their own client.
 */
export interface RedisLedgerClient {
  /**
   * SET with NX + EX semantics. Returns "OK" or similar truthy when the write
   * happened, null-ish when a value already existed and NX rejected the write.
   */
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number },
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  /**
   * DEL key. Returns the number of keys removed (0 or 1). Used by the
   * ledger's `release` for best-effort cleanup of an orphaned claim
   * (ConcurrencyReviewer-002). Optional so clients wired before this
   * method existed still satisfy the interface; when absent, `release`
   * is a no-op and the kernel surfaces the orphan via telemetry instead.
   */
  del?(key: string): Promise<number>;
}

export interface CreateRedisLedgerOptions {
  readonly client: RedisLedgerClient;
  /**
   * Key builder — wraps a raw suffix into a namespaced key. Adopters supply
   * their own namespacing helper (e.g., the IbateXas adopter passes its
   * `rk()` from `@ibatexas/tools` to apply the `${APP_ENV}:` prefix; clinic
   * or salon adopters supply their own).
   */
  readonly keyFor: (suffix: string) => string;
  /** TTL in seconds. Defaults to 14 days per the IBX-IGE plan. */
  readonly ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60;

export function createRedisLedger(opts: CreateRedisLedgerOptions): Ledger {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const keyFor = (hash: string) => opts.keyFor(`ledger:intent:${hash}`);

  // ConcurrencyReviewer-002: only expose `release` when the injected client
  // can actually DEL. A client wired before `del` existed produces a ledger
  // with NO release method, so the kernel takes its `ledger_orphaned`
  // telemetry branch (honest signal) rather than a silent no-op.
  const del = opts.client.del?.bind(opts.client);
  const release = del
    ? // best-effort DEL of a claimed key; the kernel calls this only when the
      // post-EXECUTE audit emit threw after recordExecution acquired the key,
      // so the entry would otherwise orphan and suppress retries for the full
      // TTL. DEL is idempotent (0 or 1 removed); a throw propagates to the
      // kernel's best-effort catch, which routes it to recordSinkFailure.
      async (intentHash: string): Promise<void> => {
        await del(keyFor(intentHash));
      }
    : undefined;

  return {
    ...(release ? { release } : {}),
    async checkLedger(intentHash) {
      const raw = await opts.client.get(keyFor(intentHash));
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          typeof (parsed as LedgerHit).at !== "string"
        ) {
          return null;
        }
        return parsed as LedgerHit;
      } catch (err) {
        // ErrorReviewer-001: a JSON.parse throw means a corrupt/truncated
        // ledger row. Surface it via recordSinkFailure so operators see the
        // event; behavior is unchanged (still treated as a cache miss).
        recordSinkFailure({
          sink: "buffered",
          subject: `ledger:intent:${intentHash}`,
          errorClass: err instanceof Error ? err.name : "non_error",
          consecutiveFailures: 1,
        });
        return null;
      }
    },

    async recordExecution(
      entry: LedgerRecordInput,
    ): Promise<LedgerRecordOutcome> {
      const payload: LedgerHit = {
        resourceVersion: entry.resourceVersion,
        at: new Date().toISOString(),
        sessionId: entry.sessionId,
        kind: entry.kind,
      };
      // SET NX — first writer wins. Redis returns "OK" (or similar truthy)
      // when the write happened, null when NX rejected because the key
      // already had a value. The kernel's adjudicateAndAudit consults this
      // tag to flip a racing EXECUTE into REPLAY_SUPPRESSED.
      const written = await opts.client.set(
        keyFor(entry.intentHash),
        JSON.stringify(payload),
        { NX: true, EX: ttl },
      );
      return written === null ? "exists" : "acquired";
    },
  };
}
