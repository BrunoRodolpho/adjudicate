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

// ─────────────────────────────────────────────────────────────────────────
// 032 · Injected-snapshot serialization (authority-graph + future snapshots)
// ─────────────────────────────────────────────────────────────────────────
//
// The merged architecture injects IMMUTABLE SNAPSHOTS into the one kernel
// decision (index §B): authority-graph facts, aggregate/limit snapshots,
// compliance signals, the signed policy bundle. Each is recorded into the audit
// record so the pure kernel REPLAYS over the recorded inputs bit-identically
// (index §D, invariant #5). For that to hold, a snapshot must serialize the
// SAME way the kernel hashes `intentHash` — RFC 8785 / JCS via THIS encoder,
// never a fork (index §B canonical-JSON caveat; 032 §3/§7).
//
// `canonicalSnapshot` / `sha256SnapshotCanonical` are thin, intent-revealing
// aliases over `canonicalJson` / `sha256Canonical`: they DELEGATE byte-for-byte
// (no forked canonicalizer — same NFC normalization, same RangeError on
// non-finite, same undefined-elision) so a recorded authority-graph snapshot
// (032) replays exactly. The dedicated names give snapshot call sites (032 T3,
// 033 inject, 052 aggregate) a self-documenting hook without re-implementing
// canonicalization. Generic over `unknown` because `@adjudicate/canonical` sits
// BELOW `@adjudicate/core` in the package graph and cannot import the
// `AuthorityGraph` type; core passes the typed snapshot in.

/**
 * Serialize an injected snapshot (e.g. an authority-graph snapshot, 032) to
 * canonical JSON. Identical bytes to `canonicalJson` — provided as a
 * self-documenting alias for snapshot serialization call sites so a recorded
 * snapshot replays bit-identically (invariant #5). No forked canonicalizer.
 */
export function canonicalSnapshot(snapshot: unknown): string {
  return canonicalJson(snapshot);
}

/**
 * Content-address an injected snapshot (e.g. an authority-graph snapshot, 032):
 * sha256 hex over its canonical JSON. Identical bytes to `sha256Canonical` —
 * the dedicated name pins snapshot hashing to THIS encoder (RFC 8785 / JCS) so
 * a recorded snapshot replays bit-identically and never drifts from `intentHash`
 * semantics (NFC, fail-on-non-finite). No forked canonicalizer.
 */
export function sha256SnapshotCanonical(snapshot: unknown): string {
  return sha256Canonical(snapshot);
}
