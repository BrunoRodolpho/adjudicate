# Canonical JSON hashing for `IntentEnvelope.intentHash`

> **Status.** Normative. Describes the byte-stable algorithm that produces
> the `intentHash` field of every [`IntentEnvelope v2`](./intent-envelope-v2.schema.json).
> External (non-Node) re-implementations MUST conform to this spec to remain
> interoperable with the reference implementation in
> [`packages/core/src/hash.ts`](../../packages/core/src/hash.ts).

---

## 1. Why this spec exists

`intentHash` is the load-bearing replay key consumed by the Execution Ledger.
Two implementations that disagree on the hash for the same envelope cannot
interoperate — duplicate-delivery suppression breaks, cross-language replay
fails, and audit verification across runtimes becomes impossible.

This document fixes the algorithm so a Rust, Go, Python, or browser-side
implementation can produce the same hash as the reference TypeScript
implementation.

The reference Node.js implementation in `packages/core/src/hash.ts` is
**conformant** with this spec, not normative. If the implementation and this
spec ever diverge, the spec is authoritative and the implementation is a bug.

---

## 2. Normative algorithm

### 2.1 Canonicalization

The canonicalization algorithm is **RFC 8785 — JSON Canonicalization Scheme
(JCS)**. The reference implementation has been verified byte-compatible with
RFC 8785 test vectors; conforming external implementations MUST also be
byte-compatible with RFC 8785.

JCS, summarized:

1. **Object key order**: lexicographic UTF-16 code-unit order.
2. **Number serialization**: ECMAScript `ToString(Number)` semantics
   (Number.prototype.toString from ES2015 §7.1.12.1, which JCS adopts
   normatively).
