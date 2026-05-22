# Why the invariants exist

> **Status.** Normative rationale. The codified explanation of why each
> constitutional invariant is load-bearing — what would break, who would
> notice, how badly, and on what time horizon.
>
> Companion to
> [`docs/architecture/decisions.md`](./decisions.md) (the ADR index),
> [`docs/release/V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md) (the
> *what* is frozen), [`docs/release/EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md)
> (the *how* it evolves), and
> [`docs/ops/MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md) §6.
>
> The audience is a maintainer ten years from now who is reading a PR
> that proposes "just a small relaxation" of one of these. Each section
> answers: *what protection would we lose? what would have been
> impossible without it?*

---

## 1. The eleven invariants

Eleven properties are constitutional. The framework's value
proposition is the conjunction of all eleven; weakening any one
collapses the proposition.

1. Closed Decision algebra.
2. Replay determinism.
3. Canonical hashing.
4. Audit immutability.
5. Fail-closed semantics.
6. Provider neutrality.
7. Semantic-convention stability.
8. Wire-format stability.
9. Pack isolation.
10. Deterministic guard ordering.
11. Trust verification semantics.

The remainder of this document is one section per invariant, framed as
*why* not *what*.

---

## 2. Closed Decision algebra

**The invariant.** The kernel returns one of six values:
`EXECUTE`, `REFUSE`, `DEFER`, `ESCALATE`, `REQUEST_CONFIRMATION`,
`REWRITE`. The union does not widen; it does not carry a `metadata`
bag or a `confidence` number.

**Why this exists.** Three properties depend on closure:

- **Analyzability.** AJD-101..AJD-201 reason about Pack policy by
  proving membership in a finite set. An open enum is no longer
  decidable; the analyzer becomes a heuristic instead of a verifier.
- **Adopter predictability.** An adopter wires `EXECUTE → executor` and
  every other branch into a handler table. A new value, even
  "advisory", forces every adopter to redeploy. The closure is the
  contract that lets adopters not redeploy.
- **Cross-runtime portability.** A Rust or Go implementation enumerates
  the six values at compile time. Adding a seventh value is a
  multi-language, multi-codebase release.

**What would have been impossible without it.** Static guarantee that
LLM output cannot widen the decision space. The "metadata bag" failure
mode — popular in adjacent policy frameworks — was the explicit
counterexample.

**The temptation.** "Just add `meta: Record<string, unknown>` so we can
attach diagnostic context." The diagnostic context goes on
`AuditRecord`, not on `Decision`. The decision is the contract; the
record is the artefact.

---

## 3. Replay determinism

**The invariant.** `adjudicate(envelope, state, policy)` is pure: no
`Date.now()`, no `Math.random()`, no I/O, no global state, no async.
Given the same three inputs it returns the same Decision byte-for-byte.

**Why this exists.** Replay is not a "nice-to-have"; it is the property
that makes the audit record *legally meaningful*. A record claims "at
time T with state S and policy P, the kernel decided D." That claim is
*verifiable* only if a re-run of the kernel against the same inputs
produces the same D.

Three downstream properties:

- **Incident triage.** When an operator asks "did the kernel really
  refuse this?", replay is the answer. It must be deterministic to be
  truthful.
- **Migration safety.** Upgrading the kernel from v1.3 to v1.4 is
  verified by replaying the audit corpus and classifying mismatches
  via `replayWithIntegrity` + `replay-drift`. Non-determinism would
  drown the signal.
- **Multi-runtime conformance.** A Rust runtime claiming
  byte-compatibility runs the same inputs and produces the same
  output. Non-determinism makes byte-compatibility impossible.

**What would have been impossible without it.**
[`docs/specs/MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md);
[`packages/audit/src/replay.ts`](../../packages/audit/src/replay.ts);
the entire `replay-drift` governance signal.

**The temptation.** "Just use `Date.now()` for a defer deadline." The
defer deadline is computed by `adjudicateAndAudit`, not `adjudicate`;
the clock comes from `deps`. The kernel never *reaches* for time.

---

## 4. Canonical hashing

**The invariant.** `intentHash = sha256(canonical_json({version, kind,
payload, nonce, actor, taint}))` per RFC 8785 JCS. UTF-16 code-unit
sort. ES2015 number-stringification. `undefined` omitted from objects.
No locale-aware sort.

**Why this exists.** The `intentHash` is the *idempotency key* and the
*replay key*. Two roles, one value. If two envelopes that should be
"the same" hash differently, ledger dedup fails (replay-attack
defence collapses). If two envelopes that should be "different" hash
the same, the wrong replay path is selected (audit integrity
collapses).

