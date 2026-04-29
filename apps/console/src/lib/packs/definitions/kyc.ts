import { installPack } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";
import type {
  KycSession,
  KycSessionStatus,
} from "@adjudicate/pack-identity-kyc";
import type { ConsolePackAdapter } from "../adapter";

/**
 * Console adapter for `@adjudicate/pack-identity-kyc`.
 *
 * KYC is asynchronous: each user-initiated intent DEFERs until an
 * external signal arrives (document upload, vendor webhook). The
 * Pack's guards inspect the *payload* rather than the state — the
 * state shape `{ sessions: Map<id, KycSession> }` is required by the
 * planner and by future state-checking guards, but the current Phase
 * 3b policy doesn't read it on the synchronous path.
 *
 * Synthesis strategy: build a single session keyed by the payload's
 * `sessionId`, with `status` chosen to be valid for the intent at
 * hand. This ensures `adjudicate()` runs to completion and produces
 * the expected outcome:
 *
 *   kyc.start            → status: INIT             → DEFER
 *   kyc.document.upload  → status: DOCS_REQUIRED    → DEFER
 *   kyc.vendor.callback  → status: VENDOR_PENDING   → EXECUTE | REFUSE | ESCALATE
 *
 * Records lacking a `sessionId` (malformed/legacy) yield an empty
 * sessions map; replay still runs but produces whatever default the
 * policy emits.
 */

const { pack } = installPack(IdentityKycPack);

interface KycPayloadShape {
  sessionId?: string;
  userId?: string;
}

const SYNTHETIC_STATUS_FOR_INTENT: Record<string, KycSessionStatus> = {
  "kyc.start": "INIT",
  "kyc.document.upload": "DOCS_REQUIRED",
  "kyc.vendor.callback": "VENDOR_PENDING",
};

export const kycAdapter: ConsolePackAdapter = {
  pack,
  displayName: "Identity KYC",
  async getSyntheticState(record: AuditRecord) {
    const payload = (record.envelope.payload ?? {}) as KycPayloadShape;
    const sessions = new Map<string, KycSession>();

    if (typeof payload.sessionId === "string") {
      const status =
        SYNTHETIC_STATUS_FOR_INTENT[record.envelope.kind] ?? "INIT";
      sessions.set(payload.sessionId, {
        id: payload.sessionId,
        userId: payload.userId ?? "user_replay_synthetic",
        status,
        documents: [],
        createdAt: record.envelope.createdAt,
      });
    }

    return { sessions };
  },
};
