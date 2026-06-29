---
"@adjudicate/core": minor
---

Plan 1 / Theorem E (E-1) — `RenderedReply`, the runtime-non-forgeable carrier for customer-facing egress text.

Additive new surface in `@adjudicate/core` (`src/rendered-reply.ts`, re-exported from the barrel):

- `RenderedReply` — opaque branded object type (`{ readonly text: string }` + a module-private `unique symbol` brand that is NOT exported, so external code cannot name the key).
- Closed minter set: `mintRenderedReply` (claims→prose), the operational factories `mintCronReply` / `mintReceiptReply` / `mintOtpReply` / `mintBroadcastReply` / `mintFallbackReply`, and the transitional, `@deprecated` `wrapLegacyResponderText` (W4→W5 seam).
- `unwrapRendered(reply)` — the egress gate; asserts the value is in a module-private `WeakSet` of genuinely-minted replies and throws on a forged/structural literal.

Why an object wrapper (not a branded string): tsc erases a string brand, so a branded string is forgeable at runtime with no membership test. A heap object trackable in a `WeakSet` gives `unwrapRendered` a real provenance check at the boundary (Theorem E demands runtime, not just compile-time, non-forgeability).

Defense-in-depth: (a) the brand symbol is never exported; (b) the runtime WeakSet membership assert in `unwrapRendered`; (c) a shared-eslint-config `no-restricted-syntax` ban on `x as RenderedReply` (and the nested `as any as RenderedReply`), with the minter module exempt.

E-1 only — brand carrier, closed minters, enforcement, and retyped signatures land progressively; call-site value-binding (E-2) and claim value-binding (C6) are later waves and are NOT in this change. No existing export changes.