The RFC 8785 choice is the only canonicalisation discipline with a
formal spec, a reference implementation in multiple languages, and a
test corpus that interoperates byte-by-byte. The alternatives
(per-language JSON serialisers; in-house "normalisers") sound simpler
but fail at the multi-runtime boundary.

**What would have been impossible without it.** Cross-runtime parity;
audit-postgres dedup that works across Node and an eventual Rust
emitter; the golden-hash-vectors file as a *contract* rather than a
*snapshot*.

**The temptation.** "JavaScript's `JSON.stringify` already sorts keys
in V8." It does not. It preserves insertion order. The
canonicaliser sorts; do not rely on the engine.

---

## 5. Audit immutability

**The invariant.** `AuditRecord` is a value type. Sinks append. There
is no `record.update(…)`. The schema is additive across minor versions;
v1/v2/v3/v4 readers coexist; readers branch on `record.version`.

**Why this exists.** A governance record's evidentiary value is in its
*permanence*. A mutable record is no record. The additive-only
discipline lets an adopter who recorded v1 records in 2025 still read
them in 2035 with a v4 reader.

**What would have been impossible without it.** Multi-year forensic
review; post-hoc semver-classifier replay; the `replay-with-integrity`
that re-derives the audit hash to detect tampering.

**The temptation.** "Just add a method to attach a post-hoc
annotation." Annotations are records of their own — emit a
`record.annotated` event with a `supersedes` link to the original.

---

## 6. Fail-closed semantics

**The invariant.** A throwing guard becomes a `SECURITY` `REFUSE` with
the `kernel.GUARD_PANIC` basis. The exception is logged on the
`AuditRecord` but never propagates out of the kernel.

**Why this exists.** A guard that throws is a guard that did not say
"yes". The default in any policy substrate must be deny. The
alternative — propagating the throw — turns a guard bug into a
denial-of-service or, worse, an unhandled exception that the adopter's
top-level handler resolves by *retrying* (potentially with a different
codepath that *does* yield `EXECUTE`).

**What would have been impossible without it.** Defensive composability
of Packs. A Pack author who writes a buggy guard cannot accidentally
escalate the bug into a security incident; the kernel converts the bug
into a refusal with full audit trail.

**The temptation.** "Throwing should bubble up so we can diagnose." It
does — into the `AuditRecord` with the basis `kernel.GUARD_PANIC` and
the captured exception. Operators see the bug; the adopter's executor
never runs.

---

## 7. Provider neutrality

**The invariant.** The kernel does not know about Anthropic, OpenAI,
or any other provider. The adapter layer (`@adjudicate/adapter-core` +
`@adjudicate/anthropic` + `@adjudicate/openai`) is the only place
provider concerns live. The kernel speaks `IntentEnvelope`.

**Why this exists.** Three reasons:

- **Provider churn.** The LLM provider landscape changes every quarter.
  A kernel that knows about model names ages out of relevance. A
  kernel that consumes `IntentEnvelope` is immortal relative to that
  churn.
- **Adopter sovereignty.** Adopters pick their LLM provider; the
  framework cannot be a tax on that choice.
- **Audit clarity.** The audit record records *what the kernel
  decided*, not *which model was used*. The model is incidental; the
  decision is the artefact.

**What would have been impossible without it.** Adding a third
provider in <200 lines (the design target).
[`packages/adapter-core/src/loop.ts`](../../packages/adapter-core/src/loop.ts)
is the proof.

**The temptation.** "Just import `Anthropic` from `@anthropic-ai/sdk`
in the kernel for convenience." The kernel does not import a provider
SDK. Ever.

---

## 8. Semantic-convention stability

**The invariant.** The `SEMCONV` constants in
`@adjudicate/observability` are a frozen vocabulary. Adding a key is
additive (MINOR); removing one is MAJOR; renaming one is MAJOR.

**Why this exists.** Operators wire dashboards, alerts, and runbooks
to specific keys. A renamed key silently breaks the dashboard. The
SEMCONV vocabulary is operationally what `BASIS_CODES` is to policy:
the closed set adopters program against.

**What would have been impossible without it.** Cross-deployment
operator portability. An engineer who has operated `@adjudicate/*` at
one company can operate it at another the next year; the keys are
identical.

**The temptation.** "We renamed it for clarity." Add the new key as an
alias; deprecate the old key on the calendar; remove at a MAJOR. This
is the same discipline as
[`deprecations.md`](../release/deprecations.md).

---

## 9. Wire-format stability

**The invariant.** `IntentEnvelope v2` is the wire format. New shape =
new version (v3). Each version ships *with* its JSON Schema and
golden vectors. v1 envelopes are *refused* at runtime with
`schema_version_unsupported` (no silent acceptance).

