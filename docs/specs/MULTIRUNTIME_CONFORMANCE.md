# Multi-runtime conformance

> **Status.** Normative. Pins the contracts a non-Node implementation
> MUST satisfy to be byte-equivalent with `@adjudicate/core` on the wire.
> Companion to [`canonical-json-hash.md`](./canonical-json-hash.md),
> [`intent-envelope-v2.schema.json`](./intent-envelope-v2.schema.json),
> and [`canonical-hash-vectors.json`](./canonical-hash-vectors.json).
>
> Post-v1 the framework relies on language-neutral specs to keep the
> ecosystem decentralised. This document is the single source of truth
> a Rust, Go, Python, or browser-side runtime consults before claiming
> "adjudicate-compatible".

---

## 1. Scope

A multi-runtime implementation is *replay-equivalent* with the Node
reference when it satisfies, for every `IntentEnvelope` representable
under the v2 schema:

1. **Intent hash parity** — `intentHash(envelope)` produces the exact
   lowercase-hex SHA-256 the reference produces.
2. **Audit-record digest parity** — `verifyAuditRecord(record)`
   accepts every audit row the reference accepts and rejects every row
   the reference rejects.
3. **Decision algebra parity** — the implementation accepts and emits
   exactly the six `Decision.kind` values (no extension, no aliasing).
4. **Replay classification parity** — `classify(intentHash, expected,
   actual)` returns the same `ReplayMismatch | null` value for every
   pair, with the same `kind`, `basisDelta` (when present), and field
   ordering rules.
5. **Basis vocabulary parity** — the implementation accepts every
   category in `BASIS_CODES` and the same closed enum of codes per
   category. Pack-supplied additions follow the same vocabulary
   discipline.
6. **Wire-format parity** — every envelope it emits is structurally
   equivalent to one a Node consumer would produce for the same logical
   intent (no extra fields, no missing fields, no renamed fields).

A runtime that satisfies (1) and (6) but not the others is *hash-
equivalent* — useful for hash-only audit verification but insufficient
for cross-language replay.

---

## 2. Replay equivalence

The replay invariant from [`docs/release/semver.md`](../release/semver.md)
applies across runtimes:

> A bundle that produced a particular Decision at version `vX.Y.Z` on
> runtime R₁ must, when replayed against the same envelope + state at any
> later version `vX.Y′.Z′` on runtime R₂, produce a Decision that
> classifies as `IDENTICAL` or `BASIS_ONLY` per `replay-classify`.

That extends the rule from "same runtime over time" to "same logical
implementation across two runtimes." A Go implementation reading audit
records the Node reference produced MUST re-derive the same Decision
for any record that has a corresponding deterministic policy
implementation in Go.

The hash, the basis vocabulary, and the audit-record schema are the
load-bearing pieces. Everything else (sink wiring, ledger storage,
adapter loop) is per-runtime — runtimes that do not implement adapters
are still conformant as long as the kernel-equivalent core passes the
checks below.

---

## 3. Conformance vectors

Multi-runtime implementations ship a test that loads
`docs/specs/canonical-hash-vectors.json` and verifies:

### 3.1 Envelope vectors

For each vector with `category: "envelope"`:

- compute `intentHash(input)` via the runtime's canonicalization +
  SHA-256 pipeline;
- assert it equals `expectedHash`.

The reference Node consumer is
[`packages/core/tests/cross-runtime-hash-vectors.test.ts`](../../packages/core/tests/cross-runtime-hash-vectors.test.ts).

### 3.2 Audit-record subset vectors

For each vector with `category: "audit-record-subset"`:

- The `input` is already the canonical subset (record minus
  `{auditHash, signature}`) — same shape `buildAuditRecord` would
  produce minus those two fields;
- compute `sha256Canonical(input)` and assert it equals
  `expectedHash`.

This is the same digest `verifyAuditRecord` re-derives at the Node
reference; a runtime that produces the same digest for the same input
is audit-equivalent.

### 3.3 Vector additions

Adding a vector is MINOR (additive across runtimes — old vectors
remain). Removing a vector is MAJOR (existing runtimes would lose a
regression gate). Changing a vector's `expectedHash` is MAJOR (would
invalidate every implementation).

---

## 4. Closed enum parity

Multi-runtime implementations MUST encode the following enums exactly
as named (case-sensitive). The Node reference is the source of truth;
the closed-enum list lives in `packages/core/src/decision.ts`,
`packages/core/src/refusal.ts`, `packages/core/src/taint.ts`, and
`packages/core/src/basis-codes.ts`.

### 4.1 `DecisionKind`

```
EXECUTE | REFUSE | ESCALATE | REQUEST_CONFIRMATION | DEFER | REWRITE
```

Six values, no aliases. A runtime that adds a seventh kind is not
conformant; bumping the kind set is a MAJOR for the whole ecosystem
and ships with a new freeze matrix entry, an envelope-version bump,
and updated replay shims.

### 4.2 `Taint`

```
SYSTEM | TRUSTED | UNTRUSTED
```

Lattice `SYSTEM > TRUSTED > UNTRUSTED`. The string values are
load-bearing (they participate in `intentHash`); reordering them is a
hash-breaking change.

### 4.3 `IntentActor.principal`

```
llm | user | system
```

Lowercase. Mirrors the wire convention.

### 4.4 `RefusalKind`

```
AUTH | RATE_LIMIT | BUSINESS_RULE | SCHEMA | SECURITY | INTERNAL
```

Six categories. The kernel-internal `INTERNAL` is reserved for fail-
closed guard panics; do not emit it from a Pack.

### 4.5 `BasisCategory`

