import type { AuditStore } from "../store/index.js";
import type {
  CommandRiskBucket,
  CommandRiskCategory,
  CommandRiskDisposition,
  CommandRiskEvent,
  CommandRiskEventsQuery,
  CommandRiskEventsResult,
  CommandRiskQuery,
  CommandRiskResult,
} from "../schemas/command-risk.js";

/**
 * Framework-agnostic command-risk stats handler (ADR-134, follows ADR-123).
 *
 * Iterates audit records in the window and buckets command-risk dispositions by
 * `(category × disposition)`. The guard (`createCommandRiskGuard`,
 * primitives/guards.ts) emits the disposition over TWO channels:
 *
 *   - `validation.command_blocked`        → disposition "refuse"   (REFUSE)
 *   - `validation.command_flag_stripped`  → disposition "rewrite"  (REWRITE)
 *   - `validation.command_sanitized`      → disposition "rewrite"  (fwd-compat)
 *   - `business.rule_satisfied` with
 *       `detail.rule === "command_risk_confirm"`
 *                                         → disposition "confirm"  (CONFIRM)
 *
 * The `category` rides in `DecisionBasis.detail.category` (a closed kernel enum).
 *
 * SECURITY — REDACTION BY CONSTRUCTION: the same `detail` ALSO carries the raw
 * command string (`detail.command`) which routinely embeds live secrets. This
 * handler reads ONLY the closed-enum `category` discriminator and NEVER reads or
 * returns `detail.command` (nor `sanitized`/`stripped`/`matchedRuleIds`). The
 * result schema has no field that could carry command text, so even a buggy
 * handler cannot serialize it past the `.output()` Zod gate.
 *
 * Default strategy paginates `store.query` up to `fallbackQueryLimit`
 * (AuditStore caps at 500); production adopters needing wider windows wire a
 * native aggregator.
 */
export interface CreateCommandRiskStatsHandlerDeps {
  readonly store: AuditStore;
  readonly fallbackQueryLimit?: number;
  readonly clock?: () => string;
}

const CATEGORIES = new Set<CommandRiskCategory>(["destructive", "credential", "network"]);

/**
 * Map a single `DecisionBasis` to a command-risk disposition, or `null` if the
 * basis is not a command-risk basis. Reads ONLY the closed-enum discriminators
 * (`category`, `code`, `detail.rule`) — never the raw command.
 */
function dispositionForBasis(b: {
  readonly category: string;
  readonly code: string;
  readonly detail?: Record<string, unknown>;
}): CommandRiskDisposition | null {
  if (b.category === "validation") {
    if (b.code === "command_blocked") return "refuse";
    if (b.code === "command_flag_stripped" || b.code === "command_sanitized") {
      return "rewrite";
    }
    return null;
  }
  if (b.category === "business" && b.code === "rule_satisfied") {
    return b.detail?.rule === "command_risk_confirm" ? "confirm" : null;
  }
  return null;
}

/**
 * Derive the closed-enum category from `detail.category`, validating against the
 * closed `CommandRiskCategory` set. Unknown/poisoned values (e.g. an injected
 * `"<script>"`) are dropped (returns `null`) so a malicious record is counted as
 * nothing rather than corrupting a bucket.
 */
function categoryForBasis(b: {
  readonly detail?: Record<string, unknown>;
}): CommandRiskCategory | null {
  const raw = b.detail?.category;
  return typeof raw === "string" && CATEGORIES.has(raw as CommandRiskCategory)
    ? (raw as CommandRiskCategory)
    : null;
}

const CATEGORY_RANK: Record<CommandRiskCategory, number> = {
  destructive: 2,
  credential: 1,
  network: 0,
};
const DISPOSITION_RANK: Record<CommandRiskDisposition, number> = {
  refuse: 0,
  rewrite: 1,
  confirm: 2,
};

export function createCommandRiskStatsHandler(
  deps: CreateCommandRiskStatsHandlerDeps,
): (input: CommandRiskQuery) => Promise<CommandRiskResult> {
  const limit = deps.fallbackQueryLimit ?? 500;
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async (input) => {
    const until = input.until ?? clock();
    const { records } = await deps.store.query({
      since: input.since,
      until,
      limit,
    });
    // Keyed by `${category}|${disposition}` for stable aggregation.
    const counts = new Map<string, number>();
    for (const record of records) {
      if (record.at < input.since) continue;
      if (record.at > until) continue;
      for (const b of record.decision_basis) {
        const disposition = dispositionForBasis(b);
        if (disposition === null) continue;
        const category = categoryForBasis(b);
        if (category === null) continue;
        const key = `${category}|${disposition}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const buckets: CommandRiskBucket[] = Array.from(counts.entries())
      .map(([key, count]) => {
        const [category, disposition] = key.split("|") as [
          CommandRiskCategory,
          CommandRiskDisposition,
        ];
        return { category, disposition, count };
      })
      // Deterministic order: category rank desc (destructive > credential >
      // network) then disposition rank asc — byte-identical across runs.
      .sort((a, b) =>
        a.category === b.category
          ? DISPOSITION_RANK[a.disposition] - DISPOSITION_RANK[b.disposition]
          : CATEGORY_RANK[b.category] - CATEGORY_RANK[a.category],
      );
    return { buckets };
  };
}

/**
 * Framework-agnostic command-risk EVENT handler (ADR-134).
 *
 * Where `createCommandRiskStatsHandler` returns aggregate counts, this returns
 * the individual disposition events for an operator drill-down: one row per
 * `(record × command-risk basis)` occurrence, newest-first, carrying ONLY
 * non-sensitive metadata (`intentHash`, `at`, `intentKind`, `decisionKind`,
 * `category`, `disposition`).
 *
 * SECURITY: the raw command, the sanitized command, the stripped flags, and the
 * matched rule ids are NEVER surfaced — the command text is tainted (untrusted,
 * may contain secrets) and the event schema has no field that could carry it.
 *
 * Supports optional `category` / `disposition` filters and caps results at
 * `limit` (default 200, hard max 500), reporting `truncated` when the window
 * held more matches than were returned.
 */
export interface CreateCommandRiskEventsHandlerDeps {
  readonly store: AuditStore;
  readonly fallbackQueryLimit?: number;
  readonly clock?: () => string;
}

const DEFAULT_LIMIT = 200;
const HARD_MAX = 500;

export function createCommandRiskEventsHandler(
  deps: CreateCommandRiskEventsHandlerDeps,
): (input: CommandRiskEventsQuery) => Promise<CommandRiskEventsResult> {
  const queryLimit = deps.fallbackQueryLimit ?? HARD_MAX;
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async (input) => {
    const until = input.until ?? clock();
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_MAX);
    const { records } = await deps.store.query({
      since: input.since,
      until,
      limit: queryLimit,
    });
    const matches: CommandRiskEvent[] = [];
    for (const record of records) {
      if (record.at < input.since) continue;
      if (record.at > until) continue;
      for (const b of record.decision_basis) {
        const disposition = dispositionForBasis(b);
        if (disposition === null) continue;
        const category = categoryForBasis(b);
        if (category === null) continue;
        if (input.disposition && disposition !== input.disposition) continue;
        if (input.category && category !== input.category) continue;
        matches.push({
          intentHash: record.intentHash,
          at: record.at,
          intentKind: record.envelope.kind,
          decisionKind: record.decision.kind,
          category,
          disposition,
        });
      }
    }
    // Newest-first; the AuditStore does not guarantee ordering across pages.
    matches.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const events = matches.slice(0, limit);
    return { events, truncated: matches.length > events.length };
  };
}