**Why this exists.** External runtimes (Rust, Go, Python) must
implement the wire format to participate. A silent shape change
breaks them invisibly — they keep emitting the old shape and the
Node kernel keeps refusing. The `version` field is the explicit
handshake; the JSON Schema + golden vectors are the test.

**What would have been impossible without it.** Cross-runtime audit
trails (a Rust producer + a Node consumer); the
[`MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md)
discipline; a 10-year archival policy.

**The temptation.** "Just add a field, it's backwards-compatible." It
isn't. A new optional field changes the canonical-JSON output for
envelopes that set it; the hash changes; ledger dedup misses. The
*version* must change.

---

## 10. Pack isolation

**The invariant.** A Pack's `policy`, `planner`, `signals`, and
`handlers` operate only on the Pack's own intents. Two installed
Packs cannot see each other's policy state through the kernel; their
intent-kind namespaces are disjoint by convention.

**Why this exists.** Composition is hostile. An adopter installs N
Packs from N authors; the security posture must not degrade
multiplicatively. Pack isolation is the property that lets the
adopter compose without an N×N audit.

**What would have been impossible without it.** Confidence that
installing a new Pack does not silently weaken the existing security
posture. AC-001 (untrusted-never-executes) is per-Pack and composes
trivially under isolation.

**The temptation.** "A Pack should be able to reach into another for
shared state." Shared state goes in the adopter's data layer, not the
Pack's policy. A Pack is a self-contained governance unit; if it
reaches outside, it is no longer a Pack.

---

## 11. Deterministic guard ordering

**The invariant.** Guards run in a fixed order:
`kill → schema → state → taint → auth → business → default`. The order
is documented in `decisions.md`, structurally enforced by AC-005, and
pinned by `packages/core/tests/kernel/invariants/guard-order.test.ts`.

**Why this exists.** Each phase removes a class of attack before the
next phase runs:

- `kill` blocks all traffic during an incident.
- `schema` rejects ill-formed envelopes.
- `state` blocks impossible transitions (cart already paid, etc.).
- `taint` blocks UNTRUSTED → system-only intents (the foundational
  zero-trust property).
- `auth` blocks insufficient-capability actors.
- `business` runs domain logic.
- `default` falls through (convention: REFUSE).

A reorder breaks the assumption every Pack was written against.
Specifically: `auth` *after* `taint` means an UNTRUSTED actor cannot
even reach the auth check on a system-only intent; an attacker cannot
probe the auth surface. Reordering `auth → taint` defeats that.

**What would have been impossible without it.** The zero-trust
posture that lets Pack authors write `auth` guards assuming "if I see
this intent, taint has already been checked".

**The temptation.** "Order doesn't matter logically." It does. The
order is *part* of the threat model.

---

## 12. Trust verification semantics

**The invariant.** `verifyPackTrust(pack, signature)` is pure and
local. It does not call the network. It does not consult a central
authority. It verifies a signature against a public key the adopter
already trusts.

**Why this exists.** Centralised trust is a single point of failure.
A framework-issued CA can be compromised; a hosted verification
service can go offline; a registry can be coerced. Local verification
against adopter-managed keys is the only model that survives all
three.

**What would have been impossible without it.** The
[`ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md)
§2 ("Why no marketplace") posture; the decentralised ecosystem.

**The temptation.** "Just check Sigstore for free transparency." Layer
Sigstore on top by mapping its attestation format to `PackSignature`;
do not make Sigstore *required*. Adopters who do not use Sigstore must
still be able to verify Packs.

---

## 13. Reading order

If you are reading this for the first time:

1. **§2 and §3** are the headline invariants. Understand these before
   reviewing any kernel-touching PR.
2. **§4 and §9** are the wire-format invariants. Understand these
   before reviewing any envelope or audit-record PR.
3. **§5, §6, §10, §11** are the security invariants. Understand these
   before approving any policy or guard PR.
4. **§7, §8, §12** are the ecosystem invariants. Understand these
   before approving any cross-runtime or registry PR.

The order matches the freeze matrix's prioritisation.

---

## 14. A note on "constitutional"

The word is deliberate. These are not "engineering preferences" that
the next maintainer can revisit. They are properties on which the
framework's *legitimacy* rests. Adopters built around them; external
runtimes implement them; courts and auditors (in the regulated
domains where adjudicate is used) cite the audit records produced by
them.

A future maintainer who wishes to change one of these is doing the
moral equivalent of amending a constitution: it is possible, but it
requires a process commensurate with the stakes (coordinated MAJOR,
multi-runtime co-release, ADR, deprecation calendar, replay-shim
strategy). The default answer is *no*.

The framework's promise to adopters is that the answer is *no* for at
least the v1 line and probably the v2 line. Make the answer truthful.
