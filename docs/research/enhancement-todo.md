# Adjudicate enhancement TODO — synthesis of seven research passes

> **Status.** Brutal-strategic-reflection synthesis of sub-agent reports SA1–SA7
> (academic, operational, modern-AI, code-archaeology, 5-yr roadmap, 10-yr
> structural, PL-design). All file paths and line numbers verified against
> the working tree at `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/`
> on 2026-05-12. **L2 (`@adjudicate/primitives`) has shipped** with three
> primitives (`createThresholdGuard`, `createStateDeferGuard`,
> `createSystemTaintPolicy`); Pack #2 (KYC) has shipped; Pack #3 has not.
> "P2 (after L2 round-2)" therefore means "after the next batch of L2
> primitives discovered via Pack #3 work."
>
> **Disposition.** Decision filter, not a wishlist. Every ticket cites
> sub-agent provenance. Items rejected here are rejected with reasoning, not
> deferred to ambient noise.

---

## 1. Cross-reference: what multiple sub-agents independently identified

The high-signal items below are the ones to prioritise — independent
convergence is the strongest filter against single-author bias.

| Convergent finding | SA1 | SA2 | SA3 | SA4 | SA5 | SA6 | SA7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **REWRITE scope is structurally under-bounded; needs invariant test/lint** | ✓ (Rec 3) | | ✓ (Validation 2) | | | ✓ (3.2) | |
| **Guards are opaque closures; static analysis blocked by missing metadata** | ✓ (Rec 3) | ✓ (Rec 4) | | ✓ (Friction 3) | | | ✓ (Spec B, F) |
| **`forbiddenConcepts` promises something it does not enforce** | | | ✓ (Validation 3) | ✓ (Other) | | ✓ (3.7) | |
| **L2 needs a corpus / static-coverage tool (a "linter")** | ✓ (Rec 3) | ✓ (Rec 4) | | ✓ (Friction 3) | ✓ (Top-3 do-now #3) | | ✓ (Spec B, E1) |
| **Guard authorship metadata (name + provenance) is missing** | ✓ (Rec 3) | ✓ (Rec 1, Rec 5) | | ✓ (Friction 3) | | | ✓ (Spec F) |
| **Rule deprecation lifecycle / dead-guard detection** | ✓ (Rec 3 — basis-code coverage) | ✓ (Rec 1 — XCON existential) | | | | | ✓ (Spec B — coverage matrix) |
| **WHY-NOT / counterfactual / human-readable explanation** | ✓ (Rec 1) | ✓ (Rec 6 — calibration) | | | ✓ (Decision-shape rejection: ship as CLI/Console, not API) | | ✓ (Spec D — `explainRecord`) |
| **Reference adapter does not exercise the production audit/ledger path** | | ✓ (Op 5 shadow-mode runbook implies this) | ✓ (caveat near "zero authority") | ✓ (Friction 1 — singularly consequential) | | | |
| **Guard-order docs out of sync with code (T8 reorder)** | | | ✓ (Validation 1) | ✓ (Friction 2) | ✓ (Top-3 do-now #2) | | |
| **IntentEnvelope hash needs language-neutral spec for replay across runtimes** | | | | | | ✓ (3.1) | |
| **Taint enum is exposed as string literal — adopters can pattern-match on it** | | | | | | ✓ (3.3) | |
| **Confidence as envelope field (graded uncertainty signal)** | | | | ✓ (Extension catalog #1) | ✓ (regret-risk verdict: do not add as Decision field) | | ✓ (Spec A) |
| **Supersession in audit (chain DEFER → resume, REWRITE → execute)** | | | | ✓ (Extension #3) | ✓ (regret-risk verdict: NEVER on Decision; only on AuditRecord) | | ✓ (Spec C) |

**Items in only one report (low signal — adjudicated below):**

- *Externalize tunable constants as `PolicyConfig`* (SA2 Rec 2). Survives —
  AmEx forms-editor lesson; well-evidenced; but **demote to P1**
  (adopter-gated; no concrete demand yet from a real adopter).
- *Outcome-distribution dashboard* (SA2 Rec 3). Survives as P2 — the data
  substrate already exists (`MetricsSink`, `LearningSink`); the gap is
  visualization in `apps/console`. Useful but adopter-context-dependent.
- *Decision-fuzz harness with fast-check* (SA2 Rec 7, SA7 Spec E3).
  Survives as P2 — pairs naturally with reachability analysis (Spec B);
  ship after one Pack-author writes the lighthouse property.
- *Pack composition primitives (`derivePack`)* (SA2 Rec 8). **Cut for now**
  — SA2 itself flagged "defer until at least one real adopter requests it";
  no current evidence.
- *KernelIdentity / Sigstore signing seam* (SA6 §3.5). **Cut from P0–P2** —
  reserve as architectural seam; do not build now. SA6 explicitly said "don't
  ship now; reserve seam." Honour that.
- *Non-coder PolicyBundle visualization* (SA7 Spec F). **Descriptor type only**
  surfaces as P2; the visualizer product is out of scope for the framework.

---

## 2. Direct contradictions — adjudicated

### Contradiction 1 — Should `Decision` gain a `confidence` field?

- **SA4** (Code Archaeology) and **SA7** (PL Designer Spec A) both treat
  `Confidence` as a viable extension at the *envelope* level (with
  intentHash exclusion).
- **SA5** (5-yr Pragmatic) explicitly rejects "Decision.confidence as
  field" as "research direction, not v1.0; ship as `decision.metadata`
  escape hatch if needed later."

**Adjudication.** No real contradiction once read carefully. SA5 rejects
adding it to the `Decision` shape (the closed enum); SA7 puts it on the
*envelope* as optional metadata, explicitly excluded from `intentHash`. The
SA7 design is consistent with SA5's "do not widen the closed `Decision`
vocabulary" position. **Both are correct under their own scope; the actual
ticket is SA7's envelope-level design, not a Decision-shape change.**

### Contradiction 2 — Should `forbiddenConcepts` survive in the `Plan` shape?

- **SA3 Validation 3** prefers option (a): drop `forbiddenConcepts` because
  it's not structurally enforced and "the worst place to be on a security
  boundary is making promises you cannot keep."
- **SA6 §3.7** characterises `forbiddenConcepts` as the "weakest member"
  but reversible — "v2 Plan can extend without breaking."

**Adjudication.** SA3 is more right. SA6 underweights the *positioning*
cost: keeping the field in v1.0 trains adopters to think the framework
enforces it. Removal in v2 then breaks adopter mental models even though
the type signature lets you extend. SA3 wins on perception-ROI. **Ticket:
remove `forbiddenConcepts` from `Plan` before v1.0 freeze**, or
prominently mark it `@deprecated — advisory only, not enforced`. P1.

### Contradiction 3 — Where do conflict-detection improvements sit?

- **SA1 Rec 3** wants a static-analysis layer expressed as `pack lint`
  rules: reachability, ordering, REWRITE-scope.
- **SA7 Spec B** says "the honest answer is you can't statically analyse
  arbitrary `Guard<K,P,S>`. Ship bounded property-based reachability with a
  state corpus; call it what it is — empirical, not symbolic."

**Adjudication.** These are not in conflict; they're a layered set. SA7's
Spec B is the **runtime scaffolding**; SA1's `pack lint` checks are the
**static checks expressible without execution** (e.g., REWRITE-scope
syntactic check, basis-code-declared-but-not-emitted, duplicate guard
name). Both ship. SA7 owns the dynamic side; SA1 owns the syntactic side.

### Contradiction 4 — Is the L2 layer ahead of, on, or behind the discovery
schedule?

- **SA1 Rec 2** strongly favours leaning into L2 factories as "the
  declarative layer in disguise."
- **SA5** observes L2 has shipped 3 primitives "ahead of docs' wait-for-
  Pack-#3 pacing" and recommends documenting this as a deliberate exception.
- **SA6** treats L2 as a downstream consequence of higher-asymmetry
  decisions (envelope spec, taint opacity).

**Adjudication.** SA1 and SA5 are aligned; SA6 simply has different scope.
The acceptance: L2 is shipped early *because* threshold + state-defer
patterns occurred in both Pack #1 and Pack #2 — Rule-of-Three was met for
those specific shapes. SA5's recommendation to document the exception
explicitly is right. **Ticket: update `docs/concepts.md §9` to mark L2 as
shipped with the rule-of-three evidence trail.** P0.

---

## 3. Adversarial stress

### What breaks if every proposed improvement ships tomorrow

**Cascade failures within 30 days:**

1. **Envelope schema drift x4.** Confidence (SA7 A), supersession (SA7 C),
   wire-format spec (SA6 3.1), and taint opacity (SA6 3.3) all touch the
   envelope or its hash recipe. Shipping in arbitrary order produces an
   envelope with three concurrent partial migrations and a hash function
   that's been redefined twice.
   - **Mitigation:** version-bump discipline. Either ship all envelope deltas
     in a single `IntentEnvelope v3` cut OR ship them in a strict sequence
     with a published migration ADR per step.

2. **Audit schema concurrency.** Supersession bumps `AuditRecord` to v3;
   `ResourceVersion` already moves under v2; the `audit-postgres`
   serializer becomes the contention point. Two concurrent migrations
   landing in the same week produce a Postgres column whose write-side and
   read-side disagree.
   - **Mitigation:** lock-step migrations with a single PR per
     `AUDIT_RECORD_VERSION` increment; `audit-postgres` migration tests
     forced to round-trip every prior version.

3. **L2 metadata explosion.** `__describe` for visualizer (SA7 F),
   `nameGuard` automation in factories (SA2 Rec 1), authorship JSDoc
   convention (SA2 Rec 5), and `withDescription` typed helper (SA7 F all
   compete for the same "guard metadata" surface. Shipping naively
   produces three orthogonal mechanisms.
   - **Mitigation:** define a single `GuardMetadata` interface in
     `packages/core/src/kernel/policy.ts` first; every other ticket
     extends it.

### Mutually incompatible combinations

- **`confidence` as envelope field** and **strict-typed `BuildEnvelopeInput`
  with no escape hatch** are at structural tension. Confidence is
  optional-with-default; BuildEnvelopeInput cannot enforce that because
  the hash recipe must skip it. The tension is resolvable but requires
  explicit invariant test (`hash unchanged when confidence added`) — fold
  into Spec A's PR.
- **Removing `forbiddenConcepts`** and **adding `__describe` metadata to
  the `Plan` type** both touch `packages/core/src/llm/planner.ts`; do them
  in the same PR.
- **REWRITE static-scope check (SA1 Rec 3, SA6 3.2)** and **bounded
  reachability analysis (SA7 B)** both build on `adjudicateWithTrace`. The
  REWRITE-scope check is a *trace inspector* (post-hoc, looking at what
  was rewritten); the reachability analysis is a *trace generator*. They
  consume the same trace shape — version it deliberately.

### Invariants of the existing architecture at risk

The 8 named invariants from `docs/architecture/decisions.md` plus the
"closed enum of 6 Decision kinds" doctrine are at risk under the following
proposed changes:

| Invariant | Proposed change risking it | Mitigation |
|---|---|---|
| Closed-enum Decision (SA3, SA5, SA6) | Confidence-as-Decision-field temptation | Confine confidence to envelope; never add as Decision field |
| Pure kernel (`adjudicate()` is total) | Adding `resolveSupersession` resolver | Resolver lives on `AdjudicateAndAuditDeps`, not `_adjudicateImpl` |
| `intentHash` stable across retries | Adding fields to envelope | Hash exclusion list must be invariant-tested in `tests/kernel/invariants/` |
| State guards run before any other phase | Reachability analyser re-running guards at phase head | Analyser MUST preserve phase ordering when re-running |
| Taint monotonicity | Opaque taint constructors (SA6 3.3) | Constructors return `Taint`; the lattice is internal |
| REWRITE bounded scope | Adopter-defined REWRITE guards | Static syntactic check + property test asserting `rewritten.kind === envelope.kind` |

---

## 4. Vaporware kill log

| Item | Source | Disposition |
|---|---|---|
| "Sovereign reconciliation" / autonomous resolution layer | (not present in any sub-agent report) | N/A — already absent. Mark as a tripwire if it surfaces in future drafts. |
| "Chrono-adaptive state" / time-aware guards beyond DEFER | (not present in any sub-agent report) | N/A — adjudicate's DEFER-as-first-class is already the disciplined version of this idea. |
| "SMT-as-natural-language-verifier" / theorem-prover-grade conflict detection | SA7 Spec B *explicitly* rejects this in favour of bounded empirical reachability | Killed by SA7 itself. Honour the disclaimer: anything marketed as "static analysis" or "formal verification" misnames the artefact and locks the framework into a defence stance forever. |
| "Edge-deployed adjudication" | SA6 §"Shifts that did not survive evidence test" | Killed by 2026 evidence. |
| "Sovereign AI compute layer" | SA6 §"Shifts that did not survive evidence test" | Killed. |
| "AI agents form their own service mesh" | SA6 §"Shifts that did not survive evidence test" | Killed. |
| "Differential privacy / homomorphic adjudication" | SA6 §"Shifts that did not survive evidence test" | Killed. |
| "A single dominant agent framework" | SA6 §"Shifts that did not survive evidence test" | Killed; positions adjudicate as substrate, not framework-of-frameworks. |
| "MCP-aware Pack distribution" / Pack server registry | (not in reports) | Adjacent to MCP-server-registry trend (SA6 §6) but **not** a feature adjudicate should ship. Packs ship via npm; that's correct. |
| "Pack.nonceStrategy" surface | SA4 (Other Friction Points) — referenced in `packages/anthropic/README.md:153` but **does not exist on `PackV0`** | Verified absent. Either ship or remove the README forward-looking note. **P1: clean up README forward-looking notes.** |
| "PromptRenderer.intentSchemas" surface | SA4 — referenced in `packages/anthropic/README.md:152` and `renderer-anthropic.ts:11-14` but does not exist | Same disposition: verify-then-clean. **P1.** |
| "Forbidden-concepts post-hoc output filter" | SA3 Validation 3 explicitly rejects building this | Killed. Framework is not in the content-moderation business. |

**No claim made in this TODO is from training-data prior; every claim
above is grounded in either an inline file reference verified on
2026-05-12 or in the convergence of two or more sub-agent reports.**

---

## 5. The TODO list

### Tier P0 — do now (3)

---

#### P0-1. Fix the doc-vs-code drift on guard ordering (T8 sweep)

**Why.** The kernel evaluates guards in `state → taint → auth → business`
order (verified at `packages/core/src/kernel/adjudicate.ts:213-261`), but
nine adopter-facing surfaces still document `state → auth → taint →
business` — including a *named soundness invariant* in
`docs/concepts.md:312` and an invariant the Anthropic adapter README
*promises to preserve* (`packages/anthropic/README.md:126`). An adopter
reading the docs and writing a Pack against the documented ordering will
build guards whose security assumptions are wrong. **SA4 Friction 2; SA5
Top-3 do-now #2; partial overlap with SA3 Validation 1.**

**Files affected (all paths absolute; verified 2026-05-12 against working
tree):**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/README.md` (line 112)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/docs/concepts.md` (lines 109, 312 — the latter is a *named soundness invariant*)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/pack.ts` (line 78)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/policy.ts` (line 8)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/README.md` (line 126)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/examples/vacation-approval/src/policies.ts` (line 16)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/templates/pack/src/policy.ts.tpl` (line 20)

**Type signature sketch.** No type-level change. Pure docs/JSDoc/template
sweep, plus add an invariant test:

```ts
// packages/core/tests/kernel/invariants/guard-order.test.ts (NEW)
test("phase order of evaluation is state → taint → auth → business", () => {
  const trace: string[] = [];
  const policy = mkPolicyWithTracingGuards(trace);
  adjudicate(envelope, state, policy);
  expect(trace).toEqual(["state", "taint", "auth", "business"]);
});
```

**Effort.** Small (≤ 2 hours). Pure search-and-replace plus one invariant
test.

**Dependencies.** None.

**Success criteria.**
1. `grep -rn "state → auth → taint → business" packages/ docs/ README.md
   examples/` returns *only* historical references in
   `docs/architecture/adr/ADR-104-envelope-v2-nonce.md` (where the phrase
   describes pre-T8 behaviour and is correct in context).
2. New invariant test in `packages/core/tests/kernel/invariants/` asserts
   the order from `_adjudicateImpl`.
3. `docs/concepts.md:312` re-anchors the named soundness property as
   "untrusted inputs cannot side-effect any guard before being rejected"
   — per **SA3 Validation 1**'s sharpening.

---

#### P0-2. Anthropic adapter must use `adjudicateAndAudit`, not pure `adjudicate`

**Why.** The reference adapter's hot path
(`packages/anthropic/src/adapter.ts:245-266`) calls pure `adjudicate()`
and emits an audit record by hand with `durationMs: 0` hardcoded. **No
ledger consult, no `MetricsSink`, no `LearningSink`, no `RuntimeContext`,
no race-loss flip, no `resourceVersion`.** Two duplicate webhook
deliveries hitting the same Pack via the adapter *both execute* — the
double-spend protection the README markets (`README.md:97-130`) is wired
in `adjudicateAndAudit` and the lighthouse adapter does not exercise it.
**SA4 Friction 1 — singularly highest-consequence finding from the code
archaeology pass.**

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/adapter.ts` (lines 245–266 — replace direct `adjudicate` + manual `buildAuditRecord` with `adjudicateAndAudit`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/types.ts` (extend `AdjudicatedAgentOptions` with optional `RuntimeContext`, `Ledger`, `MetricsSink`, `LearningSink` — surface them to adopters)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/README.md` (document the wired path; remove the implicit "use at your own risk" gap)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/examples/quickstart-anthropic/src/index.ts` (wire a default in-memory `Ledger` so the quickstart exercises double-spend protection)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/tests/` (NEW — integration test: send the same `intentHash` twice, assert second decision is `REPLAY_SUPPRESSED`)

**Type signature sketch.**

```ts
// packages/anthropic/src/types.ts (DELTA)
export interface AdjudicatedAgentOptions<K extends string, P, S> {
  // ... existing fields ...

  /** Required for double-spend protection. Default: in-memory Ledger. */
  readonly ledger?: Ledger;

  /** Per-tenant overrides. Routed to adjudicateAndAudit's RuntimeContext. */
  readonly runtimeContext?: RuntimeContext;

  /** Optional. Wired through to adjudicateAndAudit. */
  readonly metricsSink?: MetricsSink;
  readonly learningSink?: LearningSink;
}

// packages/anthropic/src/adapter.ts (DELTA at the kernel-call site)
const decision = await adjudicateAndAudit(
  envelope as IntentEnvelope<K, P>,
  state,
  options.pack.policy,
  {
    sink: options.auditSink ?? noopAuditSink,
    ledger: options.ledger ?? makeInMemoryLedger(),
    metricsSink: options.metricsSink,
    learningSink: options.learningSink,
    runtimeContext: options.runtimeContext,
    clock: realClock,
  },
);
```

**Effort.** Medium (1–2 days). Includes a careful test pass that
double-fire intent envelopes don't double-execute.

**Dependencies.** None — `adjudicateAndAudit` already exists at
`packages/core/src/kernel/adjudicate-and-audit.ts:1-30`.

**Success criteria.**
1. Adapter no longer constructs `AuditRecord` by hand; lines 253–266 of
   adapter.ts replaced by single `adjudicateAndAudit` call.
2. New integration test: two `agent.send` calls with same `intentHash`
   produce one EXECUTE + one REPLAY_SUPPRESSED.
3. `durationMs: 0` hardcode is gone (now measured by
   `adjudicateAndAudit`).
4. Quickstart at `examples/quickstart-anthropic/src/index.ts` has a
   default in-memory ledger configured; running it twice with the same
   payload demonstrates idempotency in stdout.

---

#### P0-3. `GuardMetadata` interface — single shared surface for guard authorship + describe

**Why.** Five separate proposals (SA1 Rec 3, SA2 Rec 1+5, SA4 Friction 3,
SA7 Spec B, SA7 Spec F) all want metadata on guards. Without a shared
interface they will land as orthogonal mechanisms and contend for the
same surface. The fix is one small interface — `GuardMetadata` — defined
in core and *consumed* by everything downstream. This is the unblocker
ticket: every other static-analysis improvement depends on guards being
*inspectable*.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/policy.ts` (extend with `GuardMetadata`, `withMetadata` helper, optional `__metadata` symbol convention)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/adjudicate.ts` (lines 124–134 — `nameGuard` becomes a thin facade over `withMetadata({ name })`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/primitives/src/guards.ts` (factories auto-attach `__metadata` describing themselves)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/primitives/src/taint.ts` (same)

**Type signature sketch.**

```ts
// packages/core/src/kernel/policy.ts (NEW)
export interface GuardMetadata {
  /** Canonical guard name. Falls back to Function.name when omitted. */
  readonly name?: string;

  /** Free-text scenario reference (e.g. "scenario:large-refund-escalation"). */
  readonly scenario?: string;

  /** Pack-level author identifier. Source-of-truth for "who owns this guard." */
  readonly author?: string;

  /** ISO date the guard was first added. */
  readonly since?: string;

  /**
   * Discriminated union describing what the guard does. Factories populate
   * this; hand-written guards may leave it { kind: "opaque" }. Used by
   * the visualizer (SA7 F), the bounded reachability analyser (SA7 B),
   * the syntactic REWRITE-scope check (SA1 Rec 3), and the deprecation
   * lifecycle audit (SA2 Rec 1).
   */
  readonly description?: GuardDescription;
}

export type GuardDescription =
  | { kind: "threshold"; field: string; comparator: ">=" | "<=" | ">" | "<"; threshold: number; outcome: Decision["kind"] }
  | { kind: "state_defer"; matchKind: string; signal: string; timeoutMs: number }
  | { kind: "system_taint"; systemOnlyKinds: readonly string[] }
  | { kind: "rewrite"; mutates: readonly string[] /* JSON-paths into payload, allowlisted */ }
  | { kind: "opaque" };

/** Symbol-keyed slot avoids polluting `Function.prototype`. */
export const GuardMetadataSymbol: unique symbol = Symbol.for("@adjudicate/guard-metadata");

export function withMetadata<F extends Guard<any, any, any>>(
  guard: F,
  metadata: GuardMetadata,
): F {
  Object.defineProperty(guard, GuardMetadataSymbol, {
    value: Object.freeze(metadata),
    enumerable: false,
    writable: false,
  });
  return guard;
}

export function readGuardMetadata(guard: Guard<any, any, any>): GuardMetadata | undefined {
  return (guard as any)[GuardMetadataSymbol];
}
```

**Effort.** Small (≤ 1 day for core surface; +0.5 day for L2 factories
to attach `__metadata`).

**Dependencies.** None.

**Success criteria.**
1. `GuardMetadata`, `GuardDescription`, `GuardMetadataSymbol`,
   `withMetadata`, `readGuardMetadata` exported from
   `@adjudicate/core/kernel`.
2. `nameGuard()` reimplemented as `withMetadata(guard, { name })`.
3. `createThresholdGuard`, `createStateDeferGuard`,
   `createSystemTaintPolicy` auto-attach `__metadata` describing
   themselves.
4. Test: `readGuardMetadata(createThresholdGuard({...}))` returns
   `{ description: { kind: "threshold", field, comparator, threshold,
   outcome } }` with correct values.
5. JSDoc on `GuardMetadata` explicitly cites the four downstream
   consumers (B reachability, F visualizer, REWRITE-scope check,
   deprecation audit) so a future contributor doesn't reinvent.

---

### Tier P1 — after Pack #3 (5)

---

#### P1-1. `analyzePolicy` — bounded reachability + ordering-inversion detection

**Why.** Guards are arbitrary functions; static analysis is impossible in
the SMT sense (SA7 Spec B agrees explicitly). The bounded form — Pack-
authors register a *state corpus* and the analyser walks it — is honest,
ships in ~250 LoC, and forms the foundation for the deprecation audit
(SA2 Rec 1), the dead-guard detection (SA1 Rec 3), the visualizer SA7
Spec F, and `validatePolicyBundle` (SA7 Spec E1). **High independent
convergence: SA1 Rec 3, SA2 Rec 4, SA4 Friction 3, SA7 Spec B.**

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/conflict-analysis.ts` (NEW — ~150 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/index.ts` (re-exports)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/commands/simulate.ts` (CLI hook — `--analyze` flag)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/pack-payments-pix/tests/conflict.test.ts` (NEW — lighthouse Pack-level test)

**Type signature sketch.** Verbatim from SA7 Spec B:

```ts
export interface PolicySample<K extends string, P, S> {
  readonly name: string;
  readonly envelope: IntentEnvelope<K, P>;
  readonly state: S;
  readonly expected?: Decision["kind"];
}

export interface GuardCoverage {
  readonly phase: "state" | "auth" | "business";
  readonly index: number;
  readonly guardName: string | undefined;
  readonly reached: number;
  readonly matched: number;
  readonly matchedSamples: readonly string[];
}

export interface PolicyConflict {
  readonly kind:
    | "shadowed_by_predecessor"
    | "subsumed_pair"
    | "ordering_inversion"
    | "non_deterministic_guard";
  readonly subject: { phase: string; index: number; guardName?: string };
  readonly evidence: readonly string[];
  readonly note: string;
}

export interface PolicyAnalysisReport<K extends string, P, S> {
  readonly samples: readonly PolicySample<K, P, S>[];
  readonly coverage: readonly GuardCoverage[];
  readonly conflicts: readonly PolicyConflict[];
}

export function analyzePolicy<K extends string, P, S>(
  policy: PolicyBundle<K, P, S>,
  samples: readonly PolicySample<K, P, S>[],
): PolicyAnalysisReport<K, P, S>;
```

Note the `non_deterministic_guard` addition not in SA7 — sub-agent
recommended detection by running each sample twice; surface as a conflict
kind so adopters can grep for it.

**Effort.** Medium (3–5 days including tests, CLI hook, doc page).

**Dependencies.** P0-3 (`GuardMetadata` — analyser uses
`readGuardMetadata` to render guard names + descriptions in the report).
Pack #3 helpful but not blocking — PIX corpus suffices for v1.

**Success criteria.**
1. `analyzePolicy` exported from `@adjudicate/core/kernel`.
2. PIX Pack ships at least one corpus test asserting empty
   `report.conflicts` and ≥ 1 `matched` for every guard.
3. Inverting two guards in PIX `business` array makes the test fail with
   a `ordering_inversion` conflict citing both samples.
4. `adjudicate simulate --analyze` prints a coverage matrix + conflict
   list.
5. Doc `docs/policy-analysis.md` explicitly disclaims SMT-grade soundness
   (per SA7's framing — "empirical, not symbolic").

---

#### P1-2. `Supersession` field in `AuditRecord` v3

**Why.** Confirmation flows (REQUEST_CONFIRMATION → user confirm → re-
adjudicate → EXECUTE), DEFER → resume, and REWRITE → execute all produce
multiple audit rows with no link. Auditors hand-join on `actor.sessionId`
+ `kind` + heuristic time windows. The Operator Console
`/decisions/[intentHash]` page cannot show "what led to this." **SA4
Extension Catalog #3, SA5 regret-risk verdict (only on AuditRecord, never
on Decision), SA7 Spec C.**

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/audit.ts` (bump `AUDIT_RECORD_VERSION` to 3; add `Supersession`, `SupersessionReason`; extend `BuildAuditInput`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/adjudicate-and-audit.ts` (extend `AdjudicateAndAuditDeps` with `resolveSupersession`; wire into `buildAuditRecord` calls at both kill-switch path and main path)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/adapter.ts` (`confirm()` and `resume()` populate `resolveSupersession`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/persistence.ts` (extend `ConfirmationStore` records with `at` timestamp)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/audit-postgres/` (migration: `add_supersedes_jsonb_to_audit.sql`; serializer/deserializer updates)

**Type signature sketch.** Verbatim from SA7 Spec C with one tightening
(single-parent locked, not array — defer many-parent to v4 if needed):

```ts
export const AUDIT_RECORD_VERSION = 3 as const;
export type AuditRecordVersion = 1 | 2 | 3;

export type SupersessionReason =
  | "confirmation_resolved"
  | "defer_resumed"
  | "rewrite_executed"
  | "replay";

export interface Supersession {
  readonly predecessorIntentHash: string;
  readonly predecessorAt: string;
  readonly reason: SupersessionReason;
  readonly token?: string;
}

export interface AuditRecord {
  // ... existing fields ...
  readonly supersedes?: Supersession;
}

// kernel
export interface AdjudicateAndAuditDeps {
  // ... existing fields ...
  readonly resolveSupersession?: (envelope: IntentEnvelope) => Supersession | undefined;
}
```

**Effort.** Medium (3–4 days including the Postgres migration round-trip
test).

**Dependencies.** P0-2 (adapter must already be using `adjudicateAndAudit`
for `resolveSupersession` to flow through).

**Success criteria.**
1. `AUDIT_RECORD_VERSION === 3`; v1, v2, v3 all readable by audit-postgres.
2. New `audit-postgres` migration tested round-trip across v2 → v3
   records.
3. Anthropic adapter `confirm({accepted: true})` produces a v3 record
   whose `supersedes.predecessorIntentHash` equals the original
   confirmation envelope's `intentHash`, with reason
   `"confirmation_resolved"`.
4. `apps/console/src/components/decision/SupersessionChain.tsx` renders
   the predecessor link (or, if console scope deferred, at least the
   `audit-postgres` reader returns the field shape).

---

#### P1-3. Remove or deprecate `forbiddenConcepts`; clean stale anthropic README forward-references

**Why.** `Plan.forbiddenConcepts` (`packages/core/src/llm/planner.ts:19`)
is rendered into the system prompt
(`packages/anthropic/src/renderer-anthropic.ts:77-80`) but **never
enforced** at any kernel boundary. It is the single non-structural
member of the `Plan` shape — the worst place for a security boundary to
be ambiguous. **SA3 Validation 3** prefers removal; **SA6 §3.7** prefers
deprecation-with-extension; **adjudicated above to favour SA3** because
positioning matters more than reversibility. Bundle this with cleanup of
two README forward-references (`PromptRenderer.intentSchemas`,
`Pack.nonceStrategy`) that **SA4** verified do not exist.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/llm/planner.ts` (line 19 — mark `forbiddenConcepts` as `@deprecated` with link to ADR; v2 cut: remove)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/renderer-anthropic.ts` (lines 77–80, 11–14 — drop or gate the `forbiddenConcepts` rendering; remove stale `intentSchemas` JSDoc)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/adapter.ts` (line 262 — drop from audit plan snapshot)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/README.md` (lines 152–153 — remove forward-looking notes for surfaces that don't exist)
- NEW ADR: `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/docs/architecture/adr/ADR-XXX-forbidden-concepts-deprecation.md`

**Type signature sketch.**

```ts
// packages/core/src/llm/planner.ts (DELTA)
export interface Plan {
  readonly visibleReadTools: readonly string[];   // structurally enforced
  readonly allowedIntents: readonly string[];     // structurally enforced
  /**
   * @deprecated v0.2 → removed in v1.0.
   *
   * Advisory only — rendered into the system prompt; never enforced at
   * any framework boundary. The kernel does not inspect this field.
   * Keeping it as a typed slot misrepresents the framework's
   * guarantees. Adopters who need adversarial-content filtering should
   * compose an output-side filter outside the framework. See
   * ADR-XXX.
   */
  readonly forbiddenConcepts?: readonly string[];
}
```

**Effort.** Small (≤ 1 day including ADR + README sweep).

**Dependencies.** None.

**Success criteria.**
1. `Plan.forbiddenConcepts` is `@deprecated` with link to ADR; build
   warns when adopters set it.
2. `packages/anthropic/README.md:152-153` no longer claims surfaces that
   don't exist (`PromptRenderer.intentSchemas`, `Pack.nonceStrategy`).
3. ADR explains the perception-ROI argument: typed slot ≠ enforcement
   boundary.
4. Adopter migration note in `CHANGELOG.md`.

---

#### P1-4. `explainRecord` — Pack-owned localised explanation registries

**Why.** Every consumer of `decision_basis` (Operator Console, support
tools, replay reports, end-user notifications) reimplements the same
join: category-coded basis → localised template → field substitution.
The right primitive is a free function `explainRecord(record, registry)`
with Pack-supplied registries. **SA1 Rec 1** wants this as the symmetric
partner to "WHY-NOT" (counterfactual is a *different* ticket — see
DEFERRED below); **SA2 Rec 6** wants it as part of the calibration
loop; **SA5** rejects making `record.explain()` a method on `AuditRecord`
(records are values; methods kill JSON-roundtrip); **SA7 Spec D** ships
the data-only design that resolves this.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/explain.ts` (NEW — ~120 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/index.ts` (re-exports)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/pack-payments-pix/src/explanations.ts` (NEW — pt-BR registry as lighthouse)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/pack-payments-pix/package.json` (new subpath export `./explanations`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/lib/simulate-renderer.ts` (lines 182–237 — port the existing 70%-built renderer to consume registries instead of re-implementing)

**Type signature sketch.** Verbatim from SA7 Spec D:

```ts
export interface DecisionExplanation {
  readonly intentHash: string;
  readonly headline: string;
  readonly bullets: readonly string[];
  readonly locale: string;
}

export interface ExplanationRegistry {
  readonly locale: string;
  readonly templates: Readonly<Record<string, string>>;
  readonly headlines?: Readonly<Record<Decision["kind"], (record: AuditRecord) => string>>;
}

export function explainRecord(
  record: AuditRecord,
  registry: ExplanationRegistry,
): DecisionExplanation;

export function registerExplanationFormatter(
  name: string,
  fn: (raw: unknown) => string,
): void;
```

**Effort.** Small-to-medium (2 days including PIX registry, simulate-
renderer port, and template-injection escape test).

**Dependencies.** None at code level. Pairs nicely with P1-2
(supersession) for chain-narration but not blocking.

**Success criteria.**
1. `explainRecord` exported from `@adjudicate/core`.
2. PIX `explanations.ts` covers the codes already emitted by
   `pack-payments-pix/src/policies.ts` (verify by enumerating
   `BASIS_CODES.{state,business,validation}` keys actually used).
3. Template-injection invariant test: a payload field containing `${...}`
   syntax does NOT execute as template syntax (escape required).
4. `apps/console` decision-detail page calls `explainRecord` on the
   record (or, if console scope deferred, at least cli `simulate`'s text
   tree uses it).

---

#### P1-5. JSON Schema publication for `IntentEnvelope v2` + canonical-JSON hashing spec

**Why.** Per **SA6 §3.1** ("highest asymmetry"): "an auditor in 2034
cannot independently re-hash a 2026 envelope without re-implementing
`canonicalize()`." Today the canonical JSON serialisation is defined by
what `packages/core/src/hash.ts` *does*, not by a spec a Python or Rust
implementation can read. Cost to fix today: tiny (~1 day for spec doc +
JSON Schema). Cost in 2030 once a non-Node runtime needs to round-trip:
arbitrarily high.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/docs/specs/intent-envelope-v2.schema.json` (NEW — JSON Schema 2020-12)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/docs/specs/canonical-json-hash.md` (NEW — normative spec for the hashing algorithm; reference RFC 8785 JCS as the candidate)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/hash.ts` (add JSDoc cross-reference; NO behaviour change)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/tests/kernel/invariants/canonical-json-conformance.test.ts` (NEW — golden-vector tests asserting our `canonicalize()` agrees with the spec on a curated corpus)

**Type signature sketch.** No type changes. Pure spec/doc/test artefact.

```jsonc
// docs/specs/intent-envelope-v2.schema.json (excerpt)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://adjudicate.dev/specs/intent-envelope-v2.json",
  "type": "object",
  "required": ["version", "kind", "payload", "createdAt", "nonce", "actor", "taint", "intentHash"],
  "properties": {
    "version": { "const": 2 },
    "kind": { "type": "string", "minLength": 1 },
    // ...
  }
}
```

**Effort.** Small (1 day if RFC 8785 maps cleanly; medium if our
canonicalize differs and we must either change it or document the
divergence — verify before committing).

**Dependencies.** None.

**Success criteria.**
1. JSON Schema validates every envelope produced by `buildEnvelope` in
   the test suite.
2. Spec document at `docs/specs/canonical-json-hash.md` describes the
   hashing recipe (field order, escaping rules, type-handling) such that
   an external implementation can reproduce hashes without reading
   `hash.ts`.
3. Golden-vector test: ≥ 20 envelopes with known SHA-256 hashes; both
   the TS implementation and an out-of-band recomputation (e.g.,
   manually constructed canonical string) produce the same hash.
4. README links to the spec.

---

### Tier P2 — after L2 round-2 (i.e., after Pack #3 surfaces the next batch of L2 primitives) (5)

---

#### P2-1. `confidence` field on `IntentEnvelope` + `createConfirmAboveUncertaintyGuard` primitive

**Why.** PIX and KYC both have flows where REQUEST_CONFIRMATION should fire
on graded-evidence ambiguity (LLM "guessing" between candidates) but the
envelope cannot carry that signal today; adopters smuggle confidence into
`payload._confidence` per-Pack with no convention. **SA4 Extension #1**
verifies green-field structurally; **SA7 Spec A** ships the design with
`intentHash` exclusion property. **Why P2 not P1.** It's an envelope-shape
change (adopter migration cost ≠ zero), it lands cleanly only after
`GuardMetadata` (P0-3) and after Pack #3 confirms the demand pattern is
real beyond payments+identity (otherwise the primitive's
`createConfirmAboveUncertaintyGuard` ranks as an over-fit to two domains).

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/confidence.ts` (NEW — ~40 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/envelope.ts` (lines 36–53 — add optional `confidence`; lines 86–109 — explicit hash-exclusion documented + invariant-tested)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/basis-codes.ts` (extend with `confidence` category: `UNCERTAIN`, `LOW_MARGIN`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/primitives/src/confidence.ts` (NEW — ~50 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/audit-postgres/` (envelope serializer must persist `confidence` when present; no migration required if stored as JSONB)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/anthropic/src/bridge.ts` (extend `bridgeOutput` with optional `confidence` in `IntentClassified`)

**Type signature sketch.** Verbatim from SA7 Spec A; key points:

```ts
declare const __confidenceBrand: unique symbol;
export type ConfidenceValue = number & { readonly [__confidenceBrand]: true };

export type ConfidenceSource =
  | "llm.logprob"
  | "llm.self_report"
  | "deterministic"
  | "absent"
  | "adopter";

export interface Confidence {
  readonly value: ConfidenceValue;
  readonly source: ConfidenceSource;
  readonly alternatives?: readonly ConfidenceValue[];
}

// envelope.ts
export interface IntentEnvelope<K extends string = string, P = unknown> {
  // ... existing fields ...
  /** Optional. NOT part of intentHash. Default treated as { value: 1, source: "absent" }. */
  readonly confidence?: Confidence;
}

export function createConfirmAboveUncertaintyGuard<K extends string, P, S>(
  options: ConfirmAboveUncertaintyOptions<K, P, S>,
): Guard<K, P, S>;
```

**Effort.** Medium (3 days including the hash-invariance invariant test
and the LLM-side `c.source === "llm.self_report"` foot-gun documentation).

**Dependencies.** P0-3 (`GuardMetadata` so the new primitive auto-attaches
`__metadata`).

**Success criteria.**
1. Adding `confidence` to an envelope does NOT change `intentHash` —
   property test in `tests/kernel/invariants/`.
2. `createConfirmAboveUncertaintyGuard` returns REQUEST_CONFIRMATION when
   `confidence.value < threshold` OR (with `minMargin` set) when top
   alternative is within `minMargin`.
3. Adopters omitting confidence see no behaviour change (kernel
   synthesizes `{ value: 1, source: "absent" }`).
4. `BASIS_CODES.confidence = { UNCERTAIN: "uncertain", LOW_MARGIN:
   "low_margin" }` is additive to the existing `BasisCategory` union.
5. PIX Pack ships at least one `confirmAmbiguousReceiver` guard
   exercising the primitive on `pix.charge.create`.

---

#### P2-2. Static REWRITE-scope check + property-test scaffolding

**Why.** REWRITE is structurally the kernel asserting authority over input
space. The doctrine ("normalisation, sanitisation, mechanical capping —
never business transformation") is enforced socially, not structurally.
**SA1 Rec 3, SA3 Validation 2, SA6 §3.2** all converge: convert this to a
*tooling* invariant. Two layers: (a) syntactic check that REWRITE-emitting
guards declare an allowlist of payload paths they may modify (via
`GuardMetadata.description.kind === "rewrite"`); (b) property test that
runs envelopes through REWRITE guards and asserts `rewritten.kind ===
envelope.kind`, `rewritten.actor === envelope.actor`, `taint(rewritten)
>= taint(envelope)`.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/rewrite-scope.ts` (NEW — ~80 LoC; takes a `PolicyBundle` + corpus, walks REWRITE-emitting guards, asserts each modifies only paths in `metadata.description.mutates`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/pack-conformance.ts` (extend `assertPackConformance` to invoke `rewriteScope` if Pack supplies a corpus)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/commands/pack-lint.ts` (NEW or extend — add `--rewrite-scope` strict mode)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/docs/architecture/adr/ADR-XXX-rewrite-scope.md` (NEW — formalises the doctrine)

**Type signature sketch.**

```ts
export interface RewriteScopeViolation {
  readonly guardName: string;
  readonly sample: string;
  readonly expected_paths: readonly string[];
  readonly actual_modifications: readonly string[];
  readonly violations: readonly { path: string; reason: "outside_allowlist" | "kind_changed" | "actor_changed" | "taint_decreased" }[];
}

export function checkRewriteScope<K extends string, P, S>(
  policy: PolicyBundle<K, P, S>,
  samples: readonly PolicySample<K, P, S>[],
): readonly RewriteScopeViolation[];
```

**Effort.** Medium (3–4 days including ADR).

**Dependencies.** P0-3 (`GuardMetadata` with `kind: "rewrite"; mutates:
string[]`), P1-1 (`analyzePolicy` infrastructure for sample walking).

**Success criteria.**
1. A guard that returns REWRITE without declaring `metadata.description =
   { kind: "rewrite", mutates: [...] }` is flagged by `pack lint
   --rewrite-scope`.
2. A guard that mutates a payload path outside its declared `mutates`
   allowlist is flagged.
3. An adopter trying to ship `rewritten.kind !== envelope.kind` is
   flagged.
4. ADR `ADR-XXX-rewrite-scope` published; cited from `docs/concepts.md`
   REWRITE section.

---

#### P2-3. Rule deprecation lifecycle — `LearningSink` extension + `audit guard-stats` CLI

**Why.** XCON's existential threat: "rules whose author has left the
company" crossed 60% by 1988. **SA2 Rec 1** (the operationally most
experienced sub-agent's #1 ranked recommendation): track per-guard fire
counts in a 90-day rolling window; surface as a CLI; conventionally treat
guards with zero fires as deprecation candidates. The structural barrier
("factory-built guards are anonymous") is removed by P0-3
(`GuardMetadata` exposes `name`).

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/learning.ts` (extend `LearningEvent` with `guardName: string | null` derived from the matching trace entry)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/audit/src/guard-stats.ts` (NEW — aggregator over a `LearningSink` stream)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/commands/audit-stats.ts` (NEW — `adjudicate audit guard-stats --pack <pack> --since 90d`)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/audit-postgres/` (canonical SQL view for guard-fire aggregation)

**Type signature sketch.**

```ts
// packages/core/src/kernel/learning.ts (DELTA)
export interface LearningEvent {
  // ... existing fields ...
  /** Guard that produced the Decision (when applicable). null when default fired. */
  readonly guardName: string | null;
  /** Phase the matching guard ran in. null when default fired. */
  readonly guardPhase: "state" | "auth" | "business" | null;
}

// packages/audit/src/guard-stats.ts
export interface GuardFireStats {
  readonly guardName: string;
  readonly phase: "state" | "auth" | "business";
  readonly fires90d: number;
  readonly fires180d: number;
  readonly lastFireAt: string | null;
  readonly status: "active" | "stale" | "dead";
}

export function aggregateGuardStats(
  events: AsyncIterable<LearningEvent>,
  options: { now: Date; staleAfterDays?: number; deadAfterDays?: number },
): Promise<readonly GuardFireStats[]>;
```

**Effort.** Medium (3–5 days including Postgres view + CLI command).

**Dependencies.** P0-3 (`GuardMetadata.name` is the join key).

**Success criteria.**
1. `LearningEvent` carries `guardName` + `guardPhase` for every non-default
   Decision.
2. `adjudicate audit guard-stats --pack ./pack-pix --since 90d` lists
   every guard with fire counts and status (active/stale/dead).
3. Documented convention: 90 days no fire = deprecation comment; 180 =
   remove.
4. Postgres view for adopters running `audit-postgres`.

---

#### P2-4. `fuzzPolicy` harness with fast-check + lighthouse PIX property

**Why.** Property-based testing for guards is the only way to catch the
"forgot to handle the `refunded` status case" class of bugs without an
infinite test suite. **SA2 Rec 7, SA7 Spec E3.** Skip Spec E2 (`dryRun`)
per SA7's recommendation — redundant with `adjudicateWithTrace`. Why
P2: depends on Pack #3 + L2 round-2 to define what "lighthouse property"
shapes generalise across domains.

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/fuzz.ts` (NEW — ~120 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/fuzz-arbitraries.ts` (NEW — `arbitraryIntentEnvelope(kindArb, payloadArb)` helper)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/pack-payments-pix/tests/fuzz.test.ts` (NEW — lighthouse property: "no money created from thin air")
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/commands/fuzz.ts` (NEW — `adjudicate fuzz --pack ./pack-pix --properties ./properties.ts --runs 1000`)

**Type signature sketch.** Verbatim from SA7 Spec E3:

```ts
import type { Arbitrary } from "fast-check";

export interface PolicyFuzzGenerators<K extends string, P, S> {
  readonly envelope: Arbitrary<IntentEnvelope<K, P>>;
  readonly state: Arbitrary<S>;
}

export interface PolicyFuzzProperty<K extends string, P, S> {
  readonly name: string;
  readonly check: (envelope: IntentEnvelope<K, P>, state: S, decision: Decision) => boolean;
}

export interface PolicyFuzzReport {
  readonly runs: number;
  readonly violations: readonly {
    readonly property: string;
    readonly counterexample: { envelope: unknown; state: unknown; decision: Decision };
  }[];
}

export function fuzzPolicy<K extends string, P, S>(
  policy: PolicyBundle<K, P, S>,
  generators: PolicyFuzzGenerators<K, P, S>,
  properties: readonly PolicyFuzzProperty<K, P, S>[],
  options?: { readonly runs?: number; readonly seed?: number },
): Promise<PolicyFuzzReport>;
```

**Effort.** Medium (4–5 days including the PIX lighthouse property and
CLI integration).

**Dependencies.** P1-1 (`analyzePolicy` for shared corpus shape; not
strictly required but synergistic).

**Success criteria.**
1. `fuzzPolicy` exported from `@adjudicate/core/kernel`.
2. PIX Pack ships at least one fuzz property: "for every refund envelope
   ≥ R$ 1,000, decision is one of {ESCALATE, REWRITE, REFUSE}."
3. Throwing guards are caught and reported as `runtime_error` violations
   (not crashing the harness).
4. CLI `adjudicate fuzz` produces a deterministic seed-replayable
   counterexample report.

---

#### P2-5. `PolicyBundleDescriptor` — type contribution only; visualizer deferred

**Why.** The Operator Console + compliance-officer audience need a design-
time view of a Pack. **SA7 Spec F** ships the type contribution
(`describePolicyBundle`); the visualizer product itself is weeks of UI
work and not framework scope. Why P2: depends on `GuardMetadata`
(P0-3), `analyzePolicy` (P1-1) for rich rendering, and on Pack #3 to
ensure the descriptor generalises beyond payments+identity. **Strictly
the type contribution; not the apps/console UI.**

**Files affected.**

- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/inspect.ts` (NEW — ~60 LoC)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/core/src/kernel/index.ts` (re-exports)
- `/Users/thaisrodolpho/adjudicate/.claude/worktrees/lucid-williamson-a7ee47/packages/cli/src/commands/pack-describe.ts` (NEW — `adjudicate pack describe --out ./pack-policy.json`)

**Type signature sketch.** Verbatim from SA7 Spec F:

```ts
export interface PolicyBundleDescriptor {
  readonly default: PolicyBundle<string, unknown, unknown>["default"];
  readonly phases: readonly PhaseDescriptor[];
  readonly taintMinimums: Readonly<Record<string, "SYSTEM" | "TRUSTED" | "UNTRUSTED">>;
}

export interface PhaseDescriptor {
  readonly phase: "state" | "auth" | "business";
  readonly guards: readonly GuardDescriptor[];
}

export interface GuardDescriptor {
  readonly index: number;
  readonly name: string | null;
  readonly source: string | "unknown";
  readonly description?: GuardDescription;  // re-uses P0-3's union
}

export function describePolicyBundle<K extends string, P, S>(
  bundle: PolicyBundle<K, P, S>,
  intents: readonly K[],
): PolicyBundleDescriptor;
```

**Effort.** Small for the type contribution (1–2 days). **Explicitly
exclude the visualizer app from this ticket** — that's adjacent product
scope, weeks of work, and per SA7 should wait until 3+ Packs have shipped.

**Dependencies.** P0-3 (re-uses `GuardDescription` union).

**Success criteria.**
1. `describePolicyBundle(pack.policy, pack.intents)` returns a
   JSON-serialisable descriptor.
2. L2 factories produce `description.kind` matching their primitive
   (`"threshold"`, `"state_defer"`, `"system_taint"`).
3. Hand-written guards produce `description: { kind: "opaque" }`.
4. CLI `adjudicate pack describe` writes a `pack-policy.json`.
5. Doc explicitly disclaims this is a *view*, not a *no-code editor* —
   round-tripping back to a working bundle is OUT OF SCOPE.

---

### DEFERRED (deliberate non-decisions)

| Item | Source | Disposition |
|---|---|---|
| **Counterfactual / "why-not" search** | SA1 Rec 1 | DEFER. Genuinely valuable but designs cleanest after `analyzePolicy` ships (P1-1) and after the basis-code coverage is dense. Revisit in 6 months. |
| **`PolicyConfig` externalised tunables** | SA2 Rec 2 | DEFER. SA2 itself argues for it pre-Pack-#3; SA5 explicitly defers. Wait for the *first* adopter to hit the gap; build it then. Don't speculate. |
| **Outcome reconciliation API (`recordOutcome`)** | SA2 Rec 6 | DEFER. The `LearningEvent` substrate is in place; adding the canonical sink is one ticket but with no consumer no value lands. Pair with the first adopter who needs calibration. |
| **Outcome-distribution dashboard in `apps/console`** | SA2 Rec 3 | DEFER. UI work; depends on at least P2-3 (guard-stats infrastructure). Build alongside the visualizer as a Console v0.2 push. |
| **`derivePack` composition primitives** | SA2 Rec 8 | DEFER. SA2's own recommendation: "defer until at least one real adopter requests it." Honour the discipline. |
| **`KernelIdentity` + Sigstore signing seam** | SA6 §3.5 | DEFER. SA6 explicitly says "don't ship now; reserve seam." Architectural seam to keep open in mind, not now to build. |
| **Field-level `TaintedValue<T>`** | SA5 (regret-risk) | DEFER. SA5: "stay experimental through v1.0." |
| **Multi-tenant isolation in `RuntimeContext`** | SA5, SA4 Friction 4 | DEFER but with caveat: surface in docs that `RuntimeContext` exists. Pure docs work to lift visibility (could fold into P0-2's adapter wiring). The *semantic* hardening of multi-tenancy stays experimental. |
| **PackV1 contract / Pack metadata expansion beyond `GuardMetadata`** | SA5 | DEFER. Wait for Pack #3 + Pack #4. |
| **OpenAI adapter** | SA5 Phase C | DEFER until Phase C of the roadmap (months 5-9). Unblocks adapter-core extraction; not this quarter. |

### REJECTED (with reasoning)

| Item | Source | Reason |
|---|---|---|
| **Add `confidence` field directly to `Decision`** | (potential reading of SA7 A) | REJECTED. Widens the closed-enum doctrine that survives 2036 evidence (SA6 §3.2 + SA5). The right shape is envelope-level metadata excluded from `intentHash` (P2-1). |
| **`Decision.metadata?: Record<string, unknown>` escape hatch** | SA5 (mentioned as fallback) | REJECTED. Open-shape escape hatches are how every closed-enum vocabulary I know of has died. If a future need appears, extend the closed enum deliberately, not via stringly-typed metadata. |
| **`record.explain()` as method on `AuditRecord`** | (potential reading of SA1 Rec 1) | REJECTED. `AuditRecord` is a value object — methods kill JSON-roundtrip and contradict "audit record is data" doctrine. SA5 + SA7 D both reject. Ship as free function `explainRecord(record, registry)` (P1-4). |
| **`dryRun` API distinct from `adjudicate`** | SA7 Spec E2 | REJECTED. `adjudicate()` *is* a dry-run. Documenting the existing `adjudicateWithTrace` + `buildAuditRecord` pattern is the right answer. SA7 E2 explicitly recommends skip. |
| **YAML/JSON Pack DSL** | SA1 Rec 2 ("DO NOT") | REJECTED on sight. The 1980s shell ecosystem died of DSL proliferation. Stay in TypeScript; let `GuardMetadata` carry the structured-but-typed declarative content. |
| **Decision supersession on the `Decision` type itself** | SA4 Extension #3 (rejected by SA5) | REJECTED. SA5's call: "destroys deterministic short-circuit invariant; document rejection in ADR." Supersession lives on `AuditRecord` only (P1-2). |
| **Post-hoc LLM output filter for `forbiddenConcepts`** | SA3 Validation 3 (alternative path) | REJECTED. Framework not in the content-moderation business. SA3's option (a) — drop the field — is the right move. |
| **MCP-server-style Pack registry** | (not requested but adjacent to SA6 §6 trends) | REJECTED. Packs ship via npm; that's correct positioning. Adding a separate registry is a distribution-layer scope creep with no current need. |
| **General-purpose autonomous "agent service mesh" features** | (training-data temptation) | REJECTED. SA6 explicitly lists this as a 2026-evidence-failed shift. Adjudicate is a per-decision substrate, not a federation/mesh layer. |

---

## 6. Synthesis

### The single most consequential observation from this research pass

**The reference Anthropic adapter does not exercise the production audit path
the framework's lifecycle diagram markets** (verified at
`packages/anthropic/src/adapter.ts:245-266` calling pure `adjudicate()`
and emitting an `AuditRecord` by hand with `durationMs: 0` hardcoded —
no ledger, no metrics, no learning, no race-flip). Until P0-2 lands,
two duplicate webhook deliveries hitting the same Pack via the
lighthouse adapter both execute, and the `README.md:97-130`
"Ledger (hot-path) replay protection" claim is structurally a lie at
the lighthouse — even though the kernel's `adjudicateAndAudit` wraps
it correctly at `packages/core/src/kernel/adjudicate-and-audit.ts:1-30`.
This is the single reading-vs-running gap that most undermines the
framework's external positioning, and it is fixable in 1–2 days.

### What changes about the framework's positioning if all P0 + P1 ships

The framework moves from "policy-as-code library with strong invariants
that the lighthouse adapter only partially exercises" to "policy-as-
code substrate with a verifiably-correct reference adapter, language-
neutral envelope spec, navigable audit chains, and a bounded reachability
analyser that lets adopters detect ordering bugs *before* shipping." The
documentation and the running code agree on the guard order. The
`Plan` shape promises only what the framework can structurally deliver.
That combination — adapter-honest, spec-published, chain-navigable,
order-analysable — is what an enterprise compliance team needs to bring
adjudicate to a PR meeting.

### The failure mode to actively guard against

**Shipping any envelope-shape change (confidence, supersession, taint
opacity) without first publishing the JSON Schema (P1-5) — every
deferred-format-spec decision compounds into a v3 cut that can no
longer be safely round-tripped by external runtimes.**

---

*Synthesis produced 2026-05-12. Every claim verified against the
working tree at `/Users/thaisrodolpho/adjudicate/.claude/worktrees/
lucid-williamson-a7ee47/`. File paths and line numbers cited here were
spot-checked with Read/Grep before commit; SA4's most consequential
finding (Friction 1) was verified directly against
`packages/anthropic/src/adapter.ts:245-266`.*
