# Canonical JSON hashing for `IntentEnvelope.intentHash`

> **Status.** Normative. Describes the byte-stable algorithm that produces
> the `intentHash` field of every [`IntentEnvelope v2`](./intent-envelope-v2.schema.json).
> External (non-Node) re-implementations MUST conform to this spec to remain
> interoperable with the reference implementation in
> [`packages/canonical/src/index.ts`](../../packages/canonical/src/index.ts)
> (re-exported unchanged from [`packages/core/src/hash.ts`](../../packages/core/src/hash.ts)).

---

## 1. Why this spec exists

`intentHash` is the load-bearing replay key consumed by the Execution Ledger.
Two implementations that disagree on the hash for the same envelope cannot
interoperate — duplicate-delivery suppression breaks, cross-language replay
fails, and audit verification across runtimes becomes impossible.

This document fixes the algorithm so a Rust, Go, Python, or browser-side
implementation can produce the same hash as the reference TypeScript
implementation.

The reference implementation in `packages/canonical/src/index.ts` (re-exported
unchanged from `packages/core/src/hash.ts`) is **conformant** with this spec,
not normative. If the implementation and this spec ever diverge, the spec is
authoritative and the implementation is a bug.

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

### 2.5 Input contract

Hash inputs MUST be **plain JSON-representable values**: `string`, `number`
(finite), `boolean`, `null`, `Array`, or plain `Object` with string keys and
JSON-representable values.

Behavior on non-JSON types is **implementation-defined** and SHOULD be treated
as an error by conformant implementations:

| Input type | Reference implementation behavior |
|---|---|
| `BigInt` | Throws `TypeError` (from `JSON.stringify`) |
| `Symbol` value in array | Silently encoded as `null` (JSON.stringify behavior) |
| `Symbol` value in object | Key silently dropped (JSON.stringify behavior) |
| `function` value in object | Key silently dropped (JSON.stringify behavior) |
| `Date` instance | Encoded as `{}` (empty object) — `.toJSON()` is NOT called because `Object.entries(date)` returns no own enumerable properties. This DIFFERS from a bare `JSON.stringify(date)` call. |
| `Map` / `Set` instance | Encoded as `{}` (empty object) |

Cross-runtime implementations (Rust, Go, Python) that receive pre-validated
JSON payloads will never encounter these types. TypeScript implementations
operating on user-supplied payloads SHOULD validate inputs before hashing;
the `IntentEnvelope.payload` field is typed as `unknown` and adopters must
ensure it contains only JSON-safe values.

The shared `canonicalJson` in
[`packages/conformance/src/canonical-json.ts`](../../packages/conformance/src/canonical-json.ts)
(imported by `pack-trust.ts`, `config-seal.ts`, and `ai-bom.ts` for Pack
fingerprints, config seals, and AI-BOM digests) throws
`canonicalJson: unsupported value type (${typeof value})` on any `typeof value`
not in `{null, boolean, number, string, array, object}`. That fail-closed
behavior is the stricter, preferred default for new implementations.

---

## 3. Reference implementation

The canonical implementation lives in [`packages/canonical/src/index.ts`](../../packages/canonical/src/index.ts)
(extracted from `@adjudicate/core` so the kernel and runtime adopters can share
one encoder). `@adjudicate/core` re-exports `canonicalJson` / `sha256Canonical`
unchanged from [`packages/core/src/hash.ts`](../../packages/core/src/hash.ts).

```ts
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.normalize("NFC"); // NFC per RFC 8785
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(
        `canonical-JSON: non-finite number (${String(value)}) has no canonical representation (RFC 8785 §3.2.2.3)`,
      );
    }
    return value;
  }
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
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}
```

Notes for re-implementers:

- The canonical implementation has migrated from `node:crypto` to
  `@noble/hashes` — a sync, pure-JS SHA-256 that runs identically in Node,
  browser, and edge runtimes. The earlier `node:crypto.createHash("sha256")`
  call is NOT part of the normative algorithm — it was a pre-migration
  implementation detail (it broke Next.js client bundles) and must not be
  copied by re-implementers targeting edge or browser environments. Output
  bytes are identical between the two. Use a runtime-agnostic SHA-256 (e.g.
  `@noble/hashes`, WebCrypto `SubtleCrypto.digest`, or a native library).
- **String NFC normalization is mandatory.** All string values MUST be
  Unicode-NFC-normalized before serialization. Visually identical strings in
  different Unicode normalization forms (NFC vs NFD vs NFKC) MUST produce the
  same hash.
- **Non-finite numbers MUST throw.** `NaN` / `Infinity` / `-Infinity` have no
  canonical representation (RFC 8785 §3.2.2.3); the reference implementation
  throws rather than letting `JSON.stringify` silently collide all three onto
  `null`.
- `JSON.stringify` (Node ≥ 18 / browser) emits ECMAScript-conformant numbers,
  sorts no keys (we sort them ourselves), preserves UTF-8 in strings (no `\u`
  escapes for non-ASCII), and uses no whitespace. With the key-sorting and
  undefined-filtering from `canonicalize`, this produces output
  byte-equivalent to RFC 8785 canonicalization for the input shapes this
  framework emits.
- A Rust implementation backed by `serde_json::ser::CanonicalFormatter` plus
  manual key-sorting will produce identical output for the same input.
- A Python implementation MUST NOT use `json.dumps(..., sort_keys=True,
  ensure_ascii=False, separators=(',', ':'))` directly without first
  filtering `None` keys and NFC-normalizing strings — Python's `json.dumps`
  handles dict ordering and whitespace correctly but does not omit anything
  and does not normalize Unicode; preprocessing is required.
- Any change to `packages/canonical/src/index.ts` MUST also update this §3
  code sample. They are mirrors; the package is the authority if they ever
  diverge.

---

## 4. Cross-runtime check (Python)

The following Python is provided as a literal cross-runtime check, not as a
dependency. It produces the same hash as the reference Node implementation
for the golden vectors in
[`packages/core/tests/hash-golden-vectors.test.ts`](../../packages/core/tests/hash-golden-vectors.test.ts).
The cross-repo conformance fixture
[`packages/canonical/golden-vectors.json`](../../packages/canonical/golden-vectors.json)
is the source of truth shared with claustrum's proof hasher (mirrored test:
`packages/canonical/tests/golden-vectors.test.ts`).

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
