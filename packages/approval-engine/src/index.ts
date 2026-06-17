/**
 * @adjudicate/approval-engine — reference orchestration for the
 * REQUEST_CONFIRMATION → human review → resume flow.
 *
 * The engine is pure I/O coordination ABOVE adapter-core: it owns a display
 * projection registry (separate from the single-use ConfirmationStore), fans
 * requests out to pluggable channels, and on resolve calls `agent.confirm()` —
 * which owns ALL the crypto (single-use token, timing-safe hash verify,
 * confirmationReceipt). The engine emits no Decisions and adds no Guards; state
 * is fetched fresh at resolve time, so nothing here touches intentHash.
 */
export {
  createInMemoryApprovalRegistry,
  type ApprovalRegistry,
  type ApprovalRequest,
  type ApprovalStatus,
} from "./registry.js";

export {
  createRedisApprovalRegistry,
  type ApprovalRedisClient,
  type CreateRedisApprovalRegistryOptions,
} from "./registry-redis.js";

export {
  createConsoleLogChannel,
  createEmailChannel,
  createSlackChannel,
  createTeamsChannel,
  createWebhookChannel,
  type ApprovalChannel,
  type ApprovalChannelContext,
} from "./channel.js";

export {
  createApprovalEngine,
  type ApprovalEngine,
  type ApprovalEngineOptions,
} from "./engine.js";

export {
  createEd25519AttestationVerifier,
  isEscalationDue,
  quorumMet,
  type Attestation,
  type AttestationVerifier,
  type QuorumPolicy,
} from "./governance.js";

export { ApprovalError, type ApprovalErrorCode } from "./errors.js";
