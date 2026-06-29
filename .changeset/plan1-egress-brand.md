---
"@adjudicate/core": minor
---

Plan 1 / Theorem E (E-1) — `RenderedReply`, the runtime-non-forgeable carrier for customer-facing egress text.

This minor bump lands the new surface in `@adjudicate/core` **1.8.0** (main is at 1.7.0; this minor changeset computes 1.7.0 → 1.8.0). Downstream consumers that import the minter set must require `@adjudicate/core` >= 1.8.0.

Additive new surface in `@adjudicate/core` (`src/rendered-reply.ts`, re-exported from the barrel):

- `RenderedReply` — opaque branded object type (`{ readonly text: string }` + a module-private `unique symbol` brand that is NOT exported, so external code cannot name the key).
- Closed minter set: `mintRenderedReply` (claims→prose), the operational factories `mintCronReply` / `mintReceiptReply` / `mintOtpReply` / `mintBroadcastReply` / `mintFallbackReply`, and the transitional, `@deprecated` `wrapLegacyResponderText` (W4→W5 seam).
- `unwrapRendered(reply)` — the egress gate; asserts the value is in a module-private `WeakSet` of genuinely-minted replies and throws on a forged/structural literal.

Why an object wrapper (not a branded string): tsc erases a string brand, so a branded string is forgeable at runtime with no membership test. A heap object trackable in a `WeakSet` gives `unwrapRendered` a real provenance check at the boundary (Theorem E demands runtime, not just compile-time, non-forgeability).

Defense-in-depth: (a) the brand symbol is never exported; (b) the runtime WeakSet membership assert in `unwrapRendered`; (c) a shared-eslint-config `no-restricted-syntax` ban on `x as RenderedReply` (and the nested `as any as RenderedReply`), with the minter module exempt.

This `@adjudicate/core` **1.8.0** also carries the Plan 1 Phase 4 (W6) soundness conjuncts that harden the §5 claim predicate (additive, fail-safe, demote-only — they can only turn a VALIDATED into UNKNOWN/REFUSED, never promote, so every existing claim type keeps compiling and validating exactly as before until W5 opts in):

- **C6 claim value-binding** (`src/claims/soundness.ts`; Theorem S precondition (a-value)) — `MinimalClaim` gains an OPTIONAL `value` + `valueBinding { key, path? }`. When declared, `claimAllowed` binds the claim's RENDERED value to its licensing evidence entry's value via the canonical `sameValue` (the SAME comparator P2/H3 use): an in-grammar mismatch → REFUSED (the round-2 (a-value) model-authored-surplus catch — a confabulated value can no longer ride the surplus channel through an otherwise-valid claim); an unprovable binding (bound key absent, or a value outside the closed scalar grammar) → UNKNOWN (abstain). With no `valueBinding`, §5 stays value-agnostic (no-op). `runClaimsKernel` threads `candidate.value` into the soundness input so the catch holds end-to-end. New exported type: `ValueBinding`.

Still progressive across the W6 wave (NOT all in this change): the falsifier-completeness gate + the §R registry-load error, the cross-key conflict table, and the structural-provenance write-guard/hook land as their own commits; ibatexas adoption (declaring falsifiers + value-bindings per type, render-from-claims wiring, the decomposer) is W5.

E-1 only for the egress brand — closed minters, enforcement, and retyped signatures land progressively; call-site value-binding (E-2) is a later wave. No existing export changes.