Eleven categories. The current list is in
`packages/core/src/basis-codes.ts`; the freeze matrix tags every
category-level change as MAJOR.

### 4.6 `ReplayMismatchKind`

```
DECISION_KIND | BASIS_DRIFT | REFUSAL_CODE_DRIFT
```

A runtime's `classify` MUST emit exactly these axes. New axes are
MAJOR.

### 4.7 `IntegrityFailure.kind`

```
audit_hash_missing | audit_hash_mismatch | envelope_hash_mismatch
```

Closed; additions are MINOR.

### 4.8 `AuditRecord.version`

```
1 | 2 | 3 | 4
```

Multi-runtime implementations MUST tolerate every version when reading.
When writing, the reference writes the highest-supported version on a
given branch (`v4` on the v1.0 branch). Narrowing the accepted set on
read is MAJOR.

---

## 5. Field ordering rules

Multi-runtime canonical-JSON serializers MUST sort object keys
lexicographically by UTF-16 code unit (RFC 8785 §3.2.3). This is the
only field-ordering rule the wire format carries. Field order in
in-memory representations is irrelevant — the canonicalization step
re-derives it.

Two implementation traps:

- **Locale-aware sorts** (`strcoll`, ICU collators) MUST NOT be used —
  they reorder strings by locale rules. RFC 8785 mandates raw UTF-16
  code-unit ordering.
- **Mixed-script sort orders** (Java's default `String.compareTo` on
  surrogate pairs, Python 2's byte-ordering) can subtly differ from
  ES2015 `<` comparison. Re-verify against the vectors when porting.

---

## 6. Wire format change discipline

A runtime change that produces different bytes for any existing vector
is a wire-format break. The ecosystem-wide MAJOR is governed by the
following process (cf. [`docs/release/SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md)):

1. New ADR opened with the proposed change and the failing-vector list.
2. New `intent-envelope-vN.schema.json` published.
3. New `canonical-hash-vectors-vN.json` published.
4. A replay-shim that reads both versions ships in the Node reference
   and is documented for other runtimes.
5. The MAJOR is cut only after all conformant runtimes have published a
   compatible release.

Adopters running multi-runtime topologies pin the algorithmVersion they
test against and upgrade in coordination with their runtime fleet.

---

## 7. Determinism requirements

The reference kernel is synchronous and pure. Multi-runtime
implementations MUST keep their kernel-equivalent pure as well:

- No clock reads inside `adjudicate(envelope, state, policy)`.
- No RNG reads.
- No global state.
- No background async (the function returns synchronously).

Wallclock and ledger access live in the equivalent of
`adjudicateAndAudit` and are supplied by the caller. Replay tests
verify byte-identical re-emission on repeated invocation.

---

## 8. What the spec does NOT require

Out of scope:

- **CLI binary parity.** A runtime is conformant without shipping a
  CLI; `@adjudicate/cli` is a Node-only convenience.
- **Sink parity.** Audit sinks, ledger backends, and metrics exporters
  are per-runtime; the only contract is that the AuditRecord shape is
  the wire-format from §4.8 above.
- **Adapter parity.** Provider adapters are Node-only today
  (`@adjudicate/adapter-core` + `@adjudicate/anthropic` +
  `@adjudicate/openai`). A multi-runtime kernel without adapters is
  still conformant.
- **Pack-author tooling.** Linter (`@adjudicate/analyze`), codemod
  runner (`@adjudicate/migrate`), and conformance harness
  (`@adjudicate/conformance`) live in Node. Multi-runtime Pack
  authoring requires a Node-side build step; the runtime kernel only
  needs to accept the Pack's wire artifacts.

---

## 9. Conformance checklist for a new runtime

Use this list when reviewing a new (Rust, Go, Python, …) implementation:

- [ ] All envelope vectors in `canonical-hash-vectors.json` produce
      the listed `expectedHash`.
- [ ] All audit-record-subset vectors produce the listed
      `expectedHash`.
- [ ] `Decision.kind`, `Taint`, `IntentActor.principal`,
      `RefusalKind`, `BasisCategory`, `ReplayMismatchKind`,
      `IntegrityFailure.kind`, and `AuditRecord.version` are all
      exactly the closed enums from §4.
- [ ] `classify(intentHash, expected, actual)` matches the reference
      semantics:
        - same `DecisionKind` + same flat-set of `category:code` basis
          strings → `null`;
        - different `DecisionKind` → `{kind: "DECISION_KIND", …}`;
        - same kind, different flat-set → `{kind: "BASIS_DRIFT",
          basisDelta: …}` with sorted `missing`/`extra`;
        - both REFUSE, same kind, same basis, different `refusal.code`
          → `{kind: "REFUSAL_CODE_DRIFT", …}`.
- [ ] Implementation is synchronous and pure (no clock, no RNG, no
      global state inside the kernel-equivalent function).
- [ ] Adopter-supplied state and clock are external (per the reference
      `adjudicateAndAudit` shape).
- [ ] Failing-guard semantics are fail-closed: a thrown exception in a
      guard becomes `SECURITY REFUSE` with the equivalent of
      `kernel.GUARD_PANIC`.
- [ ] Closed-enum widening is treated as a MAJOR ecosystem event, not a
      per-runtime decision.

A runtime that ticks every box is replay-equivalent and may declare
"adjudicate-compatible v1" interop.

---

## 10. Versioning

This spec is anchored to `IntentEnvelope v2` + `AuditRecord v4`. Future
wire versions publish a separate spec
(`MULTIRUNTIME_CONFORMANCE-v2.md` etc.) and bump the relevant
constants. The current spec stays authoritative for the v1 line as
long as v2 envelopes and v4 records remain readable.
