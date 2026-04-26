# pack-payments-pix — 4-stage shadow → enforce rollout runbook

> The sane way to put `@adjudicate/pack-payments-pix` in front of an existing PIX flow without breaking it.

## Why a staged rollout

The Pack's policies are not the same as your current PIX code's behavior — even when your current code is correct, edge cases land differently:

- A pending charge that you currently ignore may now `REFUSE` with `pix.charge.not_confirmed`.
- A refund larger than the original (current code probably errors at the provider) now `REWRITE`s to original (silent capping).
- Webhooks delivered twice (current code may double-process) are now suppressed at the kernel via the ledger.

Rolling out enforced-from-day-one risks production incidents. **Shadow first, enforce later** — record what the kernel *would* have decided alongside your real flow, compare, then flip the switch when divergence is zero (or explained).

The staging is per-intent, gated by environment variables (`*_KERNEL_SHADOW`, `*_KERNEL_ENFORCE`) — the kernel reads them at call time. Same flag pattern IbateXas uses; see [`@adjudicate/core/kernel/enforce-config.ts`](../../core/src/kernel/enforce-config.ts).

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

// Record divergence for analysis:
metricsSink.recordShadowDivergence({
  intentKind: "pix.charge.refund",
  legacy: { kind: result.success ? "EXECUTE" : "REFUSE" },
  adjudicate: decision,
  divergence: classifyDivergence(decision, result),
});
```

**What to watch:**

- `divergence === "BASIS_ONLY"` — same outcome, different basis codes. Usually safe.
- `divergence === "KIND_DIFFER"` — different outcome (e.g., your code says EXECUTE, kernel says REFUSE). Investigate every one.
- `divergence === "REWRITE_DIFFER"` — kernel REWRITEs but your code didn't. Cross-check the clamp behavior.

**Acceptance to advance:**

- 7-day window with zero `KIND_DIFFER` and zero `REWRITE_DIFFER` events.
- Any `BASIS_ONLY` divergences explained in a brief note (usually the kernel emits richer basis than legacy code did).

**Duration:** ≥ 7 days of production traffic.

---

## Stage 3 — Enforce `refund`, shadow `confirm`

**Scope:** Flip refund to authoritative — the kernel's Decision is now the action your code takes for refunds. Webhook intent (`pix.charge.confirm`) joins the shadow.

**Why webhook last:** webhooks are TRUSTED, low volume, and high impact. Shadowing them surfaces taint-policy mismatches before they're a problem.

**Setup:**

```bash
export PIX_KERNEL_ENFORCE="pix.charge.refund"
export PIX_KERNEL_SHADOW="pix.charge.confirm"
```

```ts
if (isEnforced("pix.charge.refund")) {
  const decision = adjudicate(envelope, state, paymentsPixPack.policy);
  // act on decision authoritatively
} else {
  // legacy refund path
}
```

**Acceptance to advance:**

- Refund flow has been kernel-authoritative for ≥ 7 days.
- Customer-support escalations stay at baseline (no new "I tried to refund and it said X" tickets).
- Confirm shadow shows zero divergence on legitimate webhooks; any UNTRUSTED-attempted confirms (which the kernel REFUSEs at the taint gate) are tagged + alerted on, but not investigated as kernel bugs.

**Duration:** ≥ 7 days post-enforce.

---

## Stage 4 — Enforce `create` and `confirm` (full lifecycle)

**Scope:** Full lifecycle now kernel-authoritative. `create` triggers DEFER + parking via `@adjudicate/runtime`'s `resumeDeferredIntent`; webhook arrives, intent resumes, EXECUTE applies.

**Setup:**

```bash
export PIX_KERNEL_ENFORCE="pix.charge.create,pix.charge.confirm,pix.charge.refund"
export PIX_KERNEL_SHADOW=""
```

You'll also need to wire the runtime's resume path. See `@adjudicate/runtime`'s [`resumeDeferredIntent`](../../runtime/src/defer-resume.ts) — it expects a Redis adapter for the parked-envelope store.

```ts
// On charge.create returning DEFER:
await park(envelope.intentHash, decision.signal, envelope);

// In your webhook handler:
const result = await resumeDeferredIntent(parkedEnvelope, decision.signal, redis, keyBuilder);
if (result.resumed) {
  // synthesize a TRUSTED pix.charge.confirm intent and re-adjudicate
}
```

**Acceptance:**

- 14 days of fully-enforced traffic with no incidents.
- Audit ledger shows expected hit rate (duplicate webhook deliveries suppressed at the kernel, not the handler).
- Refund REWRITE clamps logged in the audit trail; spot-check a few to confirm the clamp matches business intent.

**Duration:** Indefinitely. The Pack is now your source of truth for PIX policy.

---

## Rollback

At any stage, set both env vars to empty:

```bash
export PIX_KERNEL_ENFORCE=""
export PIX_KERNEL_SHADOW=""
```

The kernel becomes a no-op for these intents; your legacy code path resumes. Audit records from before rollback remain queryable.

---

## What this runbook does NOT cover

- **Provider-specific webhook signature verification.** That's pre-adjudicate — the webhook handler verifies signatures, then synthesizes a TRUSTED intent. The kernel trusts the taint label, not the wire bytes.
- **In-flight charge migration.** If you have pending charges at the moment of cutover, decide separately whether to drain (run the legacy handler until they all confirm/expire) or migrate (re-park them in the new system).
- **Cross-region / multi-tenant scope.** The env-var gate is process-local. Sharded enforcement (e.g., enforce in region-1 only) requires per-shard config, which is your platform's concern.

---

## Compatibility note

The Pack ships at `0.1.0-experimental`. Threshold guards (`ESCALATE_REFUND_THRESHOLD_CENTAVOS`, `CONFIRM_REFUND_THRESHOLD_CENTAVOS`) are exported constants — adopters who need different values today should compose their own PolicyBundle wrapping these guards. A configurable thresholds API is an open question for `PackV1` (see ADR-001).