3. **String escaping**: only the characters required by RFC 8259 are
   escaped (`"`, `\`, and control characters U+0000–U+001F). Non-ASCII
   characters MUST NOT be escaped via `\uXXXX` — they pass through as
   literal UTF-8 in the output.
4. **No whitespace** anywhere in the output.
5. **Arrays** preserve element order.
6. **`null`** is preserved.

### 2.2 Handling JavaScript `undefined`

JSON has no `undefined`. The reference implementation, written in TypeScript,
must decide what to do with `undefined` values it encounters before
canonicalization runs. The rule, applied **before** JCS canonicalization:

- **Object properties with `undefined` value MUST be omitted** from the
  serialized object. `{a: undefined}` and `{}` MUST hash identically.
- **Array elements equal to `undefined` MUST be encoded as `null`**
  (`[1, undefined, 3]` → `[1, null, 3]`).
- **Top-level `undefined` MUST be encoded as `null`**.

External implementations in languages without `undefined` (Python, Rust, Go,
Java) do not need to implement this preprocessing; they only need to ensure
that whatever omissions or substitutions they perform produce the same JSON
as a JS implementation that has applied the rules above.

### 2.3 Hash recipe

Given an `IntentEnvelope`, the hash input is the **subset**:

```
{
  version: <number>,
  kind:    <string>,
  payload: <JSON value>,
  nonce:   <string>,
  actor:   { principal: <string>, sessionId: <string> },
  taint:   <"SYSTEM" | "TRUSTED" | "UNTRUSTED">
}
```

Notably **excluded** from the hash:

- `createdAt` — descriptive metadata only. Pre-T8 it was part of the recipe;
  this caused silent dedup failures when adopters rebuilt envelopes on retry
  without preserving `createdAt`. v2 separates `createdAt` (metadata) from
  `nonce` (idempotency key).
- `intentHash` itself — recursive inclusion would be ill-defined.

### 2.4 Digest

The output is **lowercase hexadecimal SHA-256** over the UTF-8 bytes of the
canonical JSON:

```
intentHash = hex(sha256(utf8_bytes(canonical_json(hash_input))))
```

64 lowercase hex characters, regex `^[a-f0-9]{64}$`.

---

## 3. Reference implementation

Node.js, in [`packages/core/src/hash.ts`](../../packages/core/src/hash.ts):

```ts
import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = canonicalize(v);
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
```

Notes for re-implementers:

- `JSON.stringify` (Node ≥ 18) emits ECMAScript-conformant numbers, sorts no
  keys (we sort them ourselves), preserves UTF-8 in strings (no `\u` escapes
  for non-ASCII), and uses no whitespace. These properties together mean the
  combination "sort keys + filter undefined + JSON.stringify" produces an
  output byte-equivalent to RFC 8785 canonicalization for the input shapes
  this framework emits.
- A Rust implementation backed by `serde_json::ser::CanonicalFormatter` plus
  manual key-sorting will produce identical output for the same input.
- A Python implementation MUST NOT use `json.dumps(..., sort_keys=True,
  ensure_ascii=False, separators=(',', ':'))` directly without first
  filtering `None` keys — Python's `json.dumps` handles dict ordering and
  whitespace correctly but does not omit anything; preprocessing is required.

---

## 4. Cross-runtime check (Python)

The following Python is provided as a literal cross-runtime check, not as a
dependency. It produces the same hash as the reference Node implementation
for the golden vectors in
[`packages/core/tests/hash-golden-vectors.test.ts`](../../packages/core/tests/hash-golden-vectors.test.ts).

```python
import hashlib
import json

def canonicalize(v):
    if v is None:
        return None
    if isinstance(v, dict):
        # Filter keys whose values are explicitly omitted (Python has no
        # `undefined`; the JS reference omits keys with `undefined`. In
        # Python, model that by passing `{k: v for k, v in ... if v is not
        # _OMITTED}` upstream, then sort.)
        return {k: canonicalize(v[k]) for k in sorted(v.keys())}
    if isinstance(v, list):
        return [canonicalize(x) for x in v]
    return v

def canonical_json(v):
    # separators=(',', ':') — no whitespace.
    # ensure_ascii=False — preserve UTF-8, do not emit \u escapes for
    # non-ASCII characters (RFC 8785 §3.3).
    # sort_keys is unused here because canonicalize() already sorts.
    return json.dumps(canonicalize(v), separators=(',', ':'), ensure_ascii=False)

def sha256_canonical(v):
    return hashlib.sha256(canonical_json(v).encode("utf-8")).hexdigest()

# Golden vector 1 from hash-golden-vectors.test.ts
hash_input = {
    "version": 2,
    "kind": "order.submit",
    "payload": {"sku": "X", "qty": 1},
    "nonce": "n-golden-1",
    "actor": {"principal": "llm", "sessionId": "s-golden-1"},
    "taint": "UNTRUSTED",
}
assert sha256_canonical(hash_input) == (
    "ccaaf1c710d6956f00b84cbed4fc8a31c148a9e3e1c932d21f377c472c690bc0"
)
```

Run it: `python3 -c "$(<this script>)"`. If the assertion holds, your Python
implementation is byte-compatible with the reference.

---

## 5. Conformance checklist for re-implementations

A new implementation is conformant iff it produces, for every `(version, kind,
payload, nonce, actor, taint)` tuple representable as JSON, the same hex
digest as the Node reference. Concretely:

- [ ] Object keys are sorted lexicographically by UTF-16 code unit.
- [ ] Object properties with absent / `undefined` / `None`-equivalent values
      are omitted (not encoded as `null`).
- [ ] Array elements with absent / `undefined` values are encoded as `null`
      (not omitted).
- [ ] `null` (the explicit JSON value) is preserved as `null` in the output.
- [ ] Non-ASCII characters in strings are encoded as literal UTF-8, not as
      `\uXXXX` escapes.
- [ ] Numbers serialize via ES2015 `Number.prototype.toString` rules.
- [ ] No whitespace anywhere in the output.
- [ ] The final digest is lowercase hex SHA-256 over the UTF-8 bytes.
- [ ] All six golden vectors in `hash-golden-vectors.test.ts` produce the
      documented digests.

---

## 6. Versioning

This spec is anchored to `IntentEnvelope v2`. A future `v3` would publish a
new spec (e.g. `canonical-json-hash-v2.md`) and bump
`INTENT_ENVELOPE_VERSION`; v2 envelopes would continue to verify against this
document indefinitely. The hash recipe field set
(`{version, kind, payload, nonce, actor, taint}`) is itself part of the v2
contract — adding or removing fields requires a major envelope version bump.

The `version` field is canonicalized identically to any other JSON number,
so different `version` values produce different hashes — there is no hash
collision risk between v2 and a hypothetical v3 envelope with otherwise
identical contents.
