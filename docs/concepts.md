# Concepts — adjudicate in plain English

> **New here? Start with this page before the package READMEs.**
>
> The per-package READMEs and ADRs are dense reference material. This page is the
> mental model behind them: what adjudicate *is*, what a rulebook *is*, and why
> the architecture is shaped the way it is. Once these click, the rest of the
> repo reads like reference docs instead of a wall of jargon.

---

## 1. What is adjudicate?

It's a **zero-trust runtime for LLM intent execution**. Two ideas in that phrase:

- **LLM intent execution** — your app uses an LLM to turn user input ("refund my last order", "book Friday off") into a structured action.
- **Zero-trust** — the LLM is treated as a *semantic parser*, not an authority. It can *propose* a mutation; it cannot *perform* one. Every proposed mutation crosses a deterministic kernel that decides what actually happens.

```
   user / webhook input
          │
          ▼
   ┌───────────────┐  proposes        ┌──────────────────┐
   │      LLM      │ ───────────────▶ │ adjudicate kernel│
   │ (zero authority)                 │ (decides)        │
   └───────────────┘                  └────────┬─────────┘
                                               │
                                               ▼
                                       real side-effect
                                       (DB write, payment, email, ...)
```

Function-calling and most agent frameworks ship `LLM → tool → DB` directly. adjudicate inserts a deterministic gate in the middle: **the LLM proposes; the kernel disposes.**

---

## 2. The security-guard analogy

Three roles. They keep coming back, so it's worth naming them up front:

| Role | What it is | Knows about your domain? |
|---|---|---|
| **Kernel** (`@adjudicate/core`) | A security guard at the door | No — it's generic |
| **Rulebook** (`PolicyBundle`) | The written rules the guard follows | Yes — entirely |
| **Your app** | The building that hires the guard | Yes — it owns side-effects |

The kernel is **domain-agnostic**. It knows nothing about PIX, vacations, or shopping carts. You hand it a rulebook plus the current state, and it decides what to do with each proposed action.

A **Pack** (e.g. [`@adjudicate/pack-payments-pix`](../packages/pack-payments-pix)) is just a *pre-written rulebook* you can install and plug in, instead of writing every guard yourself.

---

## 3. Six possible decisions

Function-calling has two outcomes: the call ran, or it threw. Real flows have more. The kernel returns one of six:

```
   ┌──────────────────────────────────────────────────────────────────┐
   │  EXECUTE              "yes, do it"                               │
   │  REFUSE               "no, don't do it" (with reason code)       │
   │  REQUEST_CONFIRMATION "ask the user first, then maybe do it"     │
   │  ESCALATE             "route to a supervisor / human"            │
   │  REWRITE              "do it, but with a sanitized payload"      │
   │  DEFER                "park it; resume when a signal arrives"    │
   └──────────────────────────────────────────────────────────────────┘
```

Two of these are the differentiators that justify the framework existing:

- **`DEFER`** — async flows are a first-class outcome. A PIX charge is created, the kernel parks it, the payment provider's webhook later resumes it. No bespoke per-tool retry logic.
- **`REWRITE`** — the kernel itself sanitizes the payload (clamp a refund to the original charge amount, clamp a cart quantity to the inventory cap) instead of refusing or asking the LLM to retry.

---

## 4. Anatomy of a rulebook

Every rulebook (`PolicyBundle<K, P, S>`) has the same five slots, regardless of domain:

```
   ┌─────────────────────────────────────────────────┐
   │  1. Intent kinds        — the "verbs"           │
   │  2. State shape         — what guards read      │
   │  3. Taint policy        — per-kind trust floor  │
   │  4. Guards              — state→auth→taint→biz  │
   │  5. Default outcome     — REFUSE or EXECUTE     │
   └─────────────────────────────────────────────────┘
```

The three TypeScript generics encode where the domain-specificity lives:

| Generic | Meaning |
|---|---|
| `K` | union of intent kinds (the verbs the domain knows) |
| `P` | payload shape per intent |
| `S` | state shape the guards read |

**Guards** are pure functions that look at the envelope + state and either return a `Decision` (short-circuiting the rest) or `null` (no opinion, keep going):

```ts
type Guard<K, P, S> = (
  envelope: IntentEnvelope<K, P>,
  state: S,
) => Decision | null;
```

**Execution order is fixed by the kernel** — adopters can't reorder it:

```
   envelope ─▶ stateGuards[] ─▶ authGuards[] ─▶ taint ─▶ business[] ─▶ default
                  │                  │             │           │            │
                  └─ first non-null Decision short-circuits the rest ──────┘
```

