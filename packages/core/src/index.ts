// @adjudicate/core — public surface.
//
// Top-level barrel exposing the headline interfaces. For finer-grained
// imports (and tree-shaking), use the subpaths:
//   import { adjudicate } from "@adjudicate/core/kernel";
//   import { type CapabilityPlanner } from "@adjudicate/core/llm";

export * from "./envelope.js";
export * from "./decision.js";
export * from "./basis-codes.js";
export * from "./refusal.js";
export * from "./refusal-messages.js";
// `./taint.js` exports both provenance axes: the `Taint` trust lattice and
// the 041 harness-stamped `Origin` source axis (plus `DEFAULT_ORIGIN`).
export * from "./taint.js";
export type { Origin } from "./taint.js";
export { DEFAULT_ORIGIN } from "./taint.js";
export * from "./side-effects.js";
export * from "./pack-output-contract.js";
export * from "./audit.js";
// 021 — capability schema + pure-JS canonical pre-image + constant-time
// hash-bind verify. The node-only ed25519 signer lives in
// @adjudicate/approval-engine (signCapability / verifyCapabilitySignature).
export {
  CAPABILITY_PREIMAGE_VERSION,
  bindCapability,
  capabilityPreimage,
  verifyCapability,
  type Capability,
  type CapabilitySignature,
  type UnsignedCapability,
} from "./capability.js";
export * from "./hash.js";
export * from "./timing-safe.js";
export * from "./ledger.js";
export * from "./sink.js";
export * from "./pack.js";
export * from "./explain.js";
export * from "./replay-classify.js";
export {
  KERNEL_REFUSAL_CODES,
  PackConformanceError,
  assertPackConformance,
  withBasisAudit,
  // 033 — record/read the injected authority snapshot on a pack (idempotent,
  // non-blocking; the audit shell records it onto the AuditRecord for replay).
  recordAuthoritySnapshotOnPack,
  readRecordedAuthoritySnapshot,
  type AssertPackConformanceOptions,
} from "./pack-conformance.js";
export {
  installPack,
  type InstallPackOptions,
  type InstalledPack,
} from "./install.js";
export * from "./kernel/index.js";
export * from "./llm/index.js";
