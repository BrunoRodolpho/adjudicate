# pack-payments-pix — 4-stage shadow → enforce rollout runbook

> The sane way to put `@adjudicate/pack-payments-pix` in front of an existing PIX flow without breaking it.

## Why a staged rollout

The Pack's policies are not the same as your current PIX code's behavior — even when your current code is correct, edge cases land differently:

- A pending charge that you currently ignore may now `REFUSE` with `pix.charge.not_confirmed`.
- A refund larger than the original (current code probably errors at the provider) now `REWRITE`s to original (silent capping).
- Webhooks delivered twice (current code may double-process) are now suppressed at the kernel via the ledger.

Rolling out enforced-from-day-one risks production incidents. **Shadow first, enforce later** — record what the kernel *would* have decided alongside your real flow, compare, then flip the switch when divergence is zero (or explained).

The staging is per-intent, gated by two env vars read once at context creation:

- `IBX_KERNEL_SHADOW` — comma-separated intent kinds (or `*`) that run `adjudicate()` alongside legacy; legacy stays authoritative.
- `IBX_KERNEL_ENFORCE` — comma-separated intent kinds (or `*`) where `adjudicate()` is authoritative.

The env vars are snapshotted into `RuntimeContext.enforceConfig` at context creation (see [`@adjudicate/core/kernel/runtime-context.ts`](../../core/src/kernel/runtime-context.ts)); the kernel never reads live `process.env` inside `adjudicate()`. Call `validateEnforceConfig(knownIntents)` once at boot — a typo'd intent kind silently leaves that intent on the legacy path, and the validator surfaces it as a warning + `enforce_config_typo` sink failure ([`enforce-config.ts`](../../core/src/kernel/enforce-config.ts)).

---

## Stage 1 — Shadow read-only intents (no production risk)

**Scope:** No real intents shadowed yet. This stage is plumbing — wire the Pack into your codebase, run its tests against your fixtures, prove the kernel doesn't crash on your data shape.

**Acceptance to advance:**

- Pack imports cleanly into your codebase. `pnpm build` green.
- Six-outcomes tests pass against fixtures derived from your production data (anonymized).
- A no-op call to `adjudicate(envelope, state, paymentsPixPack.policy)` for an arbitrary intent returns a Decision of *some* kind (not throwing).

**Duration:** As long as you need. No real traffic yet.

---

## Stage 2 — Shadow on the easy intents (`refund` happy path)

**Scope:** Your existing PIX refund handler now also calls `adjudicate()` *in parallel*, recording the Decision but acting on its own result. Don't shadow `create` yet — it always DEFERs and would noise the metrics.

**Setup:**

```ts
const decision = adjudicate(envelope, state, paymentsPixPack.policy);

// Existing code path (still authoritative):
const result = await myExistingRefundHandler(payload);

// Record divergence for analysis. classifyDivergence() is adopter-supplied —
// map your legacy result + the kernel Decision to a DivergenceClass.
metricsSink.recordShadowDivergence({
  intentKind: "pix.charge.refund",
  legacy: { kind: result.success ? "EXECUTE" : "REFUSE" },
  adjudicate: decision,
  divergence: classifyDivergence(decision, result),
});
```

`recordShadowDivergence` is a `MetricsSink` method ([`metrics.ts:43`](../../core/src/kernel/metrics.ts)). Its `divergence` field is a `DivergenceClass`, one of:

- `BASIS_ONLY` — same outcome, different basis codes. Usually safe (the kernel emits richer basis than legacy code did).
- `DECISION_KIND` — different outcome (e.g., your code says EXECUTE, kernel says REFUSE). Investigate every one.
- `PAYLOAD_REWRITE` — kernel REWRITEs but your code didn't. Cross-check the clamp behavior.

**Acceptance to advance:**

- 7-day window with zero `DECISION_KIND` and zero `PAYLOAD_REWRITE` events.
- Any `BASIS_ONLY` divergences explained in a brief note.

**Duration:** ≥ 7 days of production traffic.

---

## Stage 3 — Enforce `refund`, shadow `confirm`

**Scope:** Flip refund to authoritative — the kernel's Decision is now the action your code takes for refunds. Webhook intent (`pix.charge.confirm`) joins the shadow.

**Why webhook last:** webhooks are TRUSTED, low volume, and high impact. Shadowing them surfaces taint-policy mismatches before they're a problem.

**Setup:**

```bash
export IBX_KERNEL_ENFORCE="pix.charge.refund"
export IBX_KERNEL_SHADOW="pix.charge.confirm"
```

