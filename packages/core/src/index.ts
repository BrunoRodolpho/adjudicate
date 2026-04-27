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
export * from "./taint.js";
export * from "./audit.js";
export * from "./hash.js";
export * from "./ledger.js";
export * from "./sink.js";
export * from "./pack.js";
export {
  KERNEL_REFUSAL_CODES,
  PackConformanceError,
  assertPackConformance,
  withBasisAudit,
  type AssertPackConformanceOptions,
} from "./pack-conformance.js";
export {
  installPack,
  type InstallPackOptions,
  type InstalledPack,
} from "./install.js";
export * from "./kernel/index.js";
export * from "./llm/index.js";