This is intentional. State checks before auth checks before trust checks before business rules. It means the same guard order applies in every Pack, and audit replays are deterministic.

---

## 5. Two rulebooks side-by-side

Concrete is better than abstract. Here's the same five slots filled in for the two reference examples:

| Slot | [`vacation-approval`](../examples/vacation-approval) | [`commerce-reference`](../examples/commerce-reference) |
|---|---|---|
| **Verbs (`K`)** | `vacation.request` / `approve` / `cancel` | `cart.add_item` / `cart.remove_item` / `order.checkout` / `order.confirm_payment` / `order.cancel` |
| **State (`S`)** | employee + role + PTO balance + request | customer + cart + order + catalog |
| **TRUSTED-only kind** | `vacation.approve` (manager UI) | `order.confirm_payment` (provider webhook) |
| **Constants** | `maxConsecutiveDays`, `cancelWindowHours` | `maxPerOrder` per SKU, defer-timeout, signal name |
| **REWRITE trigger** | duration > 14 days → clamp | qty > stock cap → clamp |
| **ESCALATE trigger** | manager self-approving | (in PIX pack: refund ≥ R$1k) |
| **DEFER trigger** | request awaits manager approval | order awaits payment webhook |

The *shapes* are identical. The **verbs, state, thresholds, and which-kind-is-TRUSTED** differ. That's exactly what makes a rulebook domain-specific.

---

## 6. How each slot looks in code

Grounding the abstractions with real snippets from [`vacation-approval`](../examples/vacation-approval):

**Intent kinds** ([types.ts](../examples/vacation-approval/src/types.ts)):
```ts
export type VacationIntentKind =
  | "vacation.request" | "vacation.approve" | "vacation.cancel";
```

**State** — a plain interface:
```ts
export interface VacationState {
  readonly employee: { role: "employee" | "manager"; ptoBalanceDays: number };
  readonly request: VacationRequest | null;
  readonly approverId: string | null;
  readonly nowISO: string;
}
```

**Taint policy** — one method, returns the trust floor per kind:
```ts
export const vacationTaintPolicy: TaintPolicy = {
  minimumFor(kind) {
    return kind === "vacation.approve" ? "TRUSTED" : "UNTRUSTED";
  },
};
```

**A guard** ([policies.ts](../examples/vacation-approval/src/policies.ts)):
```ts
const sufficientBalance: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.request") return null;        // not my problem
  if (payload.durationDays <= state.employee.ptoBalanceDays) return null;  // OK
  return decisionRefuse(refuse("BUSINESS_RULE", "pto.insufficient_balance", ...));
};
```

**The bundle** — just an object literal grouping guards by category:
```ts
export const vacationPolicyBundle: PolicyBundle<VacationIntentKind, unknown, VacationState> = {
  stateGuards: [requestRequired, clampDuration, cancelWindowConfirmation],
  authGuards:  [noSelfApproval],
  taint:       vacationTaintPolicy,
  business:    [sufficientBalance, deferIfNeedsApproval],
  default:     "EXECUTE",
};
```

That's the entire surface. Everything domain-specific lives inside the guards' bodies and the `K`/`P`/`S` generics — no DSL, no config file, no annotations.

---

## 7. What a Pack adds on top

A Pack ships the rulebook *and* helpers, not just the bundle.

[`@adjudicate/pack-payments-pix`](../packages/pack-payments-pix) is the first one. Beyond the bundle itself, it exports:

- **`paymentsPixPack.policy`** — drop-in `PolicyBundle` for greenfield apps using canonical PIX intent kinds.
- **`createPixPendingDeferGuard`** — a *guard factory* you compose into your own bundle if you already use higher-level intents (e.g. `order.confirm` with `paymentMethod=pix`) and don't want to rewrite the LLM prompt.

Why PIX first? It's the **lighthouse** for the framework. PIX is async by design — create charge → DEFER → webhook → resume. That's the kernel's hardest, most differentiated capability. Sync-only payments wouldn't exercise it. So PIX is the smallest realistic surface that demonstrates every Decision outcome end-to-end.

