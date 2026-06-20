// @adjudicate/runtime — runtime-side framework helpers.
//
// Two concerns live here:
//
//  1. Deferred intent resume (defer-resume.ts) — when the kernel returns
//     DEFER for a valid-but-pending intent, this package handles the
//     resume half with content-addressed dedup so duplicate webhook
//     deliveries fold into a single resume.
//
//  2. Deadline helpers (with-deadlines.ts) — small primitives for racing
//     async generators against a hard wall-clock deadline; useful for
//     orchestrators that wrap LLM streams.

export {
  deferResumeHash,
  resumeDeferredIntent,
  verifyParkedEnvelopeHash,
  DEFAULT_MAX_RESUME_CYCLES,
  DEFER_PENDING_TTL_GRACE_SECONDS,
  type DeferRedis,
  type DeferLogger,
  type DeferResumeResult,
  type ParkVerificationResult,
  type ParkedEnvelope,
  type ResumeDeferredIntentArgs,
} from "./defer-resume.js"

export {
  DEFAULT_DEFER_QUOTA_PER_SESSION,
  decrementDeferCounter,
  deferCounterKey,
  deferParkKey,
  parkDeferredIntent,
  type CounterRedis,
  type ParkDeferredIntentArgs,
  type ParkDeferredIntentResult,
  type ParkLogger,
  type ParkRedis,
} from "./defer-park.js"

export { DEADLINE_HIT, deadlinePromise } from "./with-deadlines.js"

// 023 — re-export the resource-binding verifier so the parked-envelope hash
// verifier (`verifyParkedEnvelopeHash`, above) and the executor-seam resource
// binding share ONE importable surface and the SAME pre-image: both re-derive
// `sha256Canonical({version,kind,payload,nonce,actor,taint,origin,resourceRefs})`
// and compare constant-time via `timingSafeHexEqual` (023 §3/T4). `resourceRefs`
// is canonical-drop-safe (031): omitting it on a no-refs blob is byte-identical,
// but it MUST be re-derived so a resource-BOUND resume matches `deriveIntentHash`
// — see the H2 fix in defer-resume.ts (`verifyResourceBinding` calls
// `deriveIntentHash`, which includes `resourceRefs`).
export {
  DEFAULT_RESOURCE_BINDING_POLICY,
  verifyResourceBinding,
} from "@adjudicate/core"
export type {
  ResourceBindingPolicy,
  ResourceBindingResult,
} from "@adjudicate/core"
