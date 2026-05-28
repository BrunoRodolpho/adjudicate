/**
 * @adjudicate/canonical — the single source of truth for canonical-JSON
 * (RFC 8785 / JCS) serialization and sha256-over-canonical hashing.
 *
 * Extracted verbatim from `@adjudicate/core`'s `hash.ts` so the kernel AND
 * runtime adopters (e.g. `@claustrum/grounding-pgvector` grounding proofs)
 * depend on ONE encoder instead of each forking a copy that can silently
 * drift — a drift between two canonicalizers makes content-addressed hashes
 * (intentHash, proofHash) disagree across the boundary, and verification
 * fails undetectably.
 *
 * **Normative spec**: `docs/specs/canonical-json-hash.md` (RFC 8785 / JCS).
 * **Conformance lock**: `golden-vectors.json` + `tests/golden-vectors.test.ts`.
 * Any re-implementation (this package, the claustrum proof hasher, a future
 * Rust/Go port) MUST reproduce the golden vectors byte-for-byte. Both repos
 * commit the same fixture and test against it; if either implementation
 * drifts, that repo's test fails.
 *
 * Uses @noble/hashes — a sync, pure-JS SHA-256 that runs identically in Node
 * and the browser (an earlier `node:crypto` import broke Next client bundles).
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Recursively canonicalize a value: objects get their keys sorted, arrays stay
 * ordered, primitives pass through. null and undefined are normalized —
 * undefined fields are omitted so `{a: undefined}` and `{}` hash identically.
 *
 * Two correctness rules the encoder enforces (RFC 8785 §3.2.2):
 *   - **Strings are Unicode-NFC-normalized.** Visually identical strings in
 *     different normalization forms (e.g. "café" composed vs decomposed) MUST
 *     hash identically, or an adopter's NFD input silently mints a different
 *     intentHash/proofHash than the same NFC text (DataReviewer-008).
 *   - **Non-finite numbers throw.** NaN / Infinity / -Infinity have no JSON
 *     representation; JSON.stringify maps them to `null`, which collides three
 *     distinct values onto one hash. RFC 8785 §3.2.2.3 mandates fail-on-
 *     non-finite, so we throw rather than silently collide (CryptoReviewer-002).
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.normalize("NFC");
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

/** Serialize to canonical-JSON. No whitespace, deterministic key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Compute sha256 hex over the canonical JSON of the input. */
export function sha256Canonical(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}
