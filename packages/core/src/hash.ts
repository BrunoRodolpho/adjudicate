/**
 * Canonical hashing for IntentEnvelopes — re-exported from @adjudicate/canonical.
 *
 * The canonical-JSON + sha256 implementation now lives in the standalone
 * `@adjudicate/canonical` package so the kernel and runtime adopters (e.g.
 * `@claustrum/grounding-pgvector` grounding proofs) share ONE encoder instead
 * of each forking a copy that can silently drift. This module preserves core's
 * historical import path — `canonicalJson` / `sha256Canonical` remain available
 * from `@adjudicate/core` exactly as before; the bytes are identical.
 *
 * **Normative spec**: `docs/specs/canonical-json-hash.md` (RFC 8785 / JCS).
 * Golden vectors live in `@adjudicate/canonical/golden-vectors.json`; core's
 * `tests/hash-golden-vectors.test.ts` pins the same hashes against this
 * re-export, so a drift in the shared package fails core's suite too.
 */

export { canonicalJson, sha256Canonical } from "@adjudicate/canonical";
