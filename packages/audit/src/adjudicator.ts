/**
 * Shared `Adjudicator` contract for the replay-side of `@adjudicate/audit`.
 *
 * Both `replay()` and `replayWithIntegrity()` re-run stored audit records
 * through a caller-supplied closure that re-adjudicates each record. That
 * closure has the same shape for both entry points, so the type lives here
 * as the single source of truth; `replay.ts` and `replay-integrity.ts`
 * re-export it so existing import paths keep working.
 *
 * The adjudicator MUST be deterministic and side-effect-free — replay only
 * re-derives decisions, it never re-runs side effects.
 */

import type { AuditRecord, Decision } from "@adjudicate/core";

export type Adjudicator = (record: AuditRecord) => Decision;
