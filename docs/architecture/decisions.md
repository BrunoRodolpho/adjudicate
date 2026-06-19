# Kernel Load-Bearing Decisions

> This document captures decisions that are not assigned to a single ADR —
> cross-cutting stances that span the whole kernel. ADR index: [`docs/architecture/adr/`](./adr/).
>
> For the *rationale* behind the constitutional invariants (what would break,
> who would notice, on what horizon) see
> [`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md). For *what* is
> frozen and *how* it evolves see
> [`docs/release/V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md) and
> [`docs/release/EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md).

---

## 1. The 8-layer defense architecture

`adjudicate` places a deterministic decision kernel between an LLM's proposed
action and any side effect. The defense is layered; each layer removes a class
of failure before the next runs.

1. **Tool classification** — tools are partitioned `READ_ONLY` vs `MUTATING` at
   the type level. The LLM never sees mutating tools it is not permitted to
   propose this turn.
2. **Capability planning** — `CapabilityPlanner.plan(state, context)`
   structurally filters the visible tool/intent surface per turn. Read-only
   enforcement uses `safePlan(planner, classification)`.
3. **Intent vocabulary** — the LLM emits a typed `IntentEnvelope<kind, payload>`
   carrying `intentHash` + `taint`; it never calls a mutating function
   directly. The LLM has zero authority to mutate state.
4. **Kernel adjudication** — `adjudicate(envelope, state, policy)` is a pure
   function returning one of six `Decision` values:
   `EXECUTE | REFUSE | DEFER | ESCALATE | REQUEST_CONFIRMATION | REWRITE`.
5. **Ordered guards** — guards run in a fixed order
   (`kill → schema → state → taint → auth → business → default`); see §3.
6. **Taint lattice** — `SYSTEM > TRUSTED > UNTRUSTED`. The taint policy
   declares which intent kinds are system-only; LLM-proposed envelopes are
   always `UNTRUSTED`.
7. **Execution Ledger + Audit Sinks** — the hot-path replay/dedup ledger
   (keyed by `intentHash`) is intentionally distinct from the durable
   governance trail (`Console / NATS / Postgres` sinks).
8. **Structured refusal** — refusals are first-class output, stratified
   `SECURITY | BUSINESS_RULE | AUTH | STATE`, never a thrown exception.

This layering is domain-independent: the `@adjudicate/*` packages carry no
adopter-specific dependencies. Adopters wire only `EXECUTE` to their executor.

---

## 2. Cross-cutting decisions (not owned by a single ADR)

These stances span the whole kernel and constrain every package.

- **Closed Decision algebra.** The kernel returns exactly six values. The union
  does not widen and carries no `metadata` bag or `confidence` field — analyzability,
  adopter predictability, and cross-runtime portability all depend on the closure.
  Diagnostic context lives on `AuditRecord`, not on `Decision`.
- **Fail-closed default.** A throwing guard becomes a `SECURITY` `REFUSE` with
  the `kernel.GUARD_PANIC` basis; the exception is captured on the
  `AuditRecord` but never propagates out of the kernel. The default in any
  policy substrate must be deny.
- **Determinism covenant.** `adjudicate()` is synchronous and pure — no
  `Date.now()`, no `Math.random()`, no I/O, no global state. Wallclock and
  ledger come from `deps` in `adjudicateAndAudit`. Replay byte-identity is the
  property that makes the audit record verifiable.
- **Browser-safe core.** `@adjudicate/core` (and the extracted
  `@adjudicate/canonical`) must bundle into Next.js client apps. No
  `node:crypto`, no `Buffer` in the canonical encoder; hashing uses pure-JS
  `@noble/hashes`. (An earlier `node:crypto` import broke Next.js client
  bundles.)
- **Canonical hashing.** `intentHash = sha256(canonical_json({version, kind,
  payload, nonce, actor, taint}))` per RFC 8785 JCS — UTF-16 code-unit key
  sort, ES2015 number stringification, `undefined` omitted from objects,
  strings NFC-normalized. `createdAt` is **excluded**; `nonce` is the
  idempotency key. Normative spec:
  [`docs/specs/canonical-json-hash.md`](../specs/canonical-json-hash.md).
- **Wire-format stability.** `IntentEnvelope v2` is the wire format; any
  shape change is a new version shipped *with* its JSON Schema and golden
  vectors. v1 envelopes are refused with `schema_version_unsupported`.
- **Audit immutability.** `AuditRecord` is a value type; sinks append, never
  mutate. The schema is additive across versions (`AuditRecordVersion = 1..5`
  coexist; v4 added `auditHash`/`signature`).
- **No-upward-imports rule.** Lower layers never import higher ones: the
  kernel does not import a provider SDK; provider adapters
  (`@adjudicate/anthropic`, `@adjudicate/openai`) own only the SDK mapping
  over the provider-neutral `@adjudicate/adapter-core` loop.
- **Pack isolation.** A Pack's `policy`, `planner`, `signals`, and `handlers`
  operate only on the Pack's own intents; installed Packs cannot see each
  other's policy state through the kernel.
- **Local trust verification.** `verifyPackTrust` (in `@adjudicate/conformance`,
  not the kernel) is local — no network, no central authority. It verifies an
  `ed25519` / `rsa-pss-sha256` signature over the Pack *fingerprint* against a
  `publicKeyPem` the adopter already trusts, per a caller-supplied `TrustPolicy`.

---

## 3. Deterministic guard ordering

Guards run in a fixed, documented order:

```
kill → schema → state → taint → auth → business → default
```

The order is part of the threat model, structurally enforced by AC-005 and
pinned by `packages/core/tests/kernel/invariants/guard-order.test.ts`. Each
phase removes a class of attack before the next runs — notably, `auth` runs
*after* `taint`, so an `UNTRUSTED` actor cannot even reach the auth check on a
system-only intent. Reordering breaks the assumption every Pack was written
against. (ADR-104 moved taint ahead of auth for exactly this reason.)

---

## 4. ADR index (fine-grained decisions)

Individual decisions live as numbered ADRs in
[`docs/architecture/adr/`](./adr/). Representative entries:

| ADR | Decision |
|---|---|
| ADR-102 | Audit fail-closed by default |
| ADR-104 | Envelope v2: nonce-based `intentHash` + auth-after-taint reorder |
| ADR-106 | Guard exception isolation (`kernel.GUARD_PANIC`) |
| ADR-108 | `@adjudicate/primitives` Layer 2 expansion |
| ADR-111 | `AuditRecord` v4 additive fields + `verifyAuditRecord` |
| ADR-113 | `@adjudicate/adapter-core` extraction (provider-neutral loop) |
| ADR-114 | Distributed kill switch v2 (Redis pub/sub + polling fallback) |
| ADR-115 | Pack trust primitives (fingerprinting + signature verification) |
| ADR-116 | Post-v1 extension discipline |

The ADR directory is authoritative for the full list (ADR-101..ADR-143;
highest is `ADR-143-approval-engine-governance.md`).

---

## 5. The constitutional invariants

Eleven properties are constitutional; the framework's value proposition is
their conjunction. They are enumerated and motivated in
[`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md):

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

Changing any one is the moral equivalent of amending a constitution: possible,
but it requires a process commensurate with the stakes (coordinated MAJOR,
multi-runtime co-release, ADR, deprecation calendar, replay-shim strategy).
The default answer is *no* for at least the v1 line.
