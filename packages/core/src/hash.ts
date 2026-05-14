/**
 * Canonical hashing for IntentEnvelopes.
 *
 * sha256 over a canonical JSON serialization — key order is deterministic so
 * the same envelope produces the same intentHash regardless of construction
 * order. This is the replay key consumed by the Execution Ledger.
 *
 * Uses @noble/hashes — a sync, pure-JS SHA-256 that runs identically in Node
 * and the browser. Replaces an earlier `node:crypto` import that broke Next
 * client bundles (see ADR follow-ups). The output is byte-identical.
 *
 * **Normative spec**: `docs/specs/canonical-json-hash.md` (RFC 8785 / JCS).
 * Golden vectors live in `packages/core/tests/hash-golden-vectors.test.ts`
 * and MUST also pass against any external (Rust/Go/Python) re-implementation
 * claiming byte-compatibility. The implementation here is *conformant*; the
 * spec is *authoritative* — divergence indicates a bug in the implementation,
 * not the spec.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Recursively canonicalize a value: objects get their keys sorted, arrays stay
 * ordered, primitives pass through. null and undefined are normalized — undefined
 * fields are omitted so `{a: undefined}` and `{}` hash identically.
 */
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

/** Compute sha256 hex over the canonical JSON of the input. */
export function sha256Canonical(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}