> Several adjudication patterns repeat across vacation + commerce + PIX (clamp-to-cap, threshold-escalate, webhook-trusted-only, defer-until-signal). These are the seeds of a future *risk-primitives* layer between the kernel and domain Packs — see [§9 Architectural direction](#9-architectural-direction-intended-evolution).

---

## 8. When is adjudicate the right tool?

The framework targets **any system where an LLM proposes mutations to state**. Chat bots are the most natural fit because they have untrusted user input flowing into an LLM, but the pattern applies equally to:

- **Email / SMS agents** — same untrusted-text → action shape
- **Voice agents** — transcript replaces typed message
- **Coding agents** — LLM proposes file edits / commands; kernel decides what's safe to run
- **Internal tools** — LLM drafts JIRA tickets, schedules meetings, refunds orders
- **Webhook / event pipelines** — anywhere an LLM-derived decision must be auditable, idempotent, and replay-safe

The unifying property isn't *"is there a chat UI?"* — it's:

> **"Is an LLM about to mutate state on behalf of someone whose input you don't fully trust?"**

If yes, the kernel is useful. If the LLM only reads or summarizes, you don't need it.

---

## 9. Architectural direction (intended evolution)

> **This section describes intent, not committed API.** The five headline
> interfaces (`IntentEnvelope`, `Decision`, `PolicyBundle`, `CapabilityPlanner`,
> `AuditSink`) remain stable. Everything in this section may shift before
> `v1.0.0`. Read it as roadmap, not contract.

### The real abstraction boundary

The patterns visible across [vacation-approval](../examples/vacation-approval), [commerce-reference](../examples/commerce-reference), and [pack-payments-pix](../packages/pack-payments-pix) reveal a sharper line than "domain packs":

> **Domains differ in nouns. They converge in adjudication patterns.**

| Layer | Volatile? | Examples |
|---|---|---|
| **Domain semantics** (verbs, state, thresholds) | Yes — refund limits change, SKUs change, providers change | `vacation.approve`, `cart.add_item`, `pix.charge.refund` |
| **Decision semantics** (clamp, defer, escalate, trust-gate, threshold, idempotency) | No — these are stable | universal |

The reusable asset is **decision semantics**, not business logic. That's the line the framework should be organized around.

### Three layers of policy composition

```
   ┌────────────────────────────────────────────────────────┐
   │  L3 — Domain bundles (thin compositions)               │
   │       vacation, commerce, refunds, deploys, access     │
   │       Domain vocabulary: verbs · state · thresholds    │
   └─────────────────────────┬──────────────────────────────┘
                             │ composes
                             ▼
   ┌────────────────────────────────────────────────────────┐
   │  L2 — Risk primitives (composable guard factories)      │
   │       clampAmount · forbidSelfActor · deferUntilSignal  │
   │       escalateAboveThreshold · confirmAboveThreshold    │
   │       requireTrustedFor · idempotentByNonce             │
   │       Decision semantics: universal across domains      │
   └─────────────────────────┬──────────────────────────────┘
                             │ runs on
                             ▼
   ┌────────────────────────────────────────────────────────┐
   │  L1 — Kernel (already shipped — @adjudicate/core/kernel)│
   │       adjudicate(envelope, state, bundle) → Decision    │
   │       Deterministic · audit-emitting · replay-safe      │
   └────────────────────────────────────────────────────────┘
```

**Where we are today**:
- **L1** — shipped. Kernel + types + audit emission.
- **L2** — embryonic. [`createPixPendingDeferGuard`](../packages/pack-payments-pix) in the PIX Pack is the first guard factory; it just hasn't been generalized.
- **L3** — partial. Two reference examples (handwritten guards) + one published Pack.

### Sketch of likely L2 primitives

These will firm up by inspection once 3+ Packs exist. **Not yet committed surface.**

```
   clampAmount({ to: state => state.cap })          → REWRITE
   forbidSelfActor({ actorPath, targetPath })       → ESCALATE / REFUSE
   requireTrustedFor(intentKind)                    → taint floor (TaintPolicy)
   deferUntilSignal({ name, timeoutMs })            → DEFER
   escalateAboveThreshold({ amount, route })        → ESCALATE
   confirmAboveThreshold({ amount, prompt })        → REQUEST_CONFIRMATION
   idempotentByNonce()                              → already in kernel; liftable
```

Each L3 Pack reduces to a thin composition:

```ts
// hypothetical post-L2 vacation pack
export const vacationPack = compose(
  requireTrustedFor("vacation.approve"),
  forbidSelfActor({ actorPath: "approverId", targetPath: "request.employeeId" }),
  clampAmount({ to: () => VACATION_POLICY.maxConsecutiveDays, of: "durationDays" }),
  deferUntilSignal({ name: "manager.approval", timeoutMs: 24 * HOURS }),
  // domain-specific guards still allowed inline
);
```

### Pacing discipline — Rule of Three

L2 is **deliberately not extracted yet.** Premature factoring with one Pack would ship the wrong abstraction and force breaking changes before `v1.0.0`. The discipline:

1. Ship Pack #2 — chosen to surface *different* shapes than PIX (e.g. HR approvals / access grants → exposes self-actor, multi-stage thresholds, quorum).
2. Ship Pack #3 — chosen for diversity again (e.g. synchronous Stripe payments → exposes idempotency-without-DEFER, currency conversion, chargebacks).
3. **Then** extract `@adjudicate/policy-primitives`. By that point the primitive interfaces will be visible by inspection rather than guesswork. Refactor existing Packs to consume the new package.

Until then, leaf Packs handwrite their guards. **Duplication is acceptable and informative** — it's the data that determines the right factoring.

### Invariant to preserve through any refactor

The kernel's fixed guard ordering (`state → auth → taint → business`) is a **load-bearing soundness property**: "auth always checked before business rules." If a future ADR moves to declarative phase metadata for ergonomics, `phase` must remain a **closed enum the kernel enforces**:

```ts
type GuardPhase = "preconditions" | "trust" | "risk" | "business";
//   ↑ closed enum — not arbitrary strings, not user-extensible
```

Otherwise an adopter ships a guard tagged `phase: "early"` that runs before the trust gate, and the soundness story silently breaks. The ergonomic gain isn't worth losing the invariant.

### Framing pivot — landed early, knowingly

> **Update**: the README headline pivot to **"Policy-as-code for AI agents"** landed in the same change as the first integration adapter ([`@adjudicate/anthropic`](../packages/anthropic)) and the runnable [Anthropic quickstart](../examples/quickstart-anthropic). This is **earlier than the discipline above prescribed** — L2 has not yet extracted. The rework cost when L2 lands is accepted; the seams that will shift are documented in [`packages/anthropic/README.md` "L2 rework callouts"](../packages/anthropic/README.md#l2-rework-callouts).
>
> Why land early: the kernel surface is differentiated enough today (DEFER + REWRITE + taint provenance) that having a runnable adapter and a category-defining headline accelerates ecosystem feedback. The maturity ladder in the README is explicit about what's shipped vs emerging vs partial — readers see the tradeoff on first contact.
>
> The original guidance below remains the *general* discipline for future framing changes: don't pivot before substance exists. This pivot is a deliberate exception, not a precedent.

The wedge against general policy engines (OPA, Cedar, Rego) is the three things they can't express:

| Capability | OPA / Cedar | adjudicate |
|---|---|---|
| Yes / no decisions | ✓ | ✓ |
| **DEFER** (async lifecycle as a first-class outcome) | ✗ | ✓ |
| **REWRITE** (kernel-owned payload sanitization) | ✗ | ✓ |
| **Taint provenance** (provenance as a runtime gate) | ✗ | ✓ |

The general rule still stands: don't pivot the headline framing before the substance exists — that's marketing ahead of code. This pivot ships with the first runnable substance (the Anthropic adapter + quickstart); a future headline shift to something like "policy-as-code for AI action governance" still waits for L2 to prove the claim.

### Where this leads

If L2 stabilizes and L3 fans out into a small library of trustworthy bundles (HR, money, access, deploys, code execution), the framework becomes the same thing for AI-mediated mutations that schema validators became for HTTP APIs: **the layer you don't think about, but every safe system has.**

That's the long-term thesis. The short-term work is shipping Pack #2 and #3.

---

## 10. Where to go next

Once these concepts click, the rest of the repo lines up:

- [`packages/core/README.md`](../packages/core/README.md) — kernel + types reference
- [`packages/runtime/README.md`](../packages/runtime/README.md) — DEFER/resume mechanics, deadline helpers
- [`packages/audit/README.md`](../packages/audit/README.md) — Ledger (replay) + AuditSink (durability)
- [`packages/pack-payments-pix/README.md`](../packages/pack-payments-pix/README.md) — the first domain Pack, end-to-end
- [`docs/architecture/decisions.md`](./architecture/decisions.md) — load-bearing decisions, the "do not revert without understanding why" list
- [`docs/architecture/adr/`](./architecture/adr) — individual ADRs (kernel audit emission, fail-closed default, runtime context, envelope v2)
- [`docs/ops/runbooks/`](./ops/runbooks) — staged shadow → enforce ramp for adopters migrating from a legacy decision path

If you've read this page and the per-package READMEs feel readable, the layering worked. If anything still feels jargony, that's a docs bug — open an issue.
