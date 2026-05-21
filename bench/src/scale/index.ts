/**
 * Public entry points for the v1.0-RC production simulation harnesses.
 *
 * The harnesses are CLI-driven (`tsx src/scale/run.ts`) for full
 * artifacts, but the runners are also importable from tests so a small
 * variant runs in CI and pins the framework's behavior against
 * regression.
 */

export {
  runAuditEventBusScale,
  type AuditEventBusScaleConfig,
} from "./audit-event-bus-scale.js";
export {
  runKillSwitchScale,
  type KillSwitchScaleConfig,
} from "./kill-switch-scale.js";
export type { BenchArtifact, InvariantResult } from "./types.js";
export {
  createFakePubSub,
  createFakeRedis,
  createRng,
  type FakePubSub,
} from "./fake-transport.js";