```ts
if (ctx.enforceConfig.isEnforced("pix.charge.refund")) {
  const decision = adjudicate(envelope, state, paymentsPixPack.policy);
  // act on decision authoritatively
} else {
  // legacy refund path
}
```

`ctx` is the `RuntimeContext`; `enforceConfig.isEnforced(intentKind)` reads the snapshot captured at context creation. (The old module-level `isEnforced()` / `isShadowed()` wrappers were removed — they re-read live `process.env`, violating the deterministic-core invariant.)

**Acceptance to advance:**

- Refund flow has been kernel-authoritative for ≥ 7 days.
- Customer-support escalations stay at baseline (no new "I tried to refund and it said X" tickets).
- Confirm shadow shows zero divergence on legitimate webhooks; any UNTRUSTED-attempted confirms (which the kernel REFUSEs at the taint gate) are tagged + alerted on, but not investigated as kernel bugs.

**Duration:** ≥ 7 days post-enforce.

---

## Stage 4 — Enforce `create` and `confirm` (full lifecycle)

**Scope:** Full lifecycle now kernel-authoritative. `create` triggers DEFER + parking; webhook arrives, intent resumes, EXECUTE applies.

**Setup:**

```bash
export IBX_KERNEL_ENFORCE="pix.charge.create,pix.charge.confirm,pix.charge.refund"
export IBX_KERNEL_SHADOW=""
```

Wire the runtime's resume path. On `charge.create` returning DEFER, the responder parks the envelope blob in Redis at `rk("defer:pending:${sessionId}")`. In your webhook handler, call [`resumeDeferredIntent`](../../runtime/src/defer-resume.ts), which reads that blob back itself — it takes a single `ResumeDeferredIntentArgs` object, not a parked envelope:

```ts
// In your webhook handler (parkDeferredIntent ran on the earlier DEFER):
const result = await resumeDeferredIntent({
  sessionId,
  signal: decision.signal,
  redis,           // a DeferRedis adapter (get / set NX / del; optional incr/decr/expire)
  rk: keyBuilder,  // (raw) => namespaced key
  // verifyHash defaults to "strict": a parked blob lacking the hash-verification
  // fields fails closed (park_blob_unverifiable). Opt into "warn" for v0.1 blobs.
});
if (result.resumed) {
  // synthesize a TRUSTED pix.charge.confirm intent and re-adjudicate
}
```

Idempotency is by construction: `resumeDeferredIntent` writes a `defer:resumed:${hash}` ledger key via SET NX, so duplicate webhook deliveries return `duplicate_resume_suppressed` instead of re-applying.

**Acceptance:**

- 14 days of fully-enforced traffic with no incidents.
- Audit ledger shows expected hit rate (duplicate webhook deliveries suppressed at the kernel, not the handler).
- Refund REWRITE clamps logged in the audit trail; spot-check a few to confirm the clamp matches business intent.

**Duration:** Indefinitely. The Pack is now your source of truth for PIX policy.

---

## Rollback

At any stage, set both env vars to empty and create a fresh `RuntimeContext` (the snapshot is captured at context creation):

```bash
export IBX_KERNEL_ENFORCE=""
export IBX_KERNEL_SHADOW=""
```

The kernel becomes a no-op for these intents; your legacy code path resumes. Audit records from before rollback remain queryable.

For an incident-time global revoke that does not require touching the enforce list, use the kill switch (`setKillSwitch(true, "reason")` or `IBX_KILL_SWITCH=1`): `adjudicate()` short-circuits every intent to a SECURITY refusal `kill_switch_active`.

---

## What this runbook does NOT cover

- **Provider-specific webhook signature verification.** That's pre-adjudicate — the webhook handler verifies signatures, then synthesizes a TRUSTED intent. The kernel trusts the taint label, not the wire bytes.
- **In-flight charge migration.** If you have pending charges at the moment of cutover, decide separately whether to drain (run the legacy handler until they all confirm/expire) or migrate (re-park them in the new system).
- **Cross-region / multi-tenant scope.** The env-var gate is process-local. Sharded enforcement (e.g., enforce in region-1 only) requires per-shard config, which is your platform's concern.

---

## Compatibility note

The Pack ships at `0.2.1`. Threshold guards (`ESCALATE_REFUND_THRESHOLD_CENTAVOS`, `CONFIRM_REFUND_THRESHOLD_CENTAVOS`) are exported constants — adopters who need different values today should compose their own PolicyBundle wrapping these guards. A configurable thresholds API is an open question for `PackV1` (see ADR-001).
